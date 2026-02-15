#!/usr/bin/env bash
set -uo pipefail

# === Ralph Loop Worker ===
# Each worker runs this script in a loop:
#   claim task → worktree → claude code → commit → merge+test → push → cleanup
# Now project-aware: paths derived from project_id in claimed task JSON.

WORKER_ID="${WORKER_ID:?WORKER_ID required}"
BRANCH_BASE="${REPO_BRANCH:-main}"

CLAIM_SCRIPT="/app/worker/claim_task.py"
MERGE_SCRIPT="/app/worker/merge_and_test.sh"
LOG_SCRIPT="/app/worker/log_experience.py"

echo "[${WORKER_ID}] Worker started. Polling for tasks (multi-project)..."

while true; do
    # --- 1. Claim next task (cross-project) ---
    TASK_JSON=$(python3 "$CLAIM_SCRIPT" claim "$WORKER_ID" 2>/dev/null) || true

    if [ -z "$TASK_JSON" ]; then
        sleep 30
        continue
    fi

    # Parse task fields including project_id
    PROJECT_ID=$(echo "$TASK_JSON" | jq -r '.project_id')
    TASK_ID=$(echo "$TASK_JSON" | jq -r '.id')
    TASK_TITLE=$(echo "$TASK_JSON" | jq -r '.title')
    TASK_DESC=$(echo "$TASK_JSON" | jq -r '.description')
    TASK_PLAN=$(echo "$TASK_JSON" | jq -r '.plan // empty')

    # Derive project-specific paths
    REPO_DIR="/app/data/projects/${PROJECT_ID}/repo"
    LOG_DIR="/app/data/projects/${PROJECT_ID}/logs"
    WORKTREE_BASE="/app/data/projects/${PROJECT_ID}/worktrees"

    # Ensure directories exist
    mkdir -p "$LOG_DIR" "$WORKTREE_BASE"

    echo "[${WORKER_ID}] Claimed task ${TASK_ID} in project ${PROJECT_ID}: ${TASK_TITLE}"

    # --- 2. Create worktree ---
    BRANCH_NAME="claude/${TASK_ID}"
    WORKTREE_DIR="${WORKTREE_BASE}/${WORKER_ID}"
    LOG_FILE="${LOG_DIR}/${WORKER_ID}.jsonl"

    # Clean up any stale worktree
    if [ -d "$WORKTREE_DIR" ]; then
        git -C "$REPO_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
    fi

    # Ensure we're on latest
    git -C "$REPO_DIR" fetch origin 2>/dev/null || true

    # Determine base ref
    if git -C "$REPO_DIR" rev-parse --verify "origin/${BRANCH_BASE}" >/dev/null 2>&1; then
        BASE_REF="origin/${BRANCH_BASE}"
    elif git -C "$REPO_DIR" rev-parse --verify "${BRANCH_BASE}" >/dev/null 2>&1; then
        BASE_REF="${BRANCH_BASE}"
    else
        BASE_REF="HEAD"
    fi

    # Create branch and worktree
    git -C "$REPO_DIR" branch -D "$BRANCH_NAME" 2>/dev/null || true
    git -C "$REPO_DIR" worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" "$BASE_REF" 2>/dev/null

    if [ $? -ne 0 ]; then
        echo "[${WORKER_ID}] Failed to create worktree for task ${TASK_ID}"
        python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "failed" --error "worktree creation failed"
        continue
    fi

    # Update task status
    python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "running" --branch "$BRANCH_NAME" 2>/dev/null

    # --- 3. Inject CLAUDE.md ---
    if [ -f "/app/claude-md-template.md" ]; then
        cp /app/claude-md-template.md "${WORKTREE_DIR}/CLAUDE.md"
    fi

    # --- 4. Build prompt ---
    PROMPT="You are working on task: ${TASK_TITLE}

Description: ${TASK_DESC}"

    if [ -n "$TASK_PLAN" ]; then
        PROMPT="${PROMPT}

Approved Plan (follow this plan):
${TASK_PLAN}"
    fi

    PROMPT="${PROMPT}

Instructions:
1. Implement the changes described above.
2. Make sure all changes are correct and complete.
3. Stage and commit your changes with a descriptive commit message.
4. Do NOT push — the CI system will handle that."

    echo "[${WORKER_ID}] Running Claude Code in ${WORKTREE_DIR}..."

    # --- 5. Run Claude Code ---
    cd "$WORKTREE_DIR"
    : > "$LOG_FILE"  # truncate log file

    claude -p "$PROMPT" \
        --dangerously-skip-permissions \
        --output-format stream-json \
        --verbose \
        > "$LOG_FILE" 2>&1

    CLAUDE_EXIT=$?
    cd /app

    if [ $CLAUDE_EXIT -ne 0 ]; then
        echo "[${WORKER_ID}] Claude Code failed for task ${TASK_ID} (exit: ${CLAUDE_EXIT})"
        python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "failed" --error "claude exit code ${CLAUDE_EXIT}"
        git -C "$REPO_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
        git -C "$REPO_DIR" branch -D "$BRANCH_NAME" 2>/dev/null || true
        continue
    fi

    # --- 6. Check if there are commits ---
    COMMIT_ID=$(git -C "$WORKTREE_DIR" rev-parse HEAD 2>/dev/null)
    if git -C "$REPO_DIR" rev-parse --verify "origin/${BRANCH_BASE}" >/dev/null 2>&1; then
        BASE_COMMIT=$(git -C "$REPO_DIR" rev-parse "origin/${BRANCH_BASE}" 2>/dev/null)
    else
        BASE_COMMIT=$(git -C "$REPO_DIR" rev-parse "${BRANCH_BASE}" 2>/dev/null || git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null)
    fi

    if [ "$COMMIT_ID" = "$BASE_COMMIT" ]; then
        echo "[${WORKER_ID}] No commits made for task ${TASK_ID}, checking for unstaged changes..."
        if [ -n "$(git -C "$WORKTREE_DIR" status --porcelain)" ]; then
            git -C "$WORKTREE_DIR" add -A
            git -C "$WORKTREE_DIR" commit -m "feat: ${TASK_TITLE} (task ${TASK_ID})"
            COMMIT_ID=$(git -C "$WORKTREE_DIR" rev-parse HEAD)
        else
            echo "[${WORKER_ID}] No changes for task ${TASK_ID}"
            python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "completed" --commit "no-changes"
            git -C "$REPO_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
            git -C "$REPO_DIR" branch -D "$BRANCH_NAME" 2>/dev/null || true
            continue
        fi
    fi

    # --- 7. Merge and test ---
    python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "merging" 2>/dev/null

    WORKTREE_DIR="$WORKTREE_DIR" \
    REPO_DIR="$REPO_DIR" \
    BRANCH_BASE="$BRANCH_BASE" \
    WORKER_ID="$WORKER_ID" \
    TASK_ID="$TASK_ID" \
    bash "$MERGE_SCRIPT"

    MERGE_EXIT=$?

    if [ $MERGE_EXIT -ne 0 ]; then
        echo "[${WORKER_ID}] Merge/test failed for task ${TASK_ID}"
        python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "failed" --error "merge or test failed after retries"
        git -C "$REPO_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
        git -C "$REPO_DIR" branch -D "$BRANCH_NAME" 2>/dev/null || true
        continue
    fi

    # --- 8. Merge to main and push ---
    FINAL_COMMIT=$(git -C "$WORKTREE_DIR" rev-parse HEAD)
    HAS_REMOTE=$(git -C "$WORKTREE_DIR" remote 2>/dev/null)

    git -C "$REPO_DIR" merge "$BRANCH_NAME" --no-edit 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "[${WORKER_ID}] Merge to main failed for task ${TASK_ID}, attempting auto-resolve..."
        git -C "$REPO_DIR" merge --abort 2>/dev/null || true
    fi

    if [ -n "$HAS_REMOTE" ]; then
        git -C "$REPO_DIR" push origin "${BRANCH_BASE}" 2>/dev/null
        if [ $? -ne 0 ]; then
            echo "[${WORKER_ID}] Push failed for task ${TASK_ID} (non-fatal)"
        fi
    else
        echo "[${WORKER_ID}] No remote configured, skipping push"
    fi

    echo "[${WORKER_ID}] Task ${TASK_ID} completed. Commit: ${FINAL_COMMIT}"
    python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "completed" --commit "$FINAL_COMMIT"

    # --- 9. Log experience ---
    python3 "$LOG_SCRIPT" \
        --repo-dir "$REPO_DIR" \
        --task-id "$TASK_ID" \
        --task-title "$TASK_TITLE" \
        --worker-id "$WORKER_ID" \
        --commit-id "$FINAL_COMMIT" \
        --log-file "$LOG_FILE" 2>/dev/null || true

    # --- 10. Cleanup worktree ---
    git -C "$REPO_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
    git -C "$REPO_DIR" branch -D "$BRANCH_NAME" 2>/dev/null || true

    echo "[${WORKER_ID}] Cleanup done. Looping..."
done
