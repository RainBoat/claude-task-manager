#!/usr/bin/env bash
set -euo pipefail

# This script runs as root to fix volume permissions,
# then drops to the 'claude' user for the actual entrypoint.

# Fix ownership of the mounted data volume
chown -R claude:claude /app/data

# Drop to claude user and run the real entrypoint
exec gosu claude /app/entrypoint.sh "$@"
