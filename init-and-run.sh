#!/usr/bin/env bash
set -euo pipefail

# This script runs as root to fix volume permissions,
# then drops to the 'claude' user for the actual entrypoint.

# Fix ownership of the mounted data volume
chown -R claude:claude /app/data

# Grant claude user access to Docker socket (for container mode)
if [ -S /var/run/docker.sock ]; then
    DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
    if ! getent group "$DOCKER_GID" >/dev/null 2>&1; then
        groupadd -g "$DOCKER_GID" dockerhost
    fi
    DOCKER_GROUP=$(getent group "$DOCKER_GID" | cut -d: -f1)
    usermod -aG "$DOCKER_GROUP" claude 2>/dev/null || true
fi

# Drop to claude user and run the real entrypoint
exec gosu claude /app/entrypoint.sh "$@"
