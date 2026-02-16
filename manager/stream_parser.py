"""Stream-json parser for Claude Code output logs."""

from __future__ import annotations

import asyncio
import json
import os
from typing import AsyncGenerator


def _summarize_tool_input(tool_name: str, tool_input: dict | str) -> str:
    """Generate a human-readable summary for common tool inputs."""
    if isinstance(tool_input, str):
        return tool_input[:120]
    if not isinstance(tool_input, dict):
        return str(tool_input)[:120]

    name = tool_name.lower()
    if name in ("read", "readfile"):
        return tool_input.get("file_path", tool_input.get("path", ""))
    if name in ("edit", "editfile"):
        fp = tool_input.get("file_path", "")
        old = (tool_input.get("old_string", "") or "")[:40]
        return f"{fp}  {old}…" if old else fp
    if name in ("write", "writefile"):
        return tool_input.get("file_path", tool_input.get("path", ""))
    if name == "bash":
        return tool_input.get("command", "")[:120]
    if name in ("grep", "ripgrep", "search"):
        pattern = tool_input.get("pattern", "")
        path = tool_input.get("path", "")
        return f"/{pattern}/ {path}".strip()
    if name == "glob":
        return tool_input.get("pattern", "")
    if name in ("task", "todowrite"):
        return tool_input.get("description", tool_input.get("prompt", ""))[:120]
    # Fallback: first string value
    for v in tool_input.values():
        if isinstance(v, str) and v:
            return v[:120]
    return str(tool_input)[:120]


async def tail_log(log_path: str) -> AsyncGenerator[dict, None]:
    """Async generator that tails a .jsonl log file and yields parsed events."""
    if not os.path.exists(log_path):
        for _ in range(60):
            await asyncio.sleep(1)
            if os.path.exists(log_path):
                break
        else:
            return

    with open(log_path, "r") as f:
        f.seek(0, 2)

        while True:
            line = f.readline()
            if not line:
                await asyncio.sleep(0.3)
                continue

            line = line.strip()
            if not line:
                continue

            try:
                event = json.loads(line)
                for parsed in _parse_event(event):
                    yield parsed
            except json.JSONDecodeError:
                yield {"type": "raw", "text": line[:500]}


def parse_log_file(log_path: str) -> list[dict]:
    """Parse an entire log file and return list of parsed events."""
    events = []
    if not os.path.exists(log_path):
        return events

    with open(log_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                events.extend(_parse_event(event))
            except json.JSONDecodeError:
                events.append({"type": "raw", "text": line[:500]})

    return events


def _parse_event(event: dict) -> list[dict]:
    """Parse a single stream-json event into a list of granular events."""
    etype = event.get("type", "")
    results: list[dict] = []

    if etype == "assistant":
        message = event.get("message", {})
        if isinstance(message, dict):
            content_blocks = message.get("content", [])
            for block in content_blocks:
                if block.get("type") == "text":
                    text = block.get("text", "")
                    if text and text.strip():
                        results.append({"type": "assistant", "text": text})
                elif block.get("type") == "tool_use":
                    tool_name = block.get("name", "unknown")
                    raw_input = block.get("input", {})
                    results.append({
                        "type": "tool_use",
                        "tool": tool_name,
                        "input": _summarize_tool_input(tool_name, raw_input),
                        "input_raw": str(raw_input)[:500],
                    })
        elif isinstance(message, str):
            if message.strip():
                results.append({"type": "assistant", "text": message})

    elif etype == "result":
        results.append({
            "type": "result",
            "subtype": event.get("subtype", ""),
            "cost": event.get("cost_usd"),
            "duration": event.get("duration_ms"),
            "turns": event.get("num_turns"),
            "session_id": event.get("session_id"),
        })

    elif etype == "error":
        results.append({
            "type": "error",
            "error": str(event.get("error", "unknown error"))[:500],
        })

    elif etype == "system":
        text = str(event.get("message", ""))[:300]
        if text.strip():
            results.append({"type": "system", "text": text})

    return results
