#!/bin/bash
# Runs as root. Protects .git worktree link, then drops to claude to run the task.
set -e

# Protect .git worktree link — make it owned by root so claude can't delete it.
# This prevents Claude Code (LLM) from running `rm -rf .git && git init` which
# would destroy the worktree link and lose all code.
if [ -f /workspace/.git ]; then
    chown root:root /workspace/.git
    chmod 444 /workspace/.git
    echo "[entrypoint] Protected /workspace/.git (owned by root, read-only)"
elif [ -d /workspace/.git ]; then
    echo "[entrypoint] WARNING: /workspace/.git is a directory, not a worktree link"
fi

# Ensure claude owns everything else in /workspace
find /workspace -mindepth 1 -maxdepth 1 ! -name .git -exec chown -R claude:claude {} +

# Set safe.directory for claude user
su -c "git config --global --add safe.directory /workspace" claude
su -c "git config --global --add safe.directory '*'" claude

# Drop to claude and run the actual task script
exec gosu claude /usr/local/bin/run_task.sh
