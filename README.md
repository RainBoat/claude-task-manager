# Claude Parallel Dev

一个并行开发任务管理器，通过编排多个 Claude Code CLI Worker 在多个 Git 仓库上并发执行编码任务。任务在 Kanban 看板中流转，支持 Plan 审批门控、自动合并/测试、经验日志等功能。

## 架构概览

三层架构，运行在 Docker 容器中：

```
┌─────────────────────────────────────────────────────────┐
│  Browser — React + Tailwind + Vite                      │
│  Kanban Board / Worker Status / Git Panel / Plan Dialog │
└──────────────────────┬──────────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│  Manager — FastAPI (Python)                             │
│  app.py / dispatcher.py / task_scheduler.py             │
│  container_pool.py / stream_parser.py / event_log.py    │
└──────────────────────┬──────────────────────────────────┘
                       │ Docker API
┌──────────────────────▼──────────────────────────────────┐
│  Worker Containers — claude-worker:latest                │
│  run_task.sh → claude -p → commit → callback            │
│  merge_and_test.sh (rebase + test + conflict resolution)│
└─────────────────────────────────────────────────────────┘
```

### 后端 (Python/FastAPI) — `manager/`

| 模块 | 职责 |
|------|------|
| `app.py` | FastAPI 主服务：REST API、WebSocket 日志流、Plan 生成、语音转写。从 `static/dist/` 提供前端静态文件 |
| `dispatcher.py` | 任务与项目持久化，基于 JSON 文件 + `filelock` 并发控制。跨项目任务认领 |
| `models.py` | Pydantic 数据模型：Project、Task、Worker、Plan |
| `task_scheduler.py` | 后台调度循环：认领任务 → 创建 worktree → 启动容器 → 等待 → 合并测试 → 清理 |
| `container_pool.py` | 容器化 Worker 池管理，通过 Docker SDK 创建/监控/停止 Worker 容器 |
| `stream_parser.py` | 解析 Claude Code `--output-format stream-json` JSONL 日志 |
| `event_log.py` | 内存事件队列（环形缓冲区），记录 Dispatcher/系统事件供前端展示 |

### 前端 (React/TypeScript/Tailwind) — `frontend/`

| 组件 | 说明 |
|------|------|
| `App.tsx` | 主布局：Sidebar → Main (TaskInput + KanbanBoard) → GitPanel |
| `Sidebar.tsx` | 项目列表与切换 |
| `KanbanBoard.tsx` / `KanbanColumn.tsx` | 看板视图，按状态分列 |
| `TaskCard.tsx` | 任务卡片，支持查看日志、重试、取消、删除 |
| `TaskInput.tsx` | 任务创建输入框，支持 Plan 模式和依赖设置 |
| `WorkerStatusBar.tsx` | 底部 Worker 状态栏，含实时活动 Feed 和系统日志 |
| `ActivityFeed.tsx` / `LogEntryRow.tsx` | Claude Code 实时日志流展示 |
| `PlanModal.tsx` / `PlanDialog.tsx` | Plan 审批与对话界面 |
| `GitPanel.tsx` | Git 提交历史面板 |
| `LogModal.tsx` | 完整日志弹窗 |
| `AddProjectModal.tsx` | 添加项目弹窗（Git 克隆 / 本地路径 / 新建仓库） |

Hooks：`useProjects`、`useTasks`、`useWorkers`、`useGitLog`、`useTheme`、`useWorkerLogs`、`useStats`、`useVoiceInput` — 均基于轮询。

双语支持（中/英）通过 `i18n.ts` 的 `t(key, lang)` 实现。

### Worker — `worker/`

| 脚本 | 说明 |
|------|------|
| `run_task.sh` | 单任务容器入口：接收环境变量 → 构建 prompt → 运行 `claude -p` → 提交 → 回调 Manager |
| `merge_and_test.sh` | Rebase 到 main → 运行测试 → 用 Claude 解决冲突/修复测试失败，最多重试 3 次 |
| `ralph.sh` | 进程模式 Worker 循环（备用，容器模式下不使用） |
| `claim_task.py` | CLI 桥接，Worker 调用 Dispatcher 函数 |
| `log_experience.py` | 将任务完成摘要追加到仓库的 `PROGRESS.md` |

## 任务生命周期

```
pending → claimed → running → merging → testing → completed
                                                 → failed
                                                 → merge_pending (手动合并模式 / 自动合并失败)

Plan 模式: pending → plan_pending → plan_approved → claimed → ...
```

- Worker 跨项目认领最高优先级的 pending 任务
- 每个任务在独立的 git worktree + Docker 容器中执行
- 容器内的 Claude Code 完成编码后提交，通过 HTTP 回调通知 Manager
- Manager 执行 rebase、测试、自动合并（可配置）

## 快速开始

### 前置要求

- Docker + Docker Compose
- Anthropic API Key（或兼容的 API，如 MiniMax）

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 API Key 和仓库地址
```

`.env` 关键配置：

```bash
# LLM 配置
ANTHROPIC_API_KEY=your-api-key
ANTHROPIC_BASE_URL=https://api.anthropic.com   # 或兼容 API 地址
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# 初始项目仓库
REPO_URL=https://github.com/your-org/your-repo.git
REPO_BRANCH=main

# Worker 配置
WORKER_COUNT=3          # 并行 Worker 数量
WEB_PORT=8420           # Dashboard 端口
WORKER_MODE=container   # container（默认）或 process
```

### 2. 构建并启动

```bash
# 构建 Manager + Worker 镜像并启动
docker compose up --build -d

# 首次需要单独构建 Worker 镜像
docker compose build claude-worker
```

### 3. 访问 Dashboard

打开浏览器访问 `http://localhost:8420`

## 本地开发

```bash
# 前端开发（Vite dev server，热更新）
cd frontend && npm install && npm run dev

# 前端生产构建（输出到 manager/static/dist/）
cd frontend && npm run build

# 后端开发（需要 Python venv）
cd manager && pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8420
```

## 项目结构

```
claude-parallel-dev/
├── manager/                    # 后端 FastAPI 服务
│   ├── app.py                  # 主服务入口
│   ├── dispatcher.py           # 任务/项目持久化
│   ├── models.py               # Pydantic 模型
│   ├── task_scheduler.py       # 调度循环
│   ├── container_pool.py       # Docker 容器池
│   ├── stream_parser.py        # JSONL 日志解析
│   ├── event_log.py            # 内存事件队列
│   ├── requirements.txt
│   └── static/dist/            # 前端构建产物
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts              # HTTP/WebSocket 调用
│   │   ├── types.ts            # TypeScript 类型
│   │   ├── i18n.ts             # 双语翻译
│   │   ├── components/         # UI 组件
│   │   └── hooks/              # 数据 hooks
│   ├── package.json
│   └── vite.config.ts
├── worker/                     # Worker 脚本
│   ├── run_task.sh             # 容器模式入口
│   ├── merge_and_test.sh       # 合并与测试
│   ├── ralph.sh                # 进程模式循环
│   ├── claim_task.py
│   └── log_experience.py
├── Dockerfile                  # Manager 镜像
├── Dockerfile.worker           # Worker 镜像
├── docker-compose.yml
├── init-and-run.sh             # 容器初始化（root → claude 用户）
├── entrypoint.sh               # 服务启动脚本
├── claude-md-template.md       # 注入到 Worker worktree 的 CLAUDE.md
├── .env.example
└── CLAUDE.md                   # Claude Code 项目指引
```

## API 概览

所有任务 API 均以项目为作用域：`/api/projects/{id}/...`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 列出所有项目 |
| POST | `/api/projects` | 创建项目 |
| DELETE | `/api/projects/{id}` | 删除项目 |
| GET | `/api/projects/{id}/tasks` | 列出项目任务 |
| POST | `/api/projects/{id}/tasks` | 创建任务（只需 `description`） |
| POST | `/api/projects/{id}/tasks/{id}/cancel` | 取消任务 |
| POST | `/api/projects/{id}/tasks/{id}/retry` | 重试任务 |
| POST | `/api/projects/{id}/tasks/{id}/merge` | 手动合并任务 |
| POST | `/api/projects/{id}/plan/generate` | 生成 Plan |
| POST | `/api/projects/{id}/plan/approve` | 审批 Plan |
| POST | `/api/projects/{id}/plan/chat` | Plan 对话 |
| GET | `/api/workers` | 列出所有 Worker |
| GET | `/api/dispatcher/events` | 获取 Dispatcher 事件日志 |
| GET | `/api/projects/{id}/git/log` | Git 提交历史 |
| POST | `/api/projects/{id}/git/push` | 推送到远程 |
| WS | `/ws/logs/{worker_id}` | Worker 实时日志流 |
| WS | `/ws/plan/{project_id}/{task_id}` | Plan 生成实时流 |

## 数据持久化

- 无数据库，使用 JSON 文件 + filelock
- 项目数据：`/app/data/projects/{id}/tasks.json`
- Worker 日志：`/app/data/projects/{id}/logs/{worker_id}.jsonl`
- Git 仓库：`/app/data/projects/{id}/repo/`
- Worktree：`/app/data/projects/{id}/worktrees/{worker_id}/`

## Worker 工作机制

1. Manager 的 `task_scheduler.py` 持续扫描 pending 任务
2. 找到空闲 Worker 槽位后，认领最高优先级任务
3. 在项目仓库中创建 git worktree（分支 `claude/{task_id}`）
4. 启动 `claude-worker` Docker 容器，挂载 worktree 到 `/workspace`，同时挂载源仓库以解析 git worktree 链接
5. 容器内 `run_task.sh` 运行 `claude -p` 执行任务
6. Claude Code 完成后提交代码，容器通过 HTTP 回调通知 Manager
7. Manager 执行 `merge_and_test.sh`：rebase → 测试 → 冲突解决（最多 3 次重试）
8. 自动合并成功 → `completed`，清理 worktree 和分支；自动合并失败 → `merge_pending`，保留分支供手动合并
9. Worker 回到空闲状态

## 经验系统

每个任务完成后，`log_experience.py` 会将结构化摘要追加到仓库的 `PROGRESS.md`：
- 遇到的问题
- 采用的解决方案
- 预防措施

后续 Worker 在开始新任务前会读取 `PROGRESS.md`，从历史经验中学习，避免重复犯错。

## 许可证

MIT
