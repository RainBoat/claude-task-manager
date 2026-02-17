#!/usr/bin/env python3
"""CLI wrapper for querying cross-project experience snippets."""

from __future__ import annotations

import argparse

from global_experience import query_cross_project_experience


def main() -> None:
    parser = argparse.ArgumentParser(description="Query cross-project experience")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--task-title", default="")
    parser.add_argument("--task-desc", default="")
    parser.add_argument("--max-entries", type=int, default=3)
    parser.add_argument("--max-chars", type=int, default=2500)
    args = parser.parse_args()

    result = query_cross_project_experience(
        current_project_id=args.project_id,
        task_title=args.task_title,
        task_desc=args.task_desc,
        max_entries=args.max_entries,
        max_chars=args.max_chars,
    )
    if result:
        print(result)


if __name__ == "__main__":
    main()

