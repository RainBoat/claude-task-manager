"""Docker container pool — manages worker containers for task execution.

Replaces worker_pool.py when WORKER_MODE=container. Each task gets its own
isolated Docker container that only sees its worktree mounted at /workspace.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Optional

import docker
from docker.errors import DockerException, NotFound, APIError

from models import WorkerState, WorkerStatus

logger = logging.getLogger(__name__)


class ContainerPool:
    """Manages ephemeral worker containers via Docker SDK."""

    def __init__(self, worker_count: int = 3):
        self.client = docker.from_env()
        self._worker_count = worker_count
        self._workers: dict[str, WorkerState] = {}
        self._container_ids: dict[str, str] = {}  # worker_id → container_id

        # Clean up stale worker containers from previous runs
        try:
            for c in self.client.containers.list(all=True, filters={"name": "claude-worker-"}):
                logger.info(f"Cleaning up stale container: {c.name}")
                c.remove(force=True)
        except Exception as e:
            logger.warning(f"Failed to clean stale containers: {e}")

        # Initialize worker slots
        for i in range(1, worker_count + 1):
            wid = f"worker-{i}"
            self._workers[wid] = WorkerState(
                id=wid,
                status=WorkerStatus.IDLE,
                started_at=datetime.utcnow().isoformat(),
            )

    def _host_path(self, container_path: str) -> str:
        """Convert container-internal /app/data/... path to host path for volume mounts."""
        data_host = os.environ.get("DATA_HOST_PATH", "./data")
        return container_path.replace("/app/data", data_host)

    def run_task(
        self,
        worker_id: str,
        project_id: str,
        project_name: str,
        task,
        worktree_path: str,
        repo_path: str,
        log_dir: str,
        branch_name: str,
    ) -> bool:
        """Start a worker container to execute a single task.

        Returns True if container started successfully.
        """
        state = self._workers.get(worker_id)
        if not state:
            logger.error(f"Unknown worker_id: {worker_id}")
            return False

        # Verify worktree exists and has a valid .git before mounting
        if not os.path.exists(worktree_path):
            logger.error(f"[{worker_id}] Worktree path does not exist: {worktree_path}")
            state.status = WorkerStatus.ERROR
            return False

        if not os.path.exists(os.path.join(worktree_path, ".git")):
            logger.error(f"[{worker_id}] Worktree has no .git: {worktree_path}")
            state.status = WorkerStatus.ERROR
            return False

        # Build host paths for volume mounts
        host_worktree = self._host_path(worktree_path)
        host_logs = self._host_path(log_dir)
        host_repo = self._host_path(repo_path)

        container_name = f"claude-worker-{worker_id}-{task.id}"

        # Build environment
        env = {
            "TASK_ID": task.id,
            "TASK_TITLE": task.title,
            "TASK_DESC": task.description,
            "TASK_PLAN": task.plan or "",
            "PROJECT_ID": project_id,
            "PROJECT_NAME": project_name,
            "WORKER_ID": worker_id,
            "MANAGER_URL": os.environ.get("MANAGER_INTERNAL_URL", "http://host.docker.internal:8420"),
            "BRANCH_NAME": branch_name,
        }

        # Forward Anthropic API config
        for key in ("ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"):
            val = os.environ.get(key)
            if val:
                env[key] = val

        # Volume mounts
        # Worktree's .git file contains a gitdir path pointing to the repo's
        # .git/worktrees/ directory, so we must mount the repo at the same
        # path so git can resolve the worktree link.
        volumes = {
            host_worktree: {"bind": "/workspace", "mode": "rw"},
            host_logs: {"bind": "/logs", "mode": "rw"},
            host_repo: {"bind": repo_path, "mode": "rw"},
        }

        try:
            # Remove any leftover container with the same name
            try:
                old = self.client.containers.get(container_name)
                old.remove(force=True)
            except NotFound:
                pass

            container = self.client.containers.run(
                image=os.environ.get("WORKER_IMAGE", "claude-worker:latest"),
                name=container_name,
                environment=env,
                volumes=volumes,
                detach=True,
                auto_remove=True,
                # No user= here — entrypoint runs as root to protect .git,
                # then drops to claude via gosu
            )

            self._container_ids[worker_id] = container.id
            state.container_id = container.id
            state.status = WorkerStatus.BUSY
            state.current_task_id = task.id
            state.current_task_title = task.title
            state.last_activity = datetime.utcnow().isoformat()

            logger.info(f"[{worker_id}] Started container {container.short_id} for task {task.id}")
            return True

        except (DockerException, APIError) as e:
            logger.error(f"[{worker_id}] Failed to start container: {e}")
            state.status = WorkerStatus.ERROR
            return False

    def wait_container(self, worker_id: str) -> dict:
        """Block until the worker container exits. Returns {"StatusCode": int, "Error": ...}.

        Should be called from a thread (run_in_executor) to avoid blocking the event loop.
        """
        cid = self._container_ids.get(worker_id)
        if not cid:
            return {"StatusCode": -1, "Error": "no container"}

        try:
            container = self.client.containers.get(cid)
            result = container.wait(timeout=1800)  # 30 min max
            return result
        except NotFound:
            # Container already removed (auto_remove=True after exit)
            return {"StatusCode": 0}
        except Exception as e:
            return {"StatusCode": -1, "Error": str(e)}

    def mark_idle(self, worker_id: str) -> None:
        """Mark a worker slot as idle after container completes."""
        state = self._workers.get(worker_id)
        if state:
            state.status = WorkerStatus.IDLE
            state.container_id = None
            state.current_task_id = None
            state.current_task_title = None
            state.tasks_completed += 1
            self._container_ids.pop(worker_id, None)

    def get_idle_worker(self) -> Optional[str]:
        """Return the ID of an idle worker slot, or None."""
        for wid, state in self._workers.items():
            if state.status == WorkerStatus.IDLE:
                return wid
        return None

    def get_all(self) -> list[WorkerState]:
        """Get all worker states, refreshing container liveness."""
        for wid in list(self._workers.keys()):
            self._refresh_state(wid)
        return list(self._workers.values())

    def get(self, worker_id: str) -> Optional[WorkerState]:
        self._refresh_state(worker_id)
        return self._workers.get(worker_id)

    def stop_worker(self, worker_id: str) -> bool:
        """Stop a running worker container."""
        cid = self._container_ids.get(worker_id)
        if not cid:
            return False
        try:
            container = self.client.containers.get(cid)
            container.stop(timeout=10)
            logger.info(f"[{worker_id}] Stopped container {cid[:12]}")
        except (NotFound, APIError):
            pass
        self.mark_idle(worker_id)
        return True

    def update_from_tasks(self, tasks: list) -> None:
        """Update worker states based on current task assignments (compat with worker_pool API)."""
        active_tasks = {}
        for t in tasks:
            if t.worker_id and t.status.value in ("claimed", "running", "merging", "testing"):
                active_tasks[t.worker_id] = t

        for wid, state in self._workers.items():
            if state.status == WorkerStatus.STOPPED:
                continue
            if wid in active_tasks:
                task = active_tasks[wid]
                state.status = WorkerStatus.BUSY
                state.current_task_id = task.id
                state.current_task_title = task.title
                state.last_activity = datetime.utcnow().isoformat()
            elif state.status == WorkerStatus.BUSY and wid not in self._container_ids:
                # No container running and no active task — idle
                state.status = WorkerStatus.IDLE
                state.current_task_id = None
                state.current_task_title = None

    def _refresh_state(self, worker_id: str) -> None:
        """Check if a worker's container is still running."""
        state = self._workers.get(worker_id)
        if not state:
            return

        cid = self._container_ids.get(worker_id)
        if not cid:
            return

        try:
            container = self.client.containers.get(cid)
            if container.status not in ("running", "created"):
                # Container exited
                self.mark_idle(worker_id)
        except NotFound:
            # Container gone (auto_remove)
            self.mark_idle(worker_id)
        except Exception:
            pass
