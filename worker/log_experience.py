#!/usr/bin/env python3
"""Log task completion experience to PROGRESS.md in the main repo."""

import argparse
import os
import subprocess
from datetime import datetime


def extract_summary_from_log(log_file: str) -> str:
    """Extract a brief summary from the Claude Code stream-json log."""
    if not os.path.exists(log_file):
        return "No log available"

    try:
        import json
        messages = []
        with open(log_file, "r") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                    if event.get("type") == "assistant" and "message" in event:
                        msg = event["message"]
                        if isinstance(msg, dict):
                            for block in msg.get("content", []):
                                if block.get("type") == "text":
                                    text = block["text"][:200]
                                    messages.append(text)
                        elif isinstance(msg, str):
                            messages.append(msg[:200])
                except (json.JSONDecodeError, KeyError):
                    continue

        if messages:
            return messages[-1]  # Last assistant message as summary
        return "Task completed (no summary extracted)"
    except Exception as e:
        return f"Log parse error: {e}"


def main():
    parser = argparse.ArgumentParser(description="Log experience to PROGRESS.md")
    parser.add_argument("--repo-dir", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--task-title", required=True)
    parser.add_argument("--worker-id", required=True)
    parser.add_argument("--commit-id", default="unknown")
    parser.add_argument("--log-file", default=None)
    args = parser.parse_args()

    progress_file = os.path.join(args.repo_dir, "PROGRESS.md")
    summary = "N/A"
    if args.log_file:
        summary = extract_summary_from_log(args.log_file)

    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    entry = f"""
## [{args.task_id}] {args.task_title}
- **Worker**: {args.worker_id}
- **Completed**: {timestamp}
- **Commit**: `{args.commit_id[:12] if args.commit_id else 'N/A'}`
- **Summary**: {summary}

"""

    # Append to PROGRESS.md
    with open(progress_file, "a") as f:
        f.write(entry)

    # Commit PROGRESS.md to main repo
    try:
        subprocess.run(
            ["git", "-C", args.repo_dir, "add", "PROGRESS.md"],
            check=True, capture_output=True,
        )
        subprocess.run(
            ["git", "-C", args.repo_dir, "commit", "-m",
             f"docs: log experience for task {args.task_id}"],
            check=True, capture_output=True,
        )
    except subprocess.CalledProcessError:
        # Non-fatal: might have nothing to commit
        pass


if __name__ == "__main__":
    main()
