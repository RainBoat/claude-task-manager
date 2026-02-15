#!/usr/bin/env bash
set -euo pipefail

echo "=== Claude Parallel Dev System (Multi-Project) ==="
echo "Workers: ${WORKER_COUNT:-3}"
echo "Port:    ${WEB_PORT:-8420}"

# --- Git config ---
git config --global user.name "${GIT_USER_NAME:-Claude Worker}"
git config --global user.email "${GIT_USER_EMAIL:-claude-worker@dev.local}"
git config --global init.defaultBranch main

# --- Paths ---
PROJECTS_DIR="/app/data/projects"
REGISTRY_FILE="/app/data/projects.json"
OLD_TASKS_FILE="/app/data/dev-tasks.json"
OLD_REPO_DIR="/app/data/repo"

mkdir -p "$PROJECTS_DIR"

# --- 1. Migrate legacy single-project data (if exists) ---
if [ -f "$OLD_TASKS_FILE" ] && [ ! -f "$REGISTRY_FILE" ]; then
    echo "Migrating legacy single-project data..."
    DEFAULT_ID="default"
    DEFAULT_DIR="${PROJECTS_DIR}/${DEFAULT_ID}"
    mkdir -p "${DEFAULT_DIR}/logs" "${DEFAULT_DIR}/worktrees"

    # Move old repo
    if [ -d "$OLD_REPO_DIR/.git" ]; then
        mv "$OLD_REPO_DIR" "${DEFAULT_DIR}/repo"
        echo "  Moved repo/ → projects/${DEFAULT_ID}/repo/"
    else
        mkdir -p "${DEFAULT_DIR}/repo"
    fi

    # Move old tasks
    mv "$OLD_TASKS_FILE" "${DEFAULT_DIR}/tasks.json"
    echo "  Moved dev-tasks.json → projects/${DEFAULT_ID}/tasks.json"

    # Move old logs
    if [ -d "/app/data/logs" ] && [ "$(ls -A /app/data/logs 2>/dev/null)" ]; then
        cp -a /app/data/logs/* "${DEFAULT_DIR}/logs/" 2>/dev/null || true
        echo "  Copied logs → projects/${DEFAULT_ID}/logs/"
    fi

    # Determine project name and URL
    PROJ_NAME="default-project"
    PROJ_URL=""
    if [ -d "${DEFAULT_DIR}/repo/.git" ]; then
        PROJ_URL=$(git -C "${DEFAULT_DIR}/repo" remote get-url origin 2>/dev/null || echo "")
        if [ -n "$PROJ_URL" ]; then
            PROJ_NAME=$(basename "$PROJ_URL" .git)
        fi
    fi

    # Create registry
    cat > "$REGISTRY_FILE" << EOJSON
{
  "projects": [
    {
      "id": "${DEFAULT_ID}",
      "name": "${PROJ_NAME}",
      "repo_url": "${PROJ_URL}",
      "branch": "${REPO_BRANCH:-main}",
      "status": "ready",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%S)"
    }
  ]
}
EOJSON
    echo "  Created projects.json with migrated project"
fi

# --- 2. If no registry and REPO_URL is set, create first project ---
if [ ! -f "$REGISTRY_FILE" ]; then
    REPO_URL="${REPO_URL:-}"
    if [ -n "$REPO_URL" ] && [ "$REPO_URL" != "https://github.com/your-org/your-repo.git" ]; then
        PROJ_NAME=$(basename "$REPO_URL" .git)
        FIRST_ID=$(python3 -c "import uuid; print(uuid.uuid4().hex[:8])")
        FIRST_DIR="${PROJECTS_DIR}/${FIRST_ID}"
        mkdir -p "${FIRST_DIR}/repo" "${FIRST_DIR}/logs" "${FIRST_DIR}/worktrees"

        echo "Creating initial project from REPO_URL: ${REPO_URL}"
        if git clone --branch "${REPO_BRANCH:-main}" "$REPO_URL" "${FIRST_DIR}/repo"; then
            STATUS="ready"
        else
            STATUS="error"
            echo "WARNING: Failed to clone repo."
        fi

        # Inject CLAUDE.md (excluded from git)
        if [ "$STATUS" = "ready" ] && [ ! -f "${FIRST_DIR}/repo/CLAUDE.md" ] && [ -f "/app/claude-md-template.md" ]; then
            cp /app/claude-md-template.md "${FIRST_DIR}/repo/CLAUDE.md"
            EXCLUDE_FILE="${FIRST_DIR}/repo/.git/info/exclude"
            mkdir -p "$(dirname "$EXCLUDE_FILE")" 2>/dev/null || true
            grep -qxF 'CLAUDE.md' "$EXCLUDE_FILE" 2>/dev/null || echo 'CLAUDE.md' >> "$EXCLUDE_FILE"
        fi

        # Initialize PROGRESS.md
        if [ "$STATUS" = "ready" ] && [ ! -f "${FIRST_DIR}/repo/PROGRESS.md" ]; then
            cat > "${FIRST_DIR}/repo/PROGRESS.md" << 'EOF'
# Development Progress

Automatically maintained by Claude workers. Each entry records task completion details and lessons learned.

---
EOF
        fi

        # Init empty tasks
        echo '{"tasks":[]}' > "${FIRST_DIR}/tasks.json"

        cat > "$REGISTRY_FILE" << EOJSON
{
  "projects": [
    {
      "id": "${FIRST_ID}",
      "name": "${PROJ_NAME}",
      "repo_url": "${REPO_URL}",
      "branch": "${REPO_BRANCH:-main}",
      "status": "${STATUS}",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%S)"
    }
  ]
}
EOJSON
        echo "Created project ${PROJ_NAME} (${FIRST_ID})"
    else
        # No REPO_URL — create empty registry
        echo '{"projects":[]}' > "$REGISTRY_FILE"
        echo "No REPO_URL configured. Empty project registry created."
    fi
fi

# --- 3. Initialize existing projects (fetch latest) ---
if [ -f "$REGISTRY_FILE" ]; then
    # Use tab-separated output to avoid shell word-splitting on JSON
    python3 -c "
import json
try:
    data = json.load(open('$REGISTRY_FILE'))
    for p in data.get('projects', []):
        print(p.get('id','') + '\t' + p.get('repo_url','') + '\t' + p.get('branch','main') + '\t' + p.get('status','ready'))
except Exception:
    pass
" | while IFS=$'\t' read -r project_id repo_url branch status; do
        [ -z "$project_id" ] && continue
        repo_dir="${PROJECTS_DIR}/${project_id}/repo"

        mkdir -p "${PROJECTS_DIR}/${project_id}/logs" "${PROJECTS_DIR}/${project_id}/worktrees"

        # Init tasks.json if missing
        if [ ! -f "${PROJECTS_DIR}/${project_id}/tasks.json" ]; then
            echo '{"tasks":[]}' > "${PROJECTS_DIR}/${project_id}/tasks.json"
        fi

        if [ "$status" = "ready" ] && [ -d "$repo_dir/.git" ]; then
            echo "Fetching latest for project ${project_id}..."
            git -C "$repo_dir" fetch origin 2>/dev/null || true
        elif [ "$status" = "ready" ] && [ ! -d "$repo_dir/.git" ] && [ -n "$repo_url" ]; then
            echo "Cloning repo for project ${project_id}..."
            mkdir -p "$repo_dir"
            git clone --branch "$branch" "$repo_url" "$repo_dir" 2>/dev/null || true
        fi

        # Inject CLAUDE.md if missing (excluded from git)
        if [ -d "$repo_dir/.git" ] && [ ! -f "$repo_dir/CLAUDE.md" ] && [ -f "/app/claude-md-template.md" ]; then
            cp /app/claude-md-template.md "$repo_dir/CLAUDE.md"
            EXCLUDE_FILE="$repo_dir/.git/info/exclude"
            mkdir -p "$(dirname "$EXCLUDE_FILE")" 2>/dev/null || true
            grep -qxF 'CLAUDE.md' "$EXCLUDE_FILE" 2>/dev/null || echo 'CLAUDE.md' >> "$EXCLUDE_FILE"
        fi

        # Initialize PROGRESS.md if missing
        if [ -d "$repo_dir/.git" ] && [ ! -f "$repo_dir/PROGRESS.md" ]; then
            cat > "$repo_dir/PROGRESS.md" << 'EOF'
# Development Progress

Automatically maintained by Claude workers. Each entry records task completion details and lessons learned.

---
EOF
        fi
    done
fi

# --- Ensure global logs directory (backwards compat for WebSocket) ---
mkdir -p /app/data/logs

# --- Start Web Manager (background) ---
echo "Starting Web Manager on port ${WEB_PORT:-8420}..."
cd /app/manager
uvicorn app:app --host 0.0.0.0 --port "${WEB_PORT:-8420}" &
MANAGER_PID=$!
cd /app

# --- Wait for manager to be ready ---
sleep 2
echo "Web Manager PID: $MANAGER_PID"

# --- Recover stale tasks from previous unclean shutdown ---
echo "Recovering stale tasks..."
RECOVERED=$(python3 -c "
import sys; sys.path.insert(0, '/app/manager')
from dispatcher import recover_stale_tasks
print(recover_stale_tasks())
" 2>/dev/null || echo "0")
echo "Recovered ${RECOVERED} stale task(s)"

# --- Start Workers ---
WORKER_COUNT="${WORKER_COUNT:-3}"
WORKER_PIDS=()

for i in $(seq 1 "$WORKER_COUNT"); do
    echo "Starting Worker $i..."
    WORKER_ID="worker-$i" \
    /app/worker/ralph.sh &
    WORKER_PIDS+=($!)
    echo "Worker $i PID: ${WORKER_PIDS[-1]}"
done

echo "=== All systems running ==="
echo "Dashboard: http://localhost:${WEB_PORT:-8420}"

# --- Wait for any process to exit ---
wait -n "$MANAGER_PID" "${WORKER_PIDS[@]}" 2>/dev/null || true

echo "A process exited. Shutting down..."
kill "$MANAGER_PID" "${WORKER_PIDS[@]}" 2>/dev/null || true
wait
