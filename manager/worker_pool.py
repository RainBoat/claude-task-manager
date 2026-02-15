"""Worker pool manager — tracks worker subprocess state."""

from __future__ import annotations

import os
import signal
import subprocess
from datetime import datetime
from typing import Optional

from models import WorkerState, WorkerStatus


class WorkerPool:
    """Manages worker processes and their state."""

    def __init__(self):
        self._workers: dict[str, WorkerState] = {}
        self._processes: dict[str, subprocess.Popen] = {}

    def register(self, worker_id: str, pid: Optional[int] = None) -> WorkerState:
        """Register a worker (called at startup or when discovering running workers)."""
        state = WorkerState(
            id=worker_id,
            pid=pid,
            status=WorkerStatus.IDLE if pid else WorkerStatus.STOPPED,
            started_at=datetime.utcnow().isoformat() if pid else None,
        )
        self._workers[worker_id] = state
        return state

    def get_all(self) -> list[WorkerState]:
        """Get all worker states, refreshing from process status."""
        # Re-discover if any workers have no PID
        if any(s.pid is None for s in self._workers.values()):
            self.discover_workers()
        for wid in list(self._workers.keys()):
            self._refresh_state(wid)
        return list(self._workers.values())

    def get(self, worker_id: str) -> Optional[WorkerState]:
        """Get a single worker's state."""
        self._refresh_state(worker_id)
        return self._workers.get(worker_id)

    def update_from_tasks(self, tasks: list) -> None:
        """Update worker states based on current task assignments."""
        # Build map of worker_id -> active task
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
            else:
                if state.status == WorkerStatus.BUSY:
                    state.status = WorkerStatus.IDLE
                    state.current_task_id = None
                    state.current_task_title = None

    def restart_worker(self, worker_id: str) -> bool:
        """Restart a worker process."""
        state = self._workers.get(worker_id)
        if not state:
            return False

        # Kill existing process
        if state.pid:
            try:
                os.kill(state.pid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                pass

        # Start new process (ralph.sh only needs WORKER_ID; paths are derived from project_id)
        env = os.environ.copy()
        env["WORKER_ID"] = worker_id

        proc = subprocess.Popen(
            ["/app/worker/ralph.sh"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        state.pid = proc.pid
        state.status = WorkerStatus.IDLE
        state.started_at = datetime.utcnow().isoformat()
        state.current_task_id = None
        state.current_task_title = None
        self._processes[worker_id] = proc

        return True

    def discover_workers(self) -> None:
        """Discover running worker processes using ps + environ."""
        try:
            # Method 1: pgrep + /proc/PID/environ
            result = subprocess.run(
                ["pgrep", "-f", "ralph.sh"],
                capture_output=True, text=True,
            )
            pids = [int(p) for p in result.stdout.strip().split("\n") if p.strip()]

            for pid in pids:
                try:
                    with open(f"/proc/{pid}/environ", "r") as f:
                        environ = f.read()
                    for part in environ.split("\0"):
                        if part.startswith("WORKER_ID="):
                            wid = part.split("=", 1)[1]
                            if wid not in self._workers:
                                self.register(wid, pid)
                            else:
                                self._workers[wid].pid = pid
                                self._workers[wid].status = WorkerStatus.IDLE
                                self._workers[wid].started_at = self._workers[wid].started_at or datetime.utcnow().isoformat()
                            break
                except (FileNotFoundError, PermissionError):
                    pass

            # Method 2: If we found ralph.sh PIDs but couldn't match them,
            # assign them round-robin to registered workers without PIDs
            unmatched_pids = []
            matched_pids = {s.pid for s in self._workers.values() if s.pid}
            for pid in pids:
                if pid not in matched_pids:
                    unmatched_pids.append(pid)

            for wid, state in self._workers.items():
                if state.pid is None and unmatched_pids:
                    state.pid = unmatched_pids.pop(0)
                    state.status = WorkerStatus.IDLE
                    state.started_at = state.started_at or datetime.utcnow().isoformat()

        except Exception:
            pass

        # Method 3: If still no PIDs found, check if workers are likely running
        # (container just started, workers should be alive)
        for wid, state in self._workers.items():
            if state.pid is None and state.status == WorkerStatus.STOPPED:
                try:
                    result = subprocess.run(
                        ["pgrep", "-f", f"WORKER_ID={wid}"],
                        capture_output=True, text=True,
                    )
                    if result.stdout.strip():
                        pid = int(result.stdout.strip().split("\n")[0])
                        state.pid = pid
                        state.status = WorkerStatus.IDLE
                        state.started_at = state.started_at or datetime.utcnow().isoformat()
                except Exception:
                    pass

    def _refresh_state(self, worker_id: str) -> None:
        """Check if a worker's process is still alive."""
        state = self._workers.get(worker_id)
        if not state or not state.pid:
            return

        try:
            os.kill(state.pid, 0)  # signal 0 = check existence
        except ProcessLookupError:
            state.status = WorkerStatus.STOPPED
            state.pid = None
        except PermissionError:
            pass  # process exists but we can't signal it


# Singleton
pool = WorkerPool()
