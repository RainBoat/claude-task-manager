#!/usr/bin/env python3
"""Log task completion experience to PROGRESS.md in the main repo.

Generates structured experience entries (problem/solution/prevention)
instead of raw log truncation, so future workers can learn from history.
"""

import argparse
import json
import os
import subprocess
from datetime import datetime

from global_experience import append_global_entry


def extract_summary_from_log(log_file: str) -> str:
    """Extract assistant messages from the Claude Code stream-json log."""
    if not os.path.exists(log_file):
        return ""

    try:
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
                                    messages.append(block["text"])
                        elif isinstance(msg, str):
                            messages.append(msg)
                except (json.JSONDecodeError, KeyError):
                    continue

        # Return last few messages (most relevant), capped at 4000 chars
        combined = "\n---\n".join(messages[-5:])
        return combined[-4000:] if len(combined) > 4000 else combined
    except Exception:
        return ""


def generate_structured_experience(
    task_title: str, task_id: str, worker_id: str,
    commit_id: str, log_summary: str, repo_dir: str,
) -> str:
    """Use Claude to generate a structured experience entry from the raw log."""
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # If no log summary, write a minimal entry
    if not log_summary.strip():
        return f"""
## [{task_id}] {task_title}
- **Worker**: {worker_id}
- **Completed**: {timestamp}
- **Commit**: `{commit_id[:12] if commit_id else 'N/A'}`
- **Problem**: N/A
- **Solution**: Task completed without notable issues.
- **Prevention**: N/A

"""

    prompt = f"""Analyze this task completion log and generate a structured experience entry.

Task: {task_title} (ID: {task_id})

Worker log (last messages):
{log_summary}

Respond with ONLY a markdown block in this exact format (no extra text):

- **Problem**: One sentence describing the main challenge or issue encountered (or "No significant issues" if straightforward)
- **Solution**: One sentence describing how it was resolved
- **Prevention**: One sentence on how to avoid this issue in future tasks (or "N/A" if no issues)
- **Key files**: Comma-separated list of main files modified"""

    try:
        result = subprocess.run(
            ["claude", "-p", prompt,
             "--dangerously-skip-permissions",
             "--output-format", "json"],
            capture_output=True, text=True, timeout=60,
            cwd=repo_dir,
        )

        reflection = ""
        if result.returncode == 0:
            try:
                output = json.loads(result.stdout)
                raw = output.get("result", "")
                reflection = raw if isinstance(raw, str) else str(raw)
            except (json.JSONDecodeError, TypeError):
                reflection = result.stdout

        if not reflection.strip():
            reflection = (
                "- **Problem**: N/A\n"
                "- **Solution**: Task completed successfully.\n"
                "- **Prevention**: N/A\n"
                "- **Key files**: (see commit)"
            )

        return f"""
## [{task_id}] {task_title}
- **Worker**: {worker_id}
- **Completed**: {timestamp}
- **Commit**: `{commit_id[:12] if commit_id else 'N/A'}`
{reflection}

"""
    except (subprocess.TimeoutExpired, Exception):
        # Fallback to basic entry if Claude call fails
        return f"""
## [{task_id}] {task_title}
- **Worker**: {worker_id}
- **Completed**: {timestamp}
- **Commit**: `{commit_id[:12] if commit_id else 'N/A'}`
- **Problem**: (experience generation timed out)
- **Solution**: Task completed — see commit for details.
- **Prevention**: N/A

"""


def main():
    parser = argparse.ArgumentParser(description="Log experience to PROGRESS.md")
    parser.add_argument("--repo-dir", required=True)
    parser.add_argument("--project-id", default="")
    parser.add_argument("--project-name", default="")
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--task-title", required=True)
    parser.add_argument("--worker-id", required=True)
    parser.add_argument("--commit-id", default="unknown")
    parser.add_argument("--log-file", default=None)
    args = parser.parse_args()

    progress_file = os.path.join(args.repo_dir, "PROGRESS.md")

    # Extract raw log content
    log_summary = ""
    if args.log_file:
        log_summary = extract_summary_from_log(args.log_file)

    # Generate structured experience entry
    entry = generate_structured_experience(
        task_title=args.task_title,
        task_id=args.task_id,
        worker_id=args.worker_id,
        commit_id=args.commit_id,
        log_summary=log_summary,
        repo_dir=args.repo_dir,
    )

    # Append to project-local PROGRESS.md
    with open(progress_file, "a") as f:
        f.write(entry)

    # Append to global cross-project experience store (non-fatal)
    try:
        append_global_entry(
            project_id=args.project_id,
            project_name=args.project_name,
            task_id=args.task_id,
            task_title=args.task_title,
            local_entry=entry,
        )
    except Exception:
        pass

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
