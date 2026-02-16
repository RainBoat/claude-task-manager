# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A parallel development task manager that orchestrates multiple Claude Code CLI workers to execute coding tasks concurrently across multiple git repositories. Tasks flow through a Kanban-style lifecycle, with optional plan-review gates, automatic merge/test, and experience logging.

## Architecture

Three layers, all running inside a single Docker container:

**Backend (Python/FastAPI)** — `manager/`
- `app.py` — FastAPI server with REST API, WebSocket log streaming, plan generation, voice transcription. Serves the React frontend from `static/dist/` (falls back to legacy vanilla JS UI in `templates/`).
- `dispatcher.py` — Task and project persistence using JSON files with `filelock` for concurrency. Cross-project task claiming for workers. Data lives in `/app/data/projects/{project_id}/`.
- `models.py` — Pydantic models for Project, Task, Worker, Plan. Task statuses: `pending → claimed → running → merging → testing → completed/failed/cancelled`. Plan mode adds `plan_pending → plan_approved` before execution.
- `worker_pool.py` — Tracks worker subprocess state, discovers PIDs via `/proc`, handles restarts. Singleton `pool` instance.
- `stream_parser.py` — Parses Claude Code `--output-format stream-json` JSONL logs for WebSocket streaming.

**Frontend (React/TypeScript/Tailwind)** — `frontend/`
- Vite + React 18 + Tailwind CSS 3. Bilingual (zh/en) via `i18n.ts` with a `t(key, lang)` helper.
- `api.ts` — All HTTP/WebSocket calls. API is project-scoped: `/api/projects/{id}/tasks/...`. Workers API is global.
- Hooks pattern: `useProjects`, `useTasks`, `useWorkers`, `useGitLog`, `useTheme` — all poll-based with configurable intervals.
- Layout: Sidebar (projects) → Main (TaskInput + KanbanBoard) → optional GitPanel. WorkerStatusBar at bottom. Modals for PlanModal, LogModal, AddProjectModal.

**Workers (Bash/Python)** — `worker/`
- `ralph.sh` — Main worker loop: claim task → create git worktree → run `claude -p` with `--dangerously-skip-permissions` → commit → merge/test → push → cleanup. Polls every 30s when idle.
- `merge_and_test.sh` — Rebase onto main, run tests, use Claude to resolve conflicts or fix test failures. Retries up to 3 times.
- `claim_task.py` — CLI bridge for workers to call dispatcher functions (claim cross-project, update status).
- `log_experience.py` — Appends task completion summaries to `PROGRESS.md` in the repo.

## Deployment

项目有两个部署环境，优先使用 Mac Mini（网络稳定、构建快）。

### Mac Mini（主力环境）

```bash
ssh -p 11426 leonard@6.tcp.cpolar.cn
```
- 项目目录：`~/claude-parallel-dev`
- macOS ARM64 (Apple Silicon), Docker Desktop v29.1.5, Compose v5.0.1
- 网络直连，无需代理，构建速度快（全量构建 < 1 分钟）
- 注意：非交互式 SSH 需要手动设置 PATH：`export PATH=/usr/local/bin:$PATH`

同步与部署：
```bash
# 同步本地文件到 Mac Mini（排除 .env 避免覆盖远程配置）
tar czf - --exclude='node_modules' --exclude='.git' --exclude='data' --exclude='.env' . | ssh -p 11426 leonard@6.tcp.cpolar.cn "cd ~/claude-parallel-dev && tar xzf -"

# 远程 Dockerfile 需用官方 Docker Hub（不用国内镜像），同步后替换：
ssh -p 11426 leonard@6.tcp.cpolar.cn "cd ~/claude-parallel-dev && sed -i '' 's|docker.1ms.run/library/||g' Dockerfile Dockerfile.worker"

# 重建并重启
ssh -p 11426 leonard@6.tcp.cpolar.cn "export PATH=/usr/local/bin:\$PATH && cd ~/claude-parallel-dev && docker compose up --build -d"

# 构建 worker 镜像（首次或 Dockerfile.worker 变更时）
ssh -p 11426 leonard@6.tcp.cpolar.cn "export PATH=/usr/local/bin:\$PATH && cd ~/claude-parallel-dev && docker compose build claude-worker"
```

### Windows 主机（备用环境）

```bash
ssh -p 21714 foresight@1.tcp.cpolar.cn
```
- 项目目录：`C:\Users\foresight\claude-parallel-dev`
- Docker Desktop + WSL2, v27.5.1
- 位于中国大陆，受 GFW 影响，cpolar 隧道不稳定
- 需要 Clash 代理（端口 7890）和国内镜像源

同步与部署：
```bash
tar czf - --exclude='node_modules' --exclude='.git' . | ssh -p 21714 foresight@1.tcp.cpolar.cn "cd C:\Users\foresight\claude-parallel-dev && tar xzf -"
ssh -p 21714 foresight@1.tcp.cpolar.cn "cd C:\Users\foresight\claude-parallel-dev && docker compose up --build -d"
```

### Windows 网络与代理

远程主机运行 Clash 代理，端口 7890。

**Docker 构建代理配置**（已完成）：
- `.env` 中设置 `HTTP_PROXY=http://host.docker.internal:7890` 和 `HTTPS_PROXY`
- `docker-compose.yml` 中两个 service 的 `build.args` 传递 `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`
- 远程主机 `~/.docker/config.json` 配置了 Docker client 代理
- Dockerfile 中**不需要** `ARG` 声明——BuildKit 自动识别 `HTTP_PROXY` 等预定义 build args
- 注意：在 Dockerfile 顶部加 `ARG` 会导致所有层缓存失效，应避免

**国内镜像源**（Windows 环境 Dockerfile 中配置）：
- apt: 直接访问 deb.debian.org（通过代理）
- pip: `pypi.tuna.tsinghua.edu.cn`（清华镜像）
- npm: `registry.npmmirror.com`（淘宝镜像）
- Docker base image: `docker.1ms.run`（国内 Docker Hub 镜像）

### 远程构建注意事项

- Windows 主机 SSH 连接可能因长时间构建而断开。对于耗时构建，在远程用 PowerShell 后台执行：
  ```powershell
  docker compose build --no-cache claude-dev *> build.log
  ```
  然后通过 `Get-Content build.log -Tail 30` 检查进度
- `npm install -g @anthropic-ai/claude-code` 是最慢的构建步骤（包很大），尽量利用缓存层避免重建
- 不使用 `--no-cache` 时，只有 `COPY . /app/` 之后的层会重建（frontend build、chmod、mkdir），通常几秒完成

## Build & Run

```bash
# Full system (Docker)
docker compose up --build          # builds and starts on port 8420

# Frontend only (local dev)
cd frontend && npm install && npm run dev    # Vite dev server
cd frontend && npm run build                 # production build → manager/static/dist/

# Backend only (local dev, needs Python venv)
cd manager && pip install -r requirements.txt
cd manager && uvicorn app:app --host 0.0.0.0 --port 8420
```

No test suite is configured for this project itself. The merge_and_test.sh script runs tests of the *target* repositories being managed.

## Key Conventions

- Task creation only requires `description`; the backend auto-generates the title.
- All API routes are project-scoped (`/api/projects/{id}/...`) with legacy unscoped routes (`/api/tasks`) that proxy to the first project.
- Workers are cross-project: they claim the highest-priority pending task from any project.
- Data persistence is JSON files + filelock, no database. Project data at `/app/data/projects/{id}/tasks.json`.
- Worker logs are JSONL files at `/app/data/projects/{id}/logs/{worker_id}.jsonl`.
- `claude-md-template.md` is injected as `CLAUDE.md` into every managed repo's worktree — it contains worker instructions (conventional commits, no push, etc.).
- Commit messages use conventional commits format with `Task-ID: <id>` in the body.
- The container runs as a non-root `claude` user (Claude Code requirement). `init-and-run.sh` fixes volume permissions via `gosu`.

## Environment Variables (.env)

- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` — LLM config (currently pointed at MiniMax-compatible API)
- `REPO_URL`, `REPO_BRANCH` — initial project repo (auto-cloned on first start)
- `WORKER_COUNT` — number of parallel Claude Code workers (default 3)
- `WEB_PORT` — dashboard port (default 8420)
- `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` — 代理配置，传递给 Docker build args 和容器运行时
- `DATA_HOST_PATH` — 宿主机 data 目录绝对路径，用于容器化 worker 的 volume mount
- `WORKER_MODE` — `container`（默认，容器化 worker）或 `process`（进程模式）
