"""Task scheduler — background loop that claims tasks and dispatches them to worker containers.

Replaces the ralph.sh polling loop. Runs as an asyncio task inside the FastAPI process.
Handles: claim → worktree create → container start → wait → merge/test → cleanup → experience log.
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
from datetime import datetime
from typing import Optional

import dispatcher
import event_log
from models import TaskStatus, ProjectStatus

logger = logging.getLogger(__name__)

# Will be set by app.py at startup
container_pool = None  # type: ignore
_QUERY_GLOBAL_EXPERIENCE_SCRIPT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "worker", "query_global_experience.py")
)

# Per-project git locks to serialize merge operations
_project_git_locks: dict[str, asyncio.Lock] = {}


def _get_project_lock(project_id: str) -> asyncio.Lock:
    if project_id not in _project_git_locks:
        _project_git_locks[project_id] = asyncio.Lock()
    return _project_git_locks[project_id]


def _run_git(args: list[str], cwd: str, timeout: int = 60) -> subprocess.CompletedProcess:
    """Run a git command synchronously (call from executor)."""
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, cwd=cwd)


def _stash_dirty_repo(repo_dir: str, worker_id: str) -> bool:
    """Stash local changes (including untracked) before merge to keep repo_dir clean."""
    status = _run_git(["git", "status", "--porcelain"], cwd=repo_dir)
    if status.returncode != 0:
        logger.warning(f"[{worker_id}] Cannot inspect repo status before merge: {status.stderr[:200]}")
        return False

    if not status.stdout.strip():
        return True

    stash_msg = f"auto-merge preflight ({worker_id}) {datetime.utcnow().isoformat()}"
    logger.warning(f"[{worker_id}] Repo dirty before auto-merge, stashing local changes")
    stash = _run_git(
        ["git", "stash", "push", "--include-untracked", "-m", stash_msg],
        cwd=repo_dir,
        timeout=120,
    )
    if stash.returncode != 0:
        logger.warning(f"[{worker_id}] Failed to stash local changes: {stash.stderr[:200]}")
        return False
    return True


def _load_cross_project_experience(project_id: str, task_title: str, task_desc: str) -> str:
    """Load relevant experience snippets from other projects."""
    if not os.path.isfile(_QUERY_GLOBAL_EXPERIENCE_SCRIPT):
        return ""

    try:
        result = subprocess.run(
            [
                "python3",
                _QUERY_GLOBAL_EXPERIENCE_SCRIPT,
                "--project-id", project_id,
                "--task-title", task_title or "",
                "--task-desc", task_desc or "",
                "--max-entries", "3",
                "--max-chars", "2500",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        return ""

    return ""


def _create_worktree(repo_dir: str, worktree_dir: str, branch_name: str, branch_base: str) -> bool:
    """Create a git worktree for a task. Returns True on success."""
    # Clean stale worktree
    if os.path.isdir(worktree_dir):
        _run_git(["git", "worktree", "remove", "--force", worktree_dir], cwd=repo_dir)
        if os.path.isdir(worktree_dir):
            import shutil
            shutil.rmtree(worktree_dir, ignore_errors=True)

    # Fetch latest
    _run_git(["git", "fetch", "origin"], cwd=repo_dir, timeout=120)

    # Determine base ref
    for candidate in [f"origin/{branch_base}", branch_base, "HEAD"]:
        r = _run_git(["git", "rev-parse", "--verify", candidate], cwd=repo_dir)
        if r.returncode == 0:
            base_ref = candidate
            break
    else:
        base_ref = "HEAD"

    # Clean stale worktree holding the target branch
    r = _run_git(["git", "worktree", "list", "--porcelain"], cwd=repo_dir)
    if r.returncode == 0:
        current_wt = None
        for line in r.stdout.splitlines():
            if line.startswith("worktree "):
                current_wt = line.split(" ", 1)[1]
            elif line.startswith("branch refs/heads/") and current_wt:
                if line.split("branch refs/heads/")[1] == branch_name and current_wt != repo_dir:
                    _run_git(["git", "worktree", "remove", "--force", current_wt], cwd=repo_dir)
                current_wt = None

    _run_git(["git", "worktree", "prune"], cwd=repo_dir)

    # Delete branch if exists
    _run_git(["git", "branch", "-D", branch_name], cwd=repo_dir)

    # Create worktree
    r = _run_git(["git", "worktree", "add", "-b", branch_name, worktree_dir, base_ref], cwd=repo_dir)
    if r.returncode != 0:
        logger.error(f"Failed to create worktree: {r.stderr}")
        return False

    # Inject CLAUDE.md
    template = "/app/claude-md-template.md"
    if os.path.exists(template):
        import shutil
        shutil.copy2(template, os.path.join(worktree_dir, "CLAUDE.md"))
        # Exclude from git tracking
        git_dir_r = _run_git(["git", "rev-parse", "--git-dir"], cwd=worktree_dir)
        if git_dir_r.returncode == 0:
            exclude_dir = os.path.join(git_dir_r.stdout.strip(), "info")
            os.makedirs(exclude_dir, exist_ok=True)
            exclude_file = os.path.join(exclude_dir, "exclude")
            existing = ""
            if os.path.exists(exclude_file):
                with open(exclude_file) as f:
                    existing = f.read()
            if "CLAUDE.md" not in existing:
                with open(exclude_file, "a") as f:
                    f.write("CLAUDE.md\n")

    return True


def _do_merge_and_test(
    repo_dir: str, worktree_dir: str, branch_name: str, branch_base: str,
    worker_id: str, task_id: str,
) -> tuple[bool, str, str]:
    """Run merge_and_test.sh synchronously.

    Returns:
        (success, failure_reason, combined_output)
    """
    env = os.environ.copy()
    env.update({
        "WORKTREE_DIR": worktree_dir,
        "REPO_DIR": repo_dir,
        "BRANCH_BASE": branch_base,
        "WORKER_ID": worker_id,
        "TASK_ID": task_id,
    })
    try:
        r = subprocess.run(
            ["/app/worker/merge_and_test.sh"],
            env=env, capture_output=True, text=True, timeout=600,
        )
        output = "\n".join(part for part in (r.stdout, r.stderr) if part).strip()

        reason = ""
        if output:
            for line in reversed(output.splitlines()):
                if "MERGE_TEST_ERROR:" in line:
                    reason = line.split("MERGE_TEST_ERROR:", 1)[1].strip()
                    break

        if not reason and r.returncode != 0:
            if output:
                reason = output.splitlines()[-1].strip()
            else:
                reason = f"merge_and_test exit code {r.returncode}"

        return r.returncode == 0, reason, output
    except subprocess.TimeoutExpired as e:
        stdout = e.stdout or ""
        stderr = e.stderr or ""
        output = "\n".join(part for part in (stdout, stderr) if part).strip()
        reason = "merge_and_test timeout after 600s"
        logger.error(f"merge_and_test failed: {reason}")
        return False, reason, output
    except Exception as e:
        reason = f"merge_and_test execution error: {e}"
        logger.error(f"merge_and_test failed: {e}")
        return False, reason, ""


def _do_auto_merge(
    repo_dir: str, branch_name: str, branch_base: str,
    auto_push: bool, worker_id: str,
) -> Optional[str]:
    """Merge branch into main, optionally push. Returns final commit SHA or None on failure."""
    if not _stash_dirty_repo(repo_dir, worker_id):
        logger.warning(f"[{worker_id}] Cannot prepare clean repo for auto-merge")
        return None

    # Remove untracked CLAUDE.md to prevent merge conflicts
    claude_md = os.path.join(repo_dir, "CLAUDE.md")
    if os.path.exists(claude_md):
        try:
            r = _run_git(["git", "ls-files", "--error-unmatch", "CLAUDE.md"], cwd=repo_dir)
            if r.returncode != 0:
                os.remove(claude_md)
        except Exception:
            pass

    # Ensure we're on the base branch before merging
    co = _run_git(["git", "checkout", branch_base], cwd=repo_dir)
    if co.returncode != 0:
        logger.warning(f"[{worker_id}] Cannot checkout {branch_base}: {co.stderr[:200]}")
        # Try force-creating from origin
        co = _run_git(["git", "checkout", "-B", branch_base, f"origin/{branch_base}"], cwd=repo_dir)
        if co.returncode != 0:
            logger.warning(f"[{worker_id}] Cannot checkout {branch_base} from origin either")
            return None

    # Verify the branch ref exists
    verify = _run_git(["git", "rev-parse", "--verify", branch_name], cwd=repo_dir)
    if verify.returncode != 0:
        logger.warning(f"[{worker_id}] Branch {branch_name} not found in repo")
        return None

    r = _run_git(["git", "merge", branch_name, "--no-edit"], cwd=repo_dir)
    if r.returncode != 0:
        logger.warning(f"[{worker_id}] Merge to main failed (exit {r.returncode}): stdout={r.stdout[:200]} stderr={r.stderr[:200]}")
        _run_git(["git", "merge", "--abort"], cwd=repo_dir)
        return None

    # Push if enabled
    if auto_push:
        has_remote = _run_git(["git", "remote"], cwd=repo_dir)
        if has_remote.stdout.strip():
            _run_git(["git", "push", "origin", branch_base], cwd=repo_dir, timeout=120)

    commit_r = _run_git(["git", "rev-parse", "HEAD"], cwd=repo_dir)
    return commit_r.stdout.strip() if commit_r.returncode == 0 else None


def _log_experience(
    repo_dir: str, task_id: str, task_title: str,
    worker_id: str, commit_id: str, log_file: str,
    project_id: str, project_name: str,
) -> None:
    """Run log_experience.py to record task outcome."""
    try:
        subprocess.run(
            ["python3", "/app/worker/log_experience.py",
             "--repo-dir", repo_dir,
             "--project-id", project_id,
             "--project-name", project_name,
             "--task-id", task_id,
             "--task-title", task_title,
             "--worker-id", worker_id,
             "--commit-id", commit_id,
             "--log-file", log_file],
            capture_output=True, text=True, timeout=120,
        )
    except Exception as e:
        logger.warning(f"Experience logging failed: {e}")


def _cleanup_worktree(repo_dir: str, worktree_dir: str, branch_name: str, delete_branch: bool = True) -> None:
    """Remove worktree and optionally delete the branch."""
    _run_git(["git", "worktree", "remove", "--force", worktree_dir], cwd=repo_dir)
    if os.path.isdir(worktree_dir):
        import shutil
        shutil.rmtree(worktree_dir, ignore_errors=True)
    if delete_branch:
        _run_git(["git", "branch", "-D", branch_name], cwd=repo_dir)


async def _handle_task(worker_id: str, project_id: str, task) -> None:
    """Full lifecycle for one task: worktree → container → merge/test → cleanup."""
    loop = asyncio.get_event_loop()
    pool = container_pool

    project = dispatcher.get_project(project_id)
    if not project:
        logger.error(f"Project {project_id} not found")
        dispatcher.update_task_status(project_id, task.id, TaskStatus.FAILED, error="project not found")
        pool.mark_idle(worker_id)
        return

    repo_dir = f"/app/data/projects/{project_id}/repo"
    worktree_base = f"/app/data/projects/{project_id}/worktrees"
    log_dir = f"/app/data/projects/{project_id}/logs"
    worktree_dir = os.path.join(worktree_base, worker_id)
    branch_name = f"claude/{task.id}"
    branch_base = project.branch or "main"
    log_file = os.path.join(log_dir, f"{worker_id}.jsonl")

    os.makedirs(log_dir, exist_ok=True)
    os.makedirs(worktree_base, exist_ok=True)

    # 1. Create worktree
    event_log.emit(worker_id, f"Creating worktree on branch {branch_name}")
    ok = await loop.run_in_executor(
        None, _create_worktree, repo_dir, worktree_dir, branch_name, branch_base
    )
    if not ok:
        event_log.emit(worker_id, f"Worktree creation failed for task {task.id}")
        dispatcher.update_task_status(project_id, task.id, TaskStatus.FAILED, error="worktree creation failed")
        pool.mark_idle(worker_id)
        return

    cross_project_experience = await loop.run_in_executor(
        None, _load_cross_project_experience, project_id, task.title, task.description
    )
    if cross_project_experience:
        event_log.emit(worker_id, "Loaded cross-project experience context")

    # 2. Start worker container
    event_log.emit(worker_id, f"Starting container...")
    started = pool.run_task(
        worker_id=worker_id,
        project_id=project_id,
        project_name=project.name,
        task=task,
        worktree_path=worktree_dir,
        repo_path=repo_dir,
        log_dir=log_dir,
        branch_name=branch_name,
        cross_project_experience=cross_project_experience,
    )
    if not started:
        event_log.emit(worker_id, f"Container start failed for task {task.id}")
        dispatcher.update_task_status(project_id, task.id, TaskStatus.FAILED, error="container start failed")
        await loop.run_in_executor(None, _cleanup_worktree, repo_dir, worktree_dir, branch_name, True)
        pool.mark_idle(worker_id)
        return

    event_log.emit(worker_id, f"Container started for: {task.title}")

    # 3. Wait for container to finish
    result = await loop.run_in_executor(None, pool.wait_container, worker_id)
    exit_code = result.get("StatusCode", -1)
    wait_error = result.get("Error")
    if wait_error:
        logger.warning(f"[{worker_id}] Container wait returned error for task {task.id}: {wait_error}")
        event_log.emit(worker_id, f"Container wait warning: {wait_error}")
    event_log.emit(worker_id, f"Container exited (code {exit_code})")
    logger.info(f"[{worker_id}] Container exited with code {exit_code} for task {task.id}")

    # 4. Check task status (container should have called /api/internal/... to update)
    updated_task = dispatcher.get_task(project_id, task.id)
    if not updated_task:
        pool.mark_idle(worker_id)
        return

    if updated_task.status == TaskStatus.FAILED:
        # Container reported failure — cleanup
        event_log.emit(worker_id, f"Task failed: {updated_task.error or 'unknown error'}")
        await loop.run_in_executor(None, _cleanup_worktree, repo_dir, worktree_dir, branch_name, True)
        pool.mark_idle(worker_id)
        return

    if updated_task.status != TaskStatus.MERGING:
        # Unexpected state — if container exited non-zero but didn't report, mark failed
        if exit_code != 0:
            event_log.emit(worker_id, f"Task failed: container exit {exit_code}")
            dispatcher.update_task_status(project_id, task.id, TaskStatus.FAILED, error=f"container exit {exit_code}")
            await loop.run_in_executor(None, _cleanup_worktree, repo_dir, worktree_dir, branch_name, True)
            pool.mark_idle(worker_id)
            return

    # 5. Verify commit exists in worktree before merging
    commit_check = await loop.run_in_executor(
        None, lambda: _run_git(["git", "log", "--oneline", "-1"], cwd=worktree_dir)
    )
    if commit_check.returncode != 0 or not commit_check.stdout.strip():
        event_log.emit(worker_id, f"Task failed: no valid commit in worktree")
        dispatcher.update_task_status(
            project_id, task.id, TaskStatus.FAILED,
            error="no valid commit found in worktree after worker completed",
        )
        await loop.run_in_executor(None, _cleanup_worktree, repo_dir, worktree_dir, branch_name, True)
        pool.mark_idle(worker_id)
        return

    # Verify the branch has commits beyond the base
    diff_check = await loop.run_in_executor(
        None, lambda: _run_git(["git", "log", f"{branch_base}..HEAD", "--oneline"], cwd=worktree_dir)
    )
    if not diff_check.stdout.strip():
        event_log.emit(worker_id, f"Task failed: worker produced no new commits")
        dispatcher.update_task_status(
            project_id, task.id, TaskStatus.FAILED,
            error="worker produced no new commits on branch",
        )
        await loop.run_in_executor(None, _cleanup_worktree, repo_dir, worktree_dir, branch_name, True)
        pool.mark_idle(worker_id)
        return

    # 6. Merge and test + auto-merge (serialized per-project to avoid race conditions)
    async with _get_project_lock(project_id):
        event_log.emit(worker_id, f"Running merge & test...")
        merge_ok, merge_reason, merge_output = await loop.run_in_executor(
            None, _do_merge_and_test, repo_dir, worktree_dir, branch_name, branch_base, worker_id, task.id
        )

        if not merge_ok:
            failure_reason = merge_reason or "merge or test failed"
            event_log.emit(worker_id, f"Task failed: {failure_reason}")

            if merge_output:
                tail_lines = merge_output.splitlines()[-50:]
                tail_text = "\n".join(tail_lines)
                # Keep event payload bounded so recent events remain readable.
                if len(tail_text) > 6000:
                    tail_text = tail_text[-6000:]
                event_log.emit(worker_id, f"merge/test log tail:\n{tail_text}")

            dispatcher.update_task_status(
                project_id,
                task.id,
                TaskStatus.FAILED,
                error=f"merge or test failed: {failure_reason}",
            )
            await loop.run_in_executor(None, _cleanup_worktree, repo_dir, worktree_dir, branch_name, True)
            pool.mark_idle(worker_id)
            return

        # 7. Auto-merge or mark merge_pending
        final_commit = None
        if project.auto_merge:
            final_commit = await loop.run_in_executor(
                None, _do_auto_merge, repo_dir, branch_name, branch_base, project.auto_push, worker_id
            )
            if final_commit:
                # Merge succeeded — mark completed, cleanup branch
                dispatcher.update_task_status(
                    project_id, task.id, TaskStatus.COMPLETED, commit_id=final_commit
                )
                event_log.emit(worker_id, f"Task completed: {task.title}")
                await loop.run_in_executor(
                    None, _log_experience, repo_dir, task.id, task.title, worker_id, final_commit, log_file,
                    project_id, project.name
                )
                event_log.emit(worker_id, f"Cleaning up worktree")
                await loop.run_in_executor(None, _cleanup_worktree, repo_dir, worktree_dir, branch_name, True)

                # Delete remote branch if auto_push
                if project.auto_push:
                    await loop.run_in_executor(
                        None, lambda: _run_git(["git", "push", "origin", "--delete", branch_name], cwd=repo_dir)
                    )
            else:
                # Merge to main failed — keep branch, mark merge_pending for manual merge
                commit_r = await loop.run_in_executor(
                    None, lambda: _run_git(["git", "rev-parse", "HEAD"], cwd=worktree_dir)
                )
                final_commit = commit_r.stdout.strip() if commit_r.returncode == 0 else "unknown"
                dispatcher.update_task_status(
                    project_id, task.id, TaskStatus.MERGE_PENDING, commit_id=final_commit
                )
                event_log.emit(worker_id, f"Auto-merge failed, kept branch {branch_name} for manual merge")
                await loop.run_in_executor(
                    None, _log_experience, repo_dir, task.id, task.title, worker_id, final_commit, log_file,
                    project_id, project.name
                )
                # Cleanup worktree but keep branch so commits are not lost
                await loop.run_in_executor(None, _cleanup_worktree, repo_dir, worktree_dir, branch_name, False)
        else:
            # Manual merge mode
            commit_r = await loop.run_in_executor(
                None, lambda: _run_git(["git", "rev-parse", "HEAD"], cwd=worktree_dir)
            )
            final_commit = commit_r.stdout.strip() if commit_r.returncode == 0 else "unknown"

            dispatcher.update_task_status(
                project_id, task.id, TaskStatus.MERGE_PENDING, commit_id=final_commit
            )
            event_log.emit(worker_id, f"Task ready for merge: {task.title}")
            await loop.run_in_executor(
                None, _log_experience, repo_dir, task.id, task.title, worker_id, final_commit, log_file,
                project_id, project.name
            )

            # Cleanup worktree only (keep branch for manual merge)
            await loop.run_in_executor(None, _cleanup_worktree, repo_dir, worktree_dir, branch_name, False)

    pool.mark_idle(worker_id)
    logger.info(f"[{worker_id}] Task {task.id} lifecycle complete. Commit: {final_commit}")


async def task_dispatcher_loop():
    """Background coroutine: continuously check for pending tasks and dispatch to idle workers."""
    logger.info("Task dispatcher loop started")

    while True:
        try:
            pool = container_pool
            if pool is None:
                await asyncio.sleep(5)
                continue

            # Find an idle worker slot
            idle_worker = pool.get_idle_worker()
            if not idle_worker:
                await asyncio.sleep(10)
                continue

            # Claim next task (cross-project)
            result = dispatcher.claim_next(idle_worker)
            if not result:
                await asyncio.sleep(15)
                continue

            project_id, task = result
            logger.info(f"[{idle_worker}] Claimed task {task.id} from project {project_id}: {task.title}")
            event_log.emit(idle_worker, f"Claimed task: {task.title}")

            # Dispatch task handling as a background coroutine (don't block the loop)
            asyncio.create_task(_handle_task(idle_worker, project_id, task))

            # Small delay before checking for more tasks
            await asyncio.sleep(2)

        except Exception as e:
            logger.exception(f"Dispatcher loop error: {e}")
            await asyncio.sleep(10)
