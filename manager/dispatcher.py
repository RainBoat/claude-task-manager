"""Task dispatcher with atomic file-lock-based operations — multi-project aware."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import datetime
from typing import Optional

from filelock import FileLock

from models import (
    Task, TaskCreate, TaskQueue, TaskStatus,
    Project, ProjectCreate, ProjectRegistry, ProjectStatus,
)

PROJECTS_DIR = "/app/data/projects"
REGISTRY_FILE = "/app/data/projects.json"


# ============================================================
# Internal helpers
# ============================================================

def _get_paths(project_id: str):
    """Return (tasks_file, lock_file) for a project."""
    base = os.path.join(PROJECTS_DIR, project_id)
    tasks_file = os.path.join(base, "tasks.json")
    lock_file = tasks_file + ".lock"
    return tasks_file, lock_file


def _read_queue(tasks_file: str) -> TaskQueue:
    try:
        with open(tasks_file, "r") as f:
            data = json.load(f)
        return TaskQueue(**data)
    except (FileNotFoundError, json.JSONDecodeError):
        return TaskQueue()


def _write_queue(tasks_file: str, queue: TaskQueue) -> None:
    os.makedirs(os.path.dirname(tasks_file), exist_ok=True)
    with open(tasks_file, "w") as f:
        json.dump(queue.model_dump(), f, indent=2, default=str)


def _read_registry() -> ProjectRegistry:
    try:
        with open(REGISTRY_FILE, "r") as f:
            data = json.load(f)
        return ProjectRegistry(**data)
    except (FileNotFoundError, json.JSONDecodeError):
        return ProjectRegistry()


def _write_registry(registry: ProjectRegistry) -> None:
    os.makedirs(os.path.dirname(REGISTRY_FILE), exist_ok=True)
    with open(REGISTRY_FILE, "w") as f:
        json.dump(registry.model_dump(), f, indent=2, default=str)


REGISTRY_LOCK = REGISTRY_FILE + ".lock"


# ============================================================
# Project management
# ============================================================

def get_all_projects() -> list[Project]:
    lock = FileLock(REGISTRY_LOCK, timeout=10)
    with lock:
        return _read_registry().projects


def add_project(create: ProjectCreate) -> Project:
    lock = FileLock(REGISTRY_LOCK, timeout=10)
    with lock:
        registry = _read_registry()
        project = Project(
            name=create.name,
            repo_url=create.repo_url,
            branch=create.branch,
            source_type=create.source_type,
            auto_merge=create.auto_merge,
            auto_push=create.auto_push,
        )
        registry.projects.append(project)
        _write_registry(registry)

        # Create project directories
        base = os.path.join(PROJECTS_DIR, project.id)
        for sub in ("repo", "logs", "worktrees"):
            os.makedirs(os.path.join(base, sub), exist_ok=True)

        # Initialize empty task queue
        tasks_file, _ = _get_paths(project.id)
        if not os.path.exists(tasks_file):
            _write_queue(tasks_file, TaskQueue())

        return project


def delete_project(project_id: str) -> bool:
    lock = FileLock(REGISTRY_LOCK, timeout=10)
    with lock:
        registry = _read_registry()
        original_len = len(registry.projects)
        registry.projects = [p for p in registry.projects if p.id != project_id]
        if len(registry.projects) < original_len:
            _write_registry(registry)
            return True
        return False


def get_project(project_id: str) -> Optional[Project]:
    lock = FileLock(REGISTRY_LOCK, timeout=10)
    with lock:
        registry = _read_registry()
        for p in registry.projects:
            if p.id == project_id:
                return p
        return None


def update_project_status(
    project_id: str,
    status: ProjectStatus,
    error: Optional[str] = None,
) -> Optional[Project]:
    lock = FileLock(REGISTRY_LOCK, timeout=10)
    with lock:
        registry = _read_registry()
        for p in registry.projects:
            if p.id == project_id:
                p.status = status
                if error is not None:
                    p.error = error
                _write_registry(registry)
                return p
        return None


def update_project_settings(
    project_id: str,
    auto_merge: Optional[bool] = None,
    auto_push: Optional[bool] = None,
) -> Optional[Project]:
    lock = FileLock(REGISTRY_LOCK, timeout=10)
    with lock:
        registry = _read_registry()
        for p in registry.projects:
            if p.id == project_id:
                if auto_merge is not None:
                    p.auto_merge = auto_merge
                if auto_push is not None:
                    p.auto_push = auto_push
                _write_registry(registry)
                return p
        return None


# ============================================================
# Task management (project-scoped)
# ============================================================

def get_all_tasks(project_id: str) -> list[Task]:
    tasks_file, lock_file = _get_paths(project_id)
    lock = FileLock(lock_file, timeout=10)
    with lock:
        return _read_queue(tasks_file).tasks


def add_task(project_id: str, create: TaskCreate) -> Task:
    tasks_file, lock_file = _get_paths(project_id)
    lock = FileLock(lock_file, timeout=10)
    with lock:
        queue = _read_queue(tasks_file)
        # Auto-generate title from description: first line, max 50 chars
        title = create.description.split('\n')[0].strip()[:50]
        task = Task(
            title=title,
            description=create.description,
            priority=create.priority,
            depends_on=create.depends_on,
            plan_mode=create.plan_mode,
        )
        queue.tasks.append(task)
        _write_queue(tasks_file, queue)
        return task


def delete_task(project_id: str, task_id: str) -> bool:
    tasks_file, lock_file = _get_paths(project_id)
    lock = FileLock(lock_file, timeout=10)
    with lock:
        queue = _read_queue(tasks_file)
        original_len = len(queue.tasks)
        queue.tasks = [t for t in queue.tasks if t.id != task_id]
        if len(queue.tasks) < original_len:
            _write_queue(tasks_file, queue)
            return True
        return False


def get_task(project_id: str, task_id: str) -> Optional[Task]:
    tasks_file, lock_file = _get_paths(project_id)
    lock = FileLock(lock_file, timeout=10)
    with lock:
        queue = _read_queue(tasks_file)
        for task in queue.tasks:
            if task.id == task_id:
                return task
        return None


def recover_stale_tasks() -> int:
    """Reset tasks stuck in intermediate states (claimed/running/merging/testing)
    back to pending. Called on startup to recover from unclean shutdowns.
    Note: merge_pending is a stable state (awaiting user action), not stale."""
    stale_statuses = {
        TaskStatus.CLAIMED, TaskStatus.RUNNING,
        TaskStatus.MERGING, TaskStatus.TESTING,
    }
    lock = FileLock(REGISTRY_LOCK, timeout=10)
    with lock:
        registry = _read_registry()

    recovered = 0
    for project in registry.projects:
        tasks_file, lock_file = _get_paths(project.id)
        plock = FileLock(lock_file, timeout=5)
        try:
            with plock:
                queue = _read_queue(tasks_file)
                changed = False
                for task in queue.tasks:
                    if task.status in stale_statuses:
                        task.status = TaskStatus.PENDING
                        task.worker_id = None
                        task.error = None
                        changed = True
                        recovered += 1
                if changed:
                    _write_queue(tasks_file, queue)
        except Exception:
            continue

        # Cleanup orphaned worktrees and branches for this project
        repo_dir = f"/app/data/projects/{project.id}/repo"
        worktree_base = f"/app/data/projects/{project.id}/worktrees"

        if not os.path.isdir(repo_dir):
            continue

        try:
            # 1. Remove all worktree directories
            if os.path.isdir(worktree_base):
                for entry in os.listdir(worktree_base):
                    wt_path = os.path.join(worktree_base, entry)
                    subprocess.run(
                        ["git", "worktree", "remove", "--force", wt_path],
                        cwd=repo_dir, capture_output=True, timeout=30,
                    )
                    if os.path.isdir(wt_path):
                        shutil.rmtree(wt_path, ignore_errors=True)

            # 2. Prune stale worktree references
            subprocess.run(
                ["git", "worktree", "prune"],
                cwd=repo_dir, capture_output=True, timeout=30,
            )

            # 3. Delete all claude/* branches (they are ephemeral)
            result = subprocess.run(
                ["git", "branch", "--list", "claude/*"],
                cwd=repo_dir, capture_output=True, text=True, timeout=30,
            )
            for line in result.stdout.splitlines():
                branch = line.strip().lstrip("* ")
                if branch:
                    subprocess.run(
                        ["git", "branch", "-D", branch],
                        cwd=repo_dir, capture_output=True, timeout=30,
                    )
        except Exception as e:
            logger.warning(f"Failed to cleanup worktrees/branches for project {project.id}: {e}")

    return recovered


def claim_next(worker_id: str) -> Optional[tuple[str, Task]]:
    """Cross-project claim: scan all projects, return (project_id, task).

    Priority: plan_approved > pending, then by priority desc, created_at asc.
    """
    lock = FileLock(REGISTRY_LOCK, timeout=10)
    with lock:
        registry = _read_registry()

    # Only scan ready projects
    ready_projects = [p for p in registry.projects if p.status == ProjectStatus.READY]

    all_candidates: list[tuple[str, str, str, Task]] = []  # (project_id, tasks_file, lock_file, task)

    for project in ready_projects:
        tasks_file, lock_file = _get_paths(project.id)
        plock = FileLock(lock_file, timeout=5)
        try:
            with plock:
                queue = _read_queue(tasks_file)
                completed_ids = {t.id for t in queue.tasks if t.status == TaskStatus.COMPLETED}

                for t in queue.tasks:
                    if t.status not in (TaskStatus.PLAN_APPROVED, TaskStatus.PENDING):
                        continue
                    if t.depends_on and t.depends_on not in completed_ids:
                        continue
                    all_candidates.append((project.id, tasks_file, lock_file, t))
        except Exception:
            continue

    if not all_candidates:
        return None

    # Sort: plan_approved first, then priority desc, then created_at asc
    def sort_key(item):
        t = item[3]
        status_priority = 0 if t.status == TaskStatus.PLAN_APPROVED else 1
        return (status_priority, -t.priority, t.created_at)

    all_candidates.sort(key=sort_key)

    # Claim the best candidate
    best_project_id, best_tasks_file, best_lock_file, best_task = all_candidates[0]
    plock = FileLock(best_lock_file, timeout=10)
    with plock:
        queue = _read_queue(best_tasks_file)
        for task in queue.tasks:
            if task.id == best_task.id and task.status == best_task.status:
                task.status = TaskStatus.CLAIMED
                task.worker_id = worker_id
                task.started_at = datetime.utcnow().isoformat()
                _write_queue(best_tasks_file, queue)
                return (best_project_id, task)

    return None


def update_task_status(
    project_id: str,
    task_id: str,
    status: TaskStatus,
    error: Optional[str] = None,
    commit_id: Optional[str] = None,
    plan: Optional[str] = None,
    branch: Optional[str] = None,
    plan_questions: Optional[list[dict]] = None,
    plan_answers: Optional[dict] = None,
    plan_messages: Optional[list[dict]] = None,
    plan_session_id: Optional[str] = None,
    depends_on: Optional[str] = None,
) -> Optional[Task]:
    tasks_file, lock_file = _get_paths(project_id)
    lock = FileLock(lock_file, timeout=10)
    with lock:
        queue = _read_queue(tasks_file)
        for task in queue.tasks:
            if task.id == task_id:
                task.status = status
                if error is not None:
                    task.error = error
                if commit_id is not None:
                    task.commit_id = commit_id
                if plan is not None:
                    task.plan = plan
                if branch is not None:
                    task.branch = branch
                if plan_questions is not None:
                    task.plan_questions = plan_questions
                if plan_answers is not None:
                    task.plan_answers = plan_answers
                if plan_messages is not None:
                    task.plan_messages = plan_messages
                if plan_session_id is not None:
                    task.plan_session_id = plan_session_id
                if depends_on is not None:
                    task.depends_on = depends_on
                if status == TaskStatus.COMPLETED:
                    task.completed_at = datetime.utcnow().isoformat()
                _write_queue(tasks_file, queue)
                return task
        return None
