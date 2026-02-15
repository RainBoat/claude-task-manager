#!/usr/bin/env bash
set -uo pipefail

# === Merge and Test ===
# Rebase onto latest main, run tests, resolve conflicts with Claude if needed.
# Retries up to 3 times.

WORKTREE_DIR="${WORKTREE_DIR:?required}"
REPO_DIR="${REPO_DIR:?required}"
BRANCH_BASE="${BRANCH_BASE:-main}"
WORKER_ID="${WORKER_ID:-unknown}"
TASK_ID="${TASK_ID:-unknown}"

MAX_RETRIES=3
RETRY=0

while [ $RETRY -lt $MAX_RETRIES ]; do
    RETRY=$((RETRY + 1))
    echo "[${WORKER_ID}] Merge attempt ${RETRY}/${MAX_RETRIES} for task ${TASK_ID}"

    # Fetch latest
    git -C "$WORKTREE_DIR" fetch origin 2>/dev/null || true

    # Determine rebase target
    if git -C "$WORKTREE_DIR" rev-parse --verify "origin/${BRANCH_BASE}" >/dev/null 2>&1; then
        REBASE_TARGET="origin/${BRANCH_BASE}"
    elif git -C "$WORKTREE_DIR" rev-parse --verify "${BRANCH_BASE}" >/dev/null 2>&1; then
        REBASE_TARGET="${BRANCH_BASE}"
    else
        echo "[${WORKER_ID}] No rebase target found, skipping rebase"
        REBASE_TARGET=""
    fi

    # Attempt rebase
    if [ -z "$REBASE_TARGET" ] || git -C "$WORKTREE_DIR" rebase "$REBASE_TARGET" 2>/dev/null; then
        echo "[${WORKER_ID}] Rebase successful"
    else
        echo "[${WORKER_ID}] Rebase conflict detected, attempting resolution..."

        # Get list of conflicted files
        CONFLICTS=$(git -C "$WORKTREE_DIR" diff --name-only --diff-filter=U 2>/dev/null)

        if [ -z "$CONFLICTS" ]; then
            # No conflicts but rebase failed — abort and retry
            git -C "$WORKTREE_DIR" rebase --abort 2>/dev/null
            echo "[${WORKER_ID}] Rebase failed without conflicts, retrying..."
            sleep 5
            continue
        fi

        # Use Claude to resolve conflicts
        CONFLICT_PROMPT="There are git merge conflicts in the following files that need to be resolved:

${CONFLICTS}

Please resolve all merge conflicts by:
1. Reading each conflicted file
2. Choosing the correct resolution (keeping both changes where appropriate)
3. Removing all conflict markers (<<<<<<<, =======, >>>>>>>)
4. Staging the resolved files with git add

Do NOT commit — just resolve and stage."

        cd "$WORKTREE_DIR"
        claude -p "$CONFLICT_PROMPT" \
            --dangerously-skip-permissions \
            --output-format stream-json \
            > /dev/null 2>&1
        cd /app

        # Check if conflicts are resolved
        REMAINING=$(git -C "$WORKTREE_DIR" diff --name-only --diff-filter=U 2>/dev/null)
        if [ -n "$REMAINING" ]; then
            echo "[${WORKER_ID}] Conflicts still unresolved, aborting rebase"
            git -C "$WORKTREE_DIR" rebase --abort 2>/dev/null
            sleep 5
            continue
        fi

        # Continue rebase
        git -C "$WORKTREE_DIR" rebase --continue --no-edit 2>/dev/null || {
            git -C "$WORKTREE_DIR" rebase --abort 2>/dev/null
            sleep 5
            continue
        }
    fi

    # --- Run tests (if test script exists) ---
    TEST_EXIT=0
    if [ -f "${WORKTREE_DIR}/package.json" ]; then
        # Check if test script exists in package.json
        HAS_TEST=$(jq -r '.scripts.test // empty' "${WORKTREE_DIR}/package.json" 2>/dev/null)
        if [ -n "$HAS_TEST" ] && [ "$HAS_TEST" != "echo \"Error: no test specified\" && exit 1" ]; then
            echo "[${WORKER_ID}] Running npm test..."
            cd "$WORKTREE_DIR"
            npm install --silent 2>/dev/null
            npm test 2>/dev/null
            TEST_EXIT=$?
            cd /app
        fi
    elif [ -f "${WORKTREE_DIR}/pytest.ini" ] || [ -f "${WORKTREE_DIR}/setup.py" ] || [ -f "${WORKTREE_DIR}/pyproject.toml" ]; then
        echo "[${WORKER_ID}] Running pytest..."
        cd "$WORKTREE_DIR"
        python3 -m pytest --tb=short 2>/dev/null
        TEST_EXIT=$?
        cd /app
    fi

    if [ $TEST_EXIT -eq 0 ]; then
        echo "[${WORKER_ID}] Tests passed (or no tests configured)"
        exit 0
    fi

    echo "[${WORKER_ID}] Tests failed (exit: ${TEST_EXIT}), attempt ${RETRY}/${MAX_RETRIES}"

    if [ $RETRY -lt $MAX_RETRIES ]; then
        # Use Claude to fix test failures
        FIX_PROMPT="The tests are failing after merging. Please:
1. Run the tests to see the failures
2. Fix the code to make tests pass
3. Stage and commit the fix with message 'fix: resolve test failures for task ${TASK_ID}'"

        cd "$WORKTREE_DIR"
        claude -p "$FIX_PROMPT" \
            --dangerously-skip-permissions \
            --output-format stream-json \
            > /dev/null 2>&1
        cd /app
    fi
done

echo "[${WORKER_ID}] Merge/test failed after ${MAX_RETRIES} retries"
exit 1
