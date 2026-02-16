"""In-memory event log for dispatcher/system events, exposed via API for frontend display."""

from datetime import datetime
from collections import deque

_events: deque[dict] = deque(maxlen=200)


def emit(source: str, message: str):
    """Append an event. source: 'worker-1', 'system', 'dispatcher', etc."""
    _events.append({
        "ts": datetime.utcnow().isoformat(),
        "source": source,
        "message": message,
    })


def recent(limit: int = 50) -> list[dict]:
    """Return the most recent events."""
    return list(_events)[-limit:]
