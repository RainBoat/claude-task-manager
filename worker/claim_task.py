#!/usr/bin/env python3
"""CLI tool for workers to claim tasks and update status.

Usage:
    python claim_task.py claim <worker_id>
    python claim_task.py update <project_id> <task_id> <status> [--error "msg"] [--commit "sha"] [--branch "name"]
"""

import argparse
import json
import os
import sys

# Add manager to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "manager"))

from dispatcher import claim_next, update_task_status, get_project
from models import TaskStatus


def main():
    parser = argparse.ArgumentParser(description="Task claim/update CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    # claim — cross-project, returns JSON with project_id
    claim_p = sub.add_parser("claim", help="Claim next pending task (cross-project)")
    claim_p.add_argument("worker_id", help="Worker identifier")

    # update — project-scoped
    update_p = sub.add_parser("update", help="Update task status")
    update_p.add_argument("project_id", help="Project ID")
    update_p.add_argument("task_id", help="Task ID")
    update_p.add_argument("status", choices=[s.value for s in TaskStatus])
    update_p.add_argument("--error", default=None)
    update_p.add_argument("--commit", default=None)
    update_p.add_argument("--branch", default=None)

    # get-settings — return project merge/push settings
    settings_p = sub.add_parser("get-settings", help="Get project settings")
    settings_p.add_argument("project_id", help="Project ID")

    args = parser.parse_args()

    if args.command == "claim":
        result = claim_next(args.worker_id)
        if result:
            project_id, task = result
            out = task.model_dump()
            out["project_id"] = project_id
            print(json.dumps(out, default=str))
            sys.exit(0)
        else:
            print("")
            sys.exit(1)

    elif args.command == "update":
        task = update_task_status(
            project_id=args.project_id,
            task_id=args.task_id,
            status=TaskStatus(args.status),
            error=args.error,
            commit_id=args.commit,
            branch=args.branch,
        )
        if task:
            print(json.dumps(task.model_dump(), default=str))
            sys.exit(0)
        else:
            print(f"Task {args.task_id} not found in project {args.project_id}", file=sys.stderr)
            sys.exit(1)

    elif args.command == "get-settings":
        project = get_project(args.project_id)
        if project:
            print(json.dumps({
                "auto_merge": project.auto_merge,
                "auto_push": project.auto_push,
                "source_type": project.source_type,
            }))
            sys.exit(0)
        else:
            print(f"Project {args.project_id} not found", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
