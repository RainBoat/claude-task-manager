#!/usr/bin/env bash
set -uo pipefail

# === Ralph Loop Worker ===
# Each worker runs this script in a loop:
#   claim task → worktree → claude code → commit → merge+test → push → cleanup
# Now project-aware: paths derived from project_id in claimed task JSON.

WORKER_ID="${WORKER_ID:?WORKER_ID required}"
BRANCH_BASE="${REPO_BRANCH:-main}"
MAX_PROGRESS_READ_CHARS="${MAX_PROGRESS_READ_CHARS:-12000}"
MAX_PROGRESS_PROMPT_CHARS="${MAX_PROGRESS_PROMPT_CHARS:-3000}"

CLAIM_SCRIPT="/app/worker/claim_task.py"
MERGE_SCRIPT="/app/worker/merge_and_test.sh"
LOG_SCRIPT="/app/worker/log_experience.py"
GLOBAL_QUERY_SCRIPT="/app/worker/query_global_experience.py"

truncate_for_prompt() {
    local text="$1"
    local max_chars="$2"
    local length="${#text}"

    if [ "$length" -le "$max_chars" ]; then
        printf "%s" "$text"
        return
    fi

    local keep_chars=$((max_chars - 80))
    if [ "$keep_chars" -le 0 ]; then
        printf "[TRUNCATED %d chars]\n" "$((length - max_chars))"
        return
    fi

    printf "[TRUNCATED %d chars, showing latest %d chars]\n%s" \
        "$((length - max_chars))" "$keep_chars" "${text: -$keep_chars}"
}

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

    # Clean up any worktree that still holds the target branch (e.g. from a previous worker)
    STALE_WT=$(git -C "$REPO_DIR" worktree list --porcelain 2>/dev/null | awk -v br="$BRANCH_NAME" '
        /^worktree /{wt=$2} /^branch refs\/heads\//{if($2=="refs/heads/"br) print wt}')
    if [ -n "$STALE_WT" ] && [ "$STALE_WT" != "$REPO_DIR" ]; then
        echo "[${WORKER_ID}] Removing stale worktree holding branch ${BRANCH_NAME}: ${STALE_WT}"
        git -C "$REPO_DIR" worktree remove --force "$STALE_WT" 2>/dev/null || rm -rf "$STALE_WT"
    fi
    git -C "$REPO_DIR" worktree prune 2>/dev/null || true

    # Create branch and worktree
    git -C "$REPO_DIR" branch -D "$BRANCH_NAME" 2>/dev/null || true
    if ! git -C "$REPO_DIR" worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" "$BASE_REF" 2>&1; then
        echo "[${WORKER_ID}] Failed to create worktree for task ${TASK_ID}"
        python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "failed" --error "worktree creation failed"
        continue
    fi

    # Update task status
    python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "running" --branch "$BRANCH_NAME" 2>/dev/null

    # --- 3. Inject CLAUDE.md (excluded from git so it won't be committed) ---
    if [ -f "/app/claude-md-template.md" ]; then
        cp /app/claude-md-template.md "${WORKTREE_DIR}/CLAUDE.md"
        # Exclude from git tracking via local exclude (not .gitignore, which would be committed)
        mkdir -p "${WORKTREE_DIR}/.git" 2>/dev/null || true
        EXCLUDE_FILE=$(git -C "$WORKTREE_DIR" rev-parse --git-dir 2>/dev/null)/info/exclude
        mkdir -p "$(dirname "$EXCLUDE_FILE")" 2>/dev/null || true
        grep -qxF 'CLAUDE.md' "$EXCLUDE_FILE" 2>/dev/null || echo 'CLAUDE.md' >> "$EXCLUDE_FILE"
    fi

    # --- 4. Read PROGRESS.md for historical experience ---
    EXPERIENCE=""
    PROGRESS_FILE="${REPO_DIR}/PROGRESS.md"
    if [ -f "$PROGRESS_FILE" ]; then
        # Bound read size first so a very large PROGRESS.md cannot expand prompt unexpectedly.
        PROGRESS_TAIL=$(tail -c "$MAX_PROGRESS_READ_CHARS" "$PROGRESS_FILE" 2>/dev/null || true)
        # Extract last 5 structured entries (each starts with "## [") from bounded tail.
        EXPERIENCE=$(printf "%s\n" "$PROGRESS_TAIL" | awk -v n=5 '
            /^## \[/ {idx++; sections[idx]=$0 ORS; next}
            {if (idx>0) sections[idx]=sections[idx] $0 ORS}
            END {
                start = idx - n + 1
                if (start < 1) start = 1
                for (i=start; i<=idx; i++) printf "%s", sections[i]
            }')
        if [ -z "$EXPERIENCE" ]; then
            EXPERIENCE="$PROGRESS_TAIL"
        fi
        EXPERIENCE=$(truncate_for_prompt "$EXPERIENCE" "$MAX_PROGRESS_PROMPT_CHARS")
    fi

    CROSS_EXPERIENCE=""
    if [ -f "$GLOBAL_QUERY_SCRIPT" ]; then
        CROSS_EXPERIENCE=$(python3 "$GLOBAL_QUERY_SCRIPT" \
            --project-id "$PROJECT_ID" \
            --task-title "$TASK_TITLE" \
            --task-desc "$TASK_DESC" \
            --max-entries 3 \
            --max-chars 2500 2>/dev/null || true)
    fi

    # --- 5. Build prompt ---
    # Get project name for context
    PROJECT_NAME=$(python3 "$CLAIM_SCRIPT" get-project-name "$PROJECT_ID" 2>/dev/null) || PROJECT_NAME="$PROJECT_ID"

    PROMPT="## Context
You are working on the project \"${PROJECT_NAME}\".
Your working directory is: ${WORKTREE_DIR}
You must ONLY create and modify files inside this directory. Do NOT create files in /app or any other directory outside your working directory.

## Task: ${TASK_TITLE}

Description: ${TASK_DESC}"

    if [ -n "$TASK_PLAN" ]; then
        PROMPT="${PROMPT}

## Approved Plan (follow this plan):
${TASK_PLAN}"
    fi

    if [ -n "$EXPERIENCE" ]; then
        PROMPT="${PROMPT}

## Historical Experience (learn from past tasks — avoid repeating mistakes):
${EXPERIENCE}"
    fi

    if [ -n "$CROSS_EXPERIENCE" ]; then
        PROMPT="${PROMPT}

## Cross-Project Experience (apply only if analogous to this task):
${CROSS_EXPERIENCE}"
    fi

    PROMPT="${PROMPT}

## Instructions
1. Review the historical experience above (project + cross-project) for relevant lessons before starting.
2. First explore the project structure to understand the codebase before making changes.
3. Implement the changes described above — all new files and modifications must be within your working directory (${WORKTREE_DIR}).
4. Make sure all changes are correct and complete.
5. Stage and commit your changes with a descriptive commit message.
6. Do NOT push — the CI system will handle that.
7. Do NOT modify any files outside your working directory. If the task seems to require changes to a different system, implement it within this project's codebase instead."

    echo "[${WORKER_ID}] Running Claude Code in ${WORKTREE_DIR}..."

    # --- 6. Run Claude Code ---
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

    # --- 8. Check project merge settings ---
    SETTINGS_JSON=$(python3 "$CLAIM_SCRIPT" get-settings "$PROJECT_ID" 2>/dev/null) || true
    AUTO_MERGE=$(echo "$SETTINGS_JSON" | jq -r '.auto_merge // true')
    AUTO_PUSH=$(echo "$SETTINGS_JSON" | jq -r '.auto_push // false')

    FINAL_COMMIT=$(git -C "$WORKTREE_DIR" rev-parse HEAD)
    HAS_REMOTE=$(git -C "$WORKTREE_DIR" remote 2>/dev/null)

    if [ "$AUTO_MERGE" = "true" ]; then
        # Auto merge mode: merge to main
        # Remove untracked CLAUDE.md from main repo to prevent merge conflicts
        rm -f "${REPO_DIR}/CLAUDE.md"

        # Ensure we're on the base branch before merging
        git -C "$REPO_DIR" checkout "$BRANCH_BASE" 2>/dev/null || {
            echo "[${WORKER_ID}] Cannot checkout ${BRANCH_BASE}, trying from origin..."
            git -C "$REPO_DIR" checkout -B "$BRANCH_BASE" "origin/${BRANCH_BASE}" 2>/dev/null || true
        }

        # Verify branch exists before merge
        if ! git -C "$REPO_DIR" rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
            echo "[${WORKER_ID}] Branch ${BRANCH_NAME} not found, skipping merge"
            python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "failed" --error "Branch ${BRANCH_NAME} not found for merge"
        else
            git -C "$REPO_DIR" merge "$BRANCH_NAME" --no-edit 2>/dev/null
            if [ $? -ne 0 ]; then
                echo "[${WORKER_ID}] Merge to main failed for task ${TASK_ID}, attempting auto-resolve..."
                git -C "$REPO_DIR" merge --abort 2>/dev/null || true
            fi

            # Push only if auto_push is enabled
            if [ "$AUTO_PUSH" = "true" ] && [ -n "$HAS_REMOTE" ]; then
                git -C "$REPO_DIR" push origin "${BRANCH_BASE}" 2>/dev/null
                if [ $? -ne 0 ]; then
                    echo "[${WORKER_ID}] Push failed for task ${TASK_ID} (non-fatal)"
                fi
            elif [ -z "$HAS_REMOTE" ]; then
                echo "[${WORKER_ID}] No remote configured, skipping push"
            else
                echo "[${WORKER_ID}] Auto-push disabled, skipping push"
            fi

            echo "[${WORKER_ID}] Task ${TASK_ID} completed. Commit: ${FINAL_COMMIT}"
            python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "completed" --commit "$FINAL_COMMIT"
        fi

        # --- 9. Log experience ---
        python3 "$LOG_SCRIPT" \
            --repo-dir "$REPO_DIR" \
            --project-id "$PROJECT_ID" \
            --project-name "$PROJECT_NAME" \
            --task-id "$TASK_ID" \
            --task-title "$TASK_TITLE" \
            --worker-id "$WORKER_ID" \
            --commit-id "$FINAL_COMMIT" \
            --log-file "$LOG_FILE" 2>/dev/null || true

        # --- 10. Cleanup worktree and branch ---
        git -C "$REPO_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
        git -C "$REPO_DIR" branch -D "$BRANCH_NAME" 2>/dev/null || true
        if [ -n "$HAS_REMOTE" ]; then
            git -C "$REPO_DIR" push origin --delete "$BRANCH_NAME" 2>/dev/null || true
        fi
    else
        # Manual merge mode: keep branch alive, mark as merge_pending
        echo "[${WORKER_ID}] Task ${TASK_ID} ready for manual merge. Branch: ${BRANCH_NAME}"
        python3 "$CLAIM_SCRIPT" update "$PROJECT_ID" "$TASK_ID" "merge_pending" --commit "$FINAL_COMMIT"

        # --- 9. Log experience ---
        python3 "$LOG_SCRIPT" \
            --repo-dir "$REPO_DIR" \
            --project-id "$PROJECT_ID" \
            --project-name "$PROJECT_NAME" \
            --task-id "$TASK_ID" \
            --task-title "$TASK_TITLE" \
            --worker-id "$WORKER_ID" \
            --commit-id "$FINAL_COMMIT" \
            --log-file "$LOG_FILE" 2>/dev/null || true

        # Cleanup worktree only (keep branch for manual merge)
        git -C "$REPO_DIR" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
    fi

    echo "[${WORKER_ID}] Cleanup done. Looping..."
done
