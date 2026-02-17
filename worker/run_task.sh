#!/usr/bin/env bash
set -uo pipefail

# === Single-Task Worker Container Script ===
# Runs inside an isolated Docker container. Executes one task then exits.
#
# Environment variables (set by manager):
#   TASK_ID, TASK_TITLE, TASK_DESC, TASK_PLAN (optional)
#   CROSS_PROJECT_EXPERIENCE (optional)
#   PROJECT_ID, PROJECT_NAME, WORKER_ID
#   MANAGER_URL (e.g. http://host.docker.internal:8420)
#   BRANCH_NAME, BASE_REF
#   ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL (optional)

TASK_ID="${TASK_ID:?TASK_ID required}"
TASK_TITLE="${TASK_TITLE:?TASK_TITLE required}"
TASK_DESC="${TASK_DESC:?TASK_DESC required}"
TASK_PLAN="${TASK_PLAN:-}"
CROSS_PROJECT_EXPERIENCE="${CROSS_PROJECT_EXPERIENCE:-}"
PROJECT_ID="${PROJECT_ID:?PROJECT_ID required}"
PROJECT_NAME="${PROJECT_NAME:-$PROJECT_ID}"
WORKER_ID="${WORKER_ID:?WORKER_ID required}"
MANAGER_URL="${MANAGER_URL:?MANAGER_URL required}"
BRANCH_NAME="${BRANCH_NAME:-claude/$TASK_ID}"
LOG_FILE="/logs/${WORKER_ID}.jsonl"
MAX_PROGRESS_READ_CHARS="${MAX_PROGRESS_READ_CHARS:-12000}"
MAX_PROGRESS_PROMPT_CHARS="${MAX_PROGRESS_PROMPT_CHARS:-3000}"

echo "[${WORKER_ID}] Container started for task ${TASK_ID}: ${TASK_TITLE}"

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

# --- Helper: notify manager of status change ---
notify_status() {
    local status="$1"
    shift
    local branch=""
    local commit=""
    local error=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --branch) branch="$2"; shift 2 ;;
            --commit) commit="$2"; shift 2 ;;
            --error)  error="$2"; shift 2 ;;
            *) shift ;;
        esac
    done
    local body
    body=$(jq -n \
        --arg status "$status" \
        --arg branch "$branch" \
        --arg commit "$commit" \
        --arg error "$error" \
        '({status: $status}
          + (if $branch != "" then {branch: $branch} else {} end)
          + (if $commit != "" then {commit: $commit} else {} end)
          + (if $error != "" then {error: $error} else {} end))')
    curl -sf -X POST "${MANAGER_URL}/api/internal/tasks/${PROJECT_ID}/${TASK_ID}/status" \
        -H "Content-Type: application/json" \
        -d "$body" >/dev/null 2>&1 || true
}

# --- 1. Notify manager: running ---
notify_status "running" --branch "$BRANCH_NAME"

# --- 2. Git config (container-local) ---
git config --global user.name "Claude Worker"
git config --global user.email "claude-worker@dev.local"
git config --global init.defaultBranch main

# --- 2b. Verify git worktree integrity ---
if [ ! -e "/workspace/.git" ]; then
    echo "[${WORKER_ID}] ERROR: /workspace/.git missing — worktree not mounted correctly"
    notify_status "failed" --error "worktree .git missing"
    exit 1
fi
# .git should be a file (worktree link) protected by root ownership from worker-entrypoint.sh
if [ -f "/workspace/.git" ]; then
    GIT_LINK_BEFORE=$(cat /workspace/.git)
    echo "[${WORKER_ID}] Git worktree verified (root-protected): $(git -C /workspace rev-parse --abbrev-ref HEAD 2>/dev/null)"
else
    echo "[${WORKER_ID}] WARNING: .git is a directory, not a worktree link"
    GIT_LINK_BEFORE=""
fi

# --- 3. Read PROGRESS.md for historical experience ---
EXPERIENCE=""
PROGRESS_FILE="/workspace/PROGRESS.md"
if [ -f "$PROGRESS_FILE" ]; then
    # Bound read size first so a very large PROGRESS.md cannot expand prompt unexpectedly.
    PROGRESS_TAIL=$(tail -c "$MAX_PROGRESS_READ_CHARS" "$PROGRESS_FILE" 2>/dev/null || true)
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

# --- 4. Build prompt ---
PROMPT="## Context
You are working on the project \"${PROJECT_NAME}\".
Your working directory is: /workspace
You must ONLY create and modify files inside /workspace. Do NOT create files anywhere else.

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

if [ -n "$CROSS_PROJECT_EXPERIENCE" ]; then
    PROMPT="${PROMPT}

## Cross-Project Experience (apply only if analogous to this task):
${CROSS_PROJECT_EXPERIENCE}"
fi

PROMPT="${PROMPT}

## Instructions
1. Review the historical experience above (project + cross-project) for relevant lessons before starting.
2. First explore the project structure to understand the codebase before making changes.
3. Implement the changes described above — all new files and modifications must be within /workspace.
4. Make sure all changes are correct and complete.
5. Stage and commit your changes with a descriptive commit message.
6. Do NOT push — the CI system will handle that.
7. Do NOT modify any files outside /workspace.

## CRITICAL GIT RULES
- NEVER run 'rm -rf .git', 'rm .git', or 'git init'. The .git file is a worktree link — destroying it will lose ALL your work.
- If you see a .git file (not directory), that is NORMAL for a git worktree. Do NOT touch it.
- If 'git status' shows an error, do NOT try to fix it by reinitializing. Just use 'git add' and 'git commit' — they will work.
- Use 'git add' and 'git commit' normally — they work fine in a worktree."

echo "[${WORKER_ID}] Running Claude Code..."

# --- 5. Run Claude Code ---
: > "$LOG_FILE"

claude -p "$PROMPT" \
    --dangerously-skip-permissions \
    --output-format stream-json \
    --verbose \
    > "$LOG_FILE" 2>&1

CLAUDE_EXIT=$?

# --- 5b. Verify git worktree integrity after Claude ---
# .git is root-protected by worker-entrypoint.sh, so corruption should not happen.
# This is a safety net — if somehow .git was tampered with, fail fast.
if [ -n "$GIT_LINK_BEFORE" ]; then
    if [ -d "/workspace/.git" ]; then
        echo "[${WORKER_ID}] CRITICAL: .git was replaced with a directory despite root protection"
        notify_status "failed" --error "git worktree link destroyed (replaced with directory)"
        exit 1
    elif [ -f "/workspace/.git" ]; then
        GIT_LINK_AFTER=$(cat /workspace/.git)
        if [ "$GIT_LINK_BEFORE" != "$GIT_LINK_AFTER" ]; then
            echo "[${WORKER_ID}] CRITICAL: .git content was modified despite root protection"
            notify_status "failed" --error "git worktree link content modified"
            exit 1
        fi
    else
        echo "[${WORKER_ID}] CRITICAL: .git was deleted despite root protection"
        notify_status "failed" --error "git worktree link deleted"
        exit 1
    fi
fi

# Verify git still works
if ! git -C /workspace rev-parse --git-dir >/dev/null 2>&1; then
    echo "[${WORKER_ID}] ERROR: git repository corrupted after Claude run"
    notify_status "failed" --error "git repository corrupted"
    exit 1
fi

if [ $CLAUDE_EXIT -ne 0 ]; then
    echo "[${WORKER_ID}] Claude Code failed (exit: ${CLAUDE_EXIT})"
    notify_status "failed" --error "claude exit code ${CLAUDE_EXIT}"
    exit 1
fi

# --- 6. Check for commits ---
COMMIT_ID=$(git -C /workspace rev-parse HEAD 2>/dev/null || echo "")

# Check if there are uncommitted changes
if [ -n "$(git -C /workspace status --porcelain 2>/dev/null)" ]; then
    git -C /workspace add -A
    git -C /workspace commit -m "feat: ${TASK_TITLE} (task ${TASK_ID})" 2>/dev/null || true
    COMMIT_ID=$(git -C /workspace rev-parse HEAD 2>/dev/null || echo "")
fi

if [ -z "$COMMIT_ID" ]; then
    echo "[${WORKER_ID}] No commits produced"
    notify_status "failed" --error "no commits produced"
    exit 1
fi

# --- 7. Notify manager: merging (success) ---
echo "[${WORKER_ID}] Task complete. Commit: ${COMMIT_ID}"
notify_status "merging" --commit "$COMMIT_ID"

exit 0
