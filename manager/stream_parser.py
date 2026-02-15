"""Stream-json parser for Claude Code output logs."""

from __future__ import annotations

import asyncio
import json
import os
from typing import AsyncGenerator


async def tail_log(log_path: str) -> AsyncGenerator[dict, None]:
    """Async generator that tails a .jsonl log file and yields parsed events."""
    if not os.path.exists(log_path):
        # Wait for file to appear
        for _ in range(60):
            await asyncio.sleep(1)
            if os.path.exists(log_path):
                break
        else:
            return

    with open(log_path, "r") as f:
        # Seek to end for live tailing
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
                parsed = _parse_event(event)
                if parsed:
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
                parsed = _parse_event(event)
                if parsed:
                    events.append(parsed)
            except json.JSONDecodeError:
                events.append({"type": "raw", "text": line[:500]})

    return events


def _parse_event(event: dict) -> dict | None:
    """Parse a single stream-json event into a simplified format."""
    etype = event.get("type", "")

    if etype == "assistant":
        message = event.get("message", {})
        if isinstance(message, dict):
            content_blocks = message.get("content", [])
            texts = []
            tool_uses = []
            for block in content_blocks:
                if block.get("type") == "text":
                    texts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    tool_uses.append({
                        "tool": block.get("name", "unknown"),
                        "input_preview": str(block.get("input", ""))[:200],
                    })
            return {
                "type": "assistant",
                "text": "\n".join(texts) if texts else None,
                "tool_uses": tool_uses if tool_uses else None,
            }
        elif isinstance(message, str):
            return {"type": "assistant", "text": message}

    elif etype == "result":
        return {
            "type": "result",
            "subtype": event.get("subtype", ""),
            "cost": event.get("cost_usd"),
            "duration": event.get("duration_ms"),
            "turns": event.get("num_turns"),
        }

    elif etype == "error":
        return {
            "type": "error",
            "error": str(event.get("error", "unknown error"))[:500],
        }

    elif etype == "system":
        return {
            "type": "system",
            "text": str(event.get("message", ""))[:300],
        }

    return None
