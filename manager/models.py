"""Pydantic data models for tasks, projects, and worker state."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ============================================================
# Project models
# ============================================================

class ProjectStatus(str, Enum):
    CLONING = "cloning"
    READY = "ready"
    ERROR = "error"


class Project(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    name: str
    repo_url: Optional[str] = None
    branch: str = "main"
    source_type: str = "git"  # "git" | "local" | "new"
    auto_merge: bool = True
    auto_push: bool = False
    status: ProjectStatus = ProjectStatus.CLONING
    error: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ProjectCreate(BaseModel):
    name: str
    repo_url: Optional[str] = None
    branch: str = "main"
    source_type: str = "git"
    auto_merge: bool = True
    auto_push: bool = False


class ProjectRegistry(BaseModel):
    projects: list[Project] = []


# ============================================================
# Task models
# ============================================================

class TaskStatus(str, Enum):
    PENDING = "pending"
    CLAIMED = "claimed"
    RUNNING = "running"
    PLAN_PENDING = "plan_pending"      # plan generated, awaiting approval
    PLAN_APPROVED = "plan_approved"    # plan approved, ready for execution
    MERGING = "merging"
    TESTING = "testing"
    MERGE_PENDING = "merge_pending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Task(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    title: str
    description: str
    status: TaskStatus = TaskStatus.PENDING
    priority: int = 0  # higher = more urgent
    worker_id: Optional[str] = None
    branch: Optional[str] = None
    plan: Optional[str] = None        # generated plan content
    plan_approved: bool = False
    plan_questions: Optional[list[dict]] = None  # Claude-generated questions
    plan_answers: Optional[dict] = None          # user-selected answers
    depends_on: Optional[str] = None             # predecessor task ID
    commit_id: Optional[str] = None
    error: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class TaskCreate(BaseModel):
    """Simplified task creation — only description required.
    Title is auto-generated from description by the backend."""
    description: str
    priority: int = 0
    depends_on: Optional[str] = None
    plan_mode: bool = False


class TaskQueue(BaseModel):
    tasks: list[Task] = []


# ============================================================
# Worker models
# ============================================================

class WorkerStatus(str, Enum):
    IDLE = "idle"
    BUSY = "busy"
    STOPPED = "stopped"
    ERROR = "error"


class WorkerState(BaseModel):
    id: str
    pid: Optional[int] = None
    status: WorkerStatus = WorkerStatus.IDLE
    current_task_id: Optional[str] = None
    current_task_title: Optional[str] = None
    tasks_completed: int = 0
    last_activity: Optional[str] = None
    started_at: Optional[str] = None


# ============================================================
# Plan models
# ============================================================

class PlanRequest(BaseModel):
    task_id: str


class PlanApproval(BaseModel):
    task_id: str
    approved: bool
    feedback: Optional[str] = None
    answers: Optional[dict] = None  # {"question_key": "selected_option"}
