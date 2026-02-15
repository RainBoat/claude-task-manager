FROM docker.1ms.run/library/node:20-bookworm

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    git jq procps curl vim-tiny gosu \
    && rm -rf /var/lib/apt/lists/*

# Python venv to avoid PEP 668 issues
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Python dependencies (use Chinese mirror)
COPY manager/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r /tmp/requirements.txt

# Claude Code (use Chinese npm mirror)
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g @anthropic-ai/claude-code

# Create non-root user (Claude Code refuses --dangerously-skip-permissions as root)
RUN useradd -m -s /bin/bash claude && \
    mkdir -p /app /home/claude/.claude && \
    chown -R claude:claude /app /home/claude

# Install frontend dependencies first (cache layer)
COPY frontend/package.json frontend/package-lock.json /app/frontend/
RUN cd /app/frontend && npm ci

# App directory — copy everything
WORKDIR /app
COPY --chown=claude:claude . /app/

# Build frontend (after COPY so source files are present; output to manager/static/dist/)
RUN cd /app/frontend && npm run build

# Make scripts executable
RUN chmod +x /app/entrypoint.sh /app/worker/ralph.sh /app/worker/merge_and_test.sh /app/init-and-run.sh

# Data volume mount point
RUN mkdir -p /app/data/logs /app/data/worktrees && \
    chown -R claude:claude /app/data

EXPOSE 8420

# Start as root to fix volume permissions, then drop to claude user
ENTRYPOINT ["/app/init-and-run.sh"]
