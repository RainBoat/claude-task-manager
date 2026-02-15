"""FastAPI Web Manager — Dashboard, Task API, Project API, Git Log, WebSocket logs, Plan mode."""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import dispatcher
from models import TaskCreate, TaskStatus, PlanRequest, PlanApproval, ProjectCreate, ProjectStatus
from worker_pool import pool
from stream_parser import tail_log, parse_log_file


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: discover existing workers."""
    pool.discover_workers()
    worker_count = int(os.environ.get("WORKER_COUNT", "3"))
    for i in range(1, worker_count + 1):
        wid = f"worker-{i}"
        if not pool.get(wid):
            pool.register(wid)
    pool.discover_workers()
    yield


app = FastAPI(title="Claude Parallel Dev Manager", lifespan=lifespan)

# Static files — serve React build assets if available, fallback to legacy
_dist_dir = Path(__file__).parent / "static" / "dist"
_has_react = (_dist_dir / "index.html").exists()

if _has_react:
    _assets_dir = _dist_dir / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")

# Always mount legacy static for backwards compat (CSS/JS fallback)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ============================================================
# Dashboard
# ============================================================

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    if _has_react:
        return HTMLResponse((_dist_dir / "index.html").read_text())
    from fastapi.templating import Jinja2Templates
    templates = Jinja2Templates(directory="templates")
    return templates.TemplateResponse("index.html", {"request": request})


# ============================================================
# Project API
# ============================================================

@app.get("/api/projects")
async def list_projects():
    projects = dispatcher.get_all_projects()
    return [p.model_dump() for p in projects]


@app.post("/api/projects")
async def create_project(body: ProjectCreate):
    project = dispatcher.add_project(body)
    # Kick off background clone
    asyncio.create_task(_clone_project_async(project.id, body.repo_url, body.branch))
    return project.model_dump()


@app.delete("/api/projects/{project_id}")
async def remove_project(project_id: str):
    ok = dispatcher.delete_project(project_id)
    if ok:
        return {"status": "deleted"}
    return JSONResponse(status_code=404, content={"error": "project not found"})


async def _clone_project_async(project_id: str, repo_url: str, branch: str):
    """Background coroutine to clone a repo for a new project."""
    repo_dir = f"/app/data/projects/{project_id}/repo"
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: subprocess.run(
            ["git", "clone", "--branch", branch, repo_url, repo_dir],
            capture_output=True, text=True, timeout=300,
        ))
        if result.returncode == 0:
            # Inject CLAUDE.md if template exists
            template = "/app/claude-md-template.md"
            claude_md = os.path.join(repo_dir, "CLAUDE.md")
            if os.path.exists(template) and not os.path.exists(claude_md):
                await loop.run_in_executor(None, lambda: __import__('shutil').copy2(template, claude_md))
            # Initialize PROGRESS.md
            progress_md = os.path.join(repo_dir, "PROGRESS.md")
            if not os.path.exists(progress_md):
                with open(progress_md, "w") as f:
                    f.write("# Development Progress\n\nAutomatically maintained by Claude workers.\n\n---\n")
            dispatcher.update_project_status(project_id, ProjectStatus.READY)
        else:
            dispatcher.update_project_status(
                project_id, ProjectStatus.ERROR,
                error=f"Clone failed: {result.stderr[:300]}"
            )
    except subprocess.TimeoutExpired:
        dispatcher.update_project_status(project_id, ProjectStatus.ERROR, error="Clone timed out (300s)")
    except Exception as e:
        dispatcher.update_project_status(project_id, ProjectStatus.ERROR, error=str(e)[:300])


# ============================================================
# Task API (project-scoped)
# ============================================================

@app.get("/api/projects/{project_id}/tasks")
async def list_tasks(project_id: str):
    tasks = dispatcher.get_all_tasks(project_id)
    pool.update_from_tasks(tasks)
    return [t.model_dump() for t in tasks]


@app.post("/api/projects/{project_id}/tasks")
async def create_task(project_id: str, body: TaskCreate):
    t = dispatcher.add_task(project_id, body)
    if body.plan_mode:
        asyncio.create_task(_generate_plan_async(project_id, t.id, t.title, t.description))
    return t.model_dump()


@app.get("/api/projects/{project_id}/tasks/{task_id}")
async def get_task(project_id: str, task_id: str):
    t = dispatcher.get_task(project_id, task_id)
    if t:
        return t.model_dump()
    return JSONResponse(status_code=404, content={"error": "task not found"})


@app.delete("/api/projects/{project_id}/tasks/{task_id}")
async def delete_task(project_id: str, task_id: str):
    ok = dispatcher.delete_task(project_id, task_id)
    if ok:
        return {"status": "deleted"}
    return JSONResponse(status_code=404, content={"error": "task not found"})


@app.post("/api/projects/{project_id}/tasks/{task_id}/cancel")
async def cancel_task(project_id: str, task_id: str):
    task = dispatcher.get_task(project_id, task_id)
    if not task:
        return JSONResponse(status_code=404, content={"error": "task not found"})
    cancellable = {
        TaskStatus.PENDING, TaskStatus.PLAN_PENDING,
        TaskStatus.PLAN_APPROVED, TaskStatus.FAILED,
    }
    if task.status not in cancellable:
        return JSONResponse(status_code=400, content={
            "error": f"Cannot cancel task in '{task.status}' state"
        })
    dispatcher.update_task_status(project_id=project_id, task_id=task_id, status=TaskStatus.CANCELLED)
    return {"status": "cancelled", "task_id": task_id}


@app.post("/api/projects/{project_id}/tasks/{task_id}/retry")
async def retry_task(project_id: str, task_id: str):
    task = dispatcher.get_task(project_id, task_id)
    if not task:
        return JSONResponse(status_code=404, content={"error": "task not found"})
    if task.status != TaskStatus.FAILED:
        return JSONResponse(status_code=400, content={
            "error": f"Cannot retry task in '{task.status}' state"
        })
    dispatcher.update_task_status(project_id=project_id, task_id=task_id, status=TaskStatus.PENDING, error="")
    return {"status": "retrying", "task_id": task_id}


# ============================================================
# Legacy Task API (backwards compat — routes to first project)
# ============================================================

def _first_project_id() -> str | None:
    projects = dispatcher.get_all_projects()
    return projects[0].id if projects else None


@app.get("/api/tasks")
async def list_tasks_legacy():
    pid = _first_project_id()
    if not pid:
        return []
    tasks = dispatcher.get_all_tasks(pid)
    pool.update_from_tasks(tasks)
    return [t.model_dump() for t in tasks]


@app.post("/api/tasks")
async def create_task_legacy(body: TaskCreate):
    pid = _first_project_id()
    if not pid:
        return JSONResponse(status_code=400, content={"error": "no projects configured"})
    t = dispatcher.add_task(pid, body)
    if body.plan_mode:
        asyncio.create_task(_generate_plan_async(pid, t.id, t.title, t.description))
    return t.model_dump()


# ============================================================
# Worker API
# ============================================================

@app.get("/api/workers")
async def list_workers():
    # Gather tasks from all projects for worker status
    all_tasks = []
    for project in dispatcher.get_all_projects():
        all_tasks.extend(dispatcher.get_all_tasks(project.id))
    pool.update_from_tasks(all_tasks)
    workers = pool.get_all()
    return [w.model_dump() for w in workers]


@app.post("/api/workers/{worker_id}/restart")
async def restart_worker(worker_id: str):
    ok = pool.restart_worker(worker_id)
    if ok:
        return {"status": "restarted"}
    return JSONResponse(status_code=404, content={"error": "worker not found"})


# ============================================================
# Plan Mode API (project-scoped)
# ============================================================

async def _generate_plan_async(project_id: str, task_id: str, title: str, description: str):
    """Background coroutine to generate a plan via Claude CLI."""
    repo_dir = f"/app/data/projects/{project_id}/repo"

    plan_prompt = f"""You are a senior software architect. Analyze this task and create a detailed implementation plan.

Task: {title}
Description: {description}

Create a step-by-step plan that includes:
1. Files to modify or create
2. Specific changes needed in each file
3. Testing approach
4. Potential risks or edge cases

IMPORTANT: Your response must be valid JSON with this structure:
{{
  "plan": "... markdown plan content ...",
  "questions": [
    {{
      "key": "unique_key",
      "question": "Question description",
      "options": ["Option 1", "Option 2", "Option 3"],
      "default": "Recommended option"
    }}
  ]
}}

If you have no questions, set "questions" to an empty array.
Generate questions ONLY when the task has genuine ambiguity that needs user input."""

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: subprocess.run(
            ["claude", "-p", plan_prompt,
             "--dangerously-skip-permissions",
             "--output-format", "json"],
            capture_output=True, text=True, timeout=120,
            cwd=repo_dir,
        ))

        if result.returncode != 0:
            dispatcher.update_task_status(
                project_id=project_id, task_id=task_id,
                status=TaskStatus.FAILED,
                error=f"Plan generation failed (exit {result.returncode}): {result.stderr[:300]}",
            )
            return

        plan_text = ""
        questions = []
        try:
            output = json.loads(result.stdout)
            raw = output.get("result", result.stdout)
            try:
                structured = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(structured, dict) and "plan" in structured:
                    plan_text = structured["plan"]
                    questions = structured.get("questions", [])
                else:
                    plan_text = raw if isinstance(raw, str) else json.dumps(raw)
            except (json.JSONDecodeError, TypeError):
                plan_text = raw if isinstance(raw, str) else str(raw)
        except json.JSONDecodeError:
            plan_text = result.stdout

        dispatcher.update_task_status(
            project_id=project_id, task_id=task_id,
            status=TaskStatus.PLAN_PENDING,
            plan=plan_text,
            plan_questions=questions if questions else None,
        )

    except subprocess.TimeoutExpired:
        dispatcher.update_task_status(
            project_id=project_id, task_id=task_id,
            status=TaskStatus.FAILED,
            error="Plan generation timed out (120s)",
        )
    except Exception as e:
        dispatcher.update_task_status(
            project_id=project_id, task_id=task_id,
            status=TaskStatus.FAILED,
            error=f"Plan generation error: {str(e)}",
        )


@app.post("/api/projects/{project_id}/plan/generate")
async def generate_plan(project_id: str, req: PlanRequest):
    task = dispatcher.get_task(project_id, req.task_id)
    if not task:
        return JSONResponse(status_code=404, content={"error": "task not found"})
    asyncio.create_task(_generate_plan_async(project_id, req.task_id, task.title, task.description))
    return {"task_id": req.task_id, "status": "generating"}


@app.post("/api/projects/{project_id}/plan/approve")
async def approve_plan(project_id: str, req: PlanApproval):
    task = dispatcher.get_task(project_id, req.task_id)
    if not task:
        return JSONResponse(status_code=404, content={"error": "task not found"})

    if req.approved:
        plan_text = task.plan or ""
        if req.answers:
            answers_section = "\n\n---\n## User Answers\n"
            for key, value in req.answers.items():
                answers_section += f"- **{key}**: {value}\n"
            plan_text += answers_section

        dispatcher.update_task_status(
            project_id=project_id, task_id=req.task_id,
            status=TaskStatus.PLAN_APPROVED,
            plan=plan_text,
            plan_answers=req.answers,
        )
        return {"status": "approved", "task_id": req.task_id}
    else:
        dispatcher.update_task_status(
            project_id=project_id, task_id=req.task_id,
            status=TaskStatus.PENDING,
            plan=req.feedback or "",
        )
        return {"status": "rejected", "task_id": req.task_id}


# Legacy plan endpoints
@app.post("/api/plan/generate")
async def generate_plan_legacy(req: PlanRequest):
    pid = _first_project_id()
    if not pid:
        return JSONResponse(status_code=400, content={"error": "no projects configured"})
    task = dispatcher.get_task(pid, req.task_id)
    if not task:
        return JSONResponse(status_code=404, content={"error": "task not found"})
    asyncio.create_task(_generate_plan_async(pid, req.task_id, task.title, task.description))
    return {"task_id": req.task_id, "status": "generating"}


@app.post("/api/plan/approve")
async def approve_plan_legacy(req: PlanApproval):
    pid = _first_project_id()
    if not pid:
        return JSONResponse(status_code=400, content={"error": "no projects configured"})
    return await approve_plan(pid, req)


# ============================================================
# Git Log API
# ============================================================

@app.get("/api/projects/{project_id}/git/log")
async def git_log(project_id: str, limit: int = 50):
    repo_dir = f"/app/data/projects/{project_id}/repo"
    if not os.path.isdir(os.path.join(repo_dir, ".git")):
        return {"commits": []}

    try:
        # Use a delimiter that won't appear in commit messages
        sep = "---GIT-SEP---"
        fmt = f"%H{sep}%h{sep}%P{sep}%s{sep}%an{sep}%ar{sep}%D"
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: subprocess.run(
            ["git", "log", "--all", f"--format={fmt}", f"-{limit}", "--topo-order"],
            capture_output=True, text=True, timeout=10,
            cwd=repo_dir,
        ))

        if result.returncode != 0:
            return {"commits": []}

        commits = []
        for line in result.stdout.strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split(sep)
            if len(parts) < 7:
                continue
            sha, short, parents_str, message, author, time_ago, refs = parts
            parents = parents_str.split() if parents_str.strip() else []
            ref_list = [r.strip() for r in refs.split(",") if r.strip()] if refs.strip() else []
            commits.append({
                "sha": sha,
                "short": short,
                "parents": parents,
                "message": message,
                "author": author,
                "time_ago": time_ago,
                "refs": ref_list,
            })

        return {"commits": commits}
    except Exception:
        return {"commits": []}


# ============================================================
# Voice Transcription (Whisper fallback)
# ============================================================

@app.post("/api/voice/transcribe")
async def transcribe_voice(file: UploadFile = File(...)):
    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        return JSONResponse(status_code=501, content={
            "error": "OPENAI_API_KEY not configured. Use browser Web Speech API instead."
        })

    import httpx

    audio_data = await file.read()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {openai_key}"},
            files={"file": (file.filename, audio_data, file.content_type)},
            data={"model": "whisper-1"},
            timeout=30,
        )

    if resp.status_code == 200:
        return resp.json()
    return JSONResponse(status_code=resp.status_code, content=resp.json())


# ============================================================
# WebSocket — Live log streaming
# ============================================================

@app.websocket("/ws/logs/{worker_id}")
async def ws_logs(websocket: WebSocket, worker_id: str):
    await websocket.accept()

    # Try project-specific log dirs first, fall back to global
    log_path = None
    for project in dispatcher.get_all_projects():
        candidate = f"/app/data/projects/{project.id}/logs/{worker_id}.jsonl"
        if os.path.exists(candidate):
            log_path = candidate
            break

    if not log_path:
        log_dir = os.environ.get("LOG_DIR", "/app/data/logs")
        log_path = os.path.join(log_dir, f"{worker_id}.jsonl")

    try:
        existing = parse_log_file(log_path)
        for event in existing[-50:]:
            await websocket.send_json(event)

        async for event in tail_log(log_path):
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "error": str(e)})
        except Exception:
            pass
