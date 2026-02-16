#!/usr/bin/env bash
set -uo pipefail

# === Single-Task Worker Container Script ===
# Runs inside an isolated Docker container. Executes one task then exits.
#
# Environment variables (set by manager):
#   TASK_ID, TASK_TITLE, TASK_DESC, TASK_PLAN (optional)
#   PROJECT_ID, PROJECT_NAME, WORKER_ID
#   MANAGER_URL (e.g. http://host.docker.internal:8420)
#   BRANCH_NAME, BASE_REF
#   ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL (optional)

TASK_ID="${TASK_ID:?TASK_ID required}"
TASK_TITLE="${TASK_TITLE:?TASK_TITLE required}"
TASK_DESC="${TASK_DESC:?TASK_DESC required}"
TASK_PLAN="${TASK_PLAN:-}"
PROJECT_ID="${PROJECT_ID:?PROJECT_ID required}"
PROJECT_NAME="${PROJECT_NAME:-$PROJECT_ID}"
WORKER_ID="${WORKER_ID:?WORKER_ID required}"
MANAGER_URL="${MANAGER_URL:?MANAGER_URL required}"
BRANCH_NAME="${BRANCH_NAME:-claude/$TASK_ID}"
LOG_FILE="/logs/${WORKER_ID}.jsonl"

echo "[${WORKER_ID}] Container started for task ${TASK_ID}: ${TASK_TITLE}"

# --- Helper: notify manager of status change ---
notify_status() {
    local status="$1"
    shift
    local body="{\"status\":\"${status}\""
    while [ $# -gt 0 ]; do
        case "$1" in
            --branch) body="${body},\"branch\":\"$2\""; shift 2 ;;
            --commit) body="${body},\"commit\":\"$2\""; shift 2 ;;
            --error)  body="${body},\"error\":\"$2\"";  shift 2 ;;
            *) shift ;;
        esac
    done
    body="${body}}"
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
    EXPERIENCE=$(awk '/^## \[/{count++; if(count>n) exit} count>0' n=5 RS='(^|\n)(?=## \\[)' "$PROGRESS_FILE" 2>/dev/null | tail -c 3000)
    if [ -z "$EXPERIENCE" ]; then
        EXPERIENCE=$(tail -c 2000 "$PROGRESS_FILE" 2>/dev/null)
    fi
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

PROMPT="${PROMPT}

## Instructions
1. Review the historical experience above (if any) for relevant lessons before starting.
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
