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

项目部署在远程 Windows 主机，通过 SSH 访问：
```bash
ssh -p 21714 foresight@1.tcp.cpolar.cn
```
项目目录：`C:\Users\foresight\claude-parallel-dev`

每次完成对本地项目的修改后，询问用户是否要同步到远程主机并重建容器。如果用户确认，执行：
```bash
# 同步本地文件到远程主机（远程 Windows 无 rsync，用 tar+ssh）
tar czf - --exclude='node_modules' --exclude='.git' . | ssh -p 21714 foresight@1.tcp.cpolar.cn "cd C:\Users\foresight\claude-parallel-dev && tar xzf -"

# 在远程主机上重建并重启容器
ssh -p 21714 foresight@1.tcp.cpolar.cn "cd C:\Users\foresight\claude-parallel-dev && docker compose up --build -d"
```

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
