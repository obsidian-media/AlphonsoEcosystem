"""
Per-user request limits for the paid Cloud Voice endpoints.

Every /v1/voice/respond and /v1/voice/sessions/analyze call spends real NVIDIA
LLM (and TTS) usage against one shared API key, so a single account must not be
able to exhaust that key for everyone else (2026-09-30 pre-launch audit, H-1).

Two limits, both keyed by the authenticated Supabase user id (never by a
client-supplied value):
  - a sliding one-minute burst limit (VOICE_RATE_PER_MINUTE, default 20)
  - a rolling 24-hour quota       (VOICE_DAILY_QUOTA,     default 300)
Setting either env var to 0 disables that limit.

Process-local by design: the service runs as a single ECS task today. If it is
ever scaled horizontally these counters must move to a shared store (Redis /
a Supabase table), otherwise each task enforces its own copy of the limit.
"""

from __future__ import annotations

import os
import threading
import time
from collections import deque

from fastapi import HTTPException

_WINDOW_MINUTE = 60.0
_WINDOW_DAY = 86_400.0


def _limit_from_env(name: str, default: int) -> int:
    try:
        return max(0, int(os.environ.get(name, str(default)).strip()))
    except ValueError:
        return default


class UserQuota:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._events.clear()

    def check_and_record(self, user_id: str, now: float | None = None) -> None:
        per_minute = _limit_from_env("VOICE_RATE_PER_MINUTE", 20)
        per_day = _limit_from_env("VOICE_DAILY_QUOTA", 300)
        now = time.time() if now is None else now
        key = str(user_id)
        with self._lock:
            events = self._events.setdefault(key, deque())
            while events and now - events[0] > _WINDOW_DAY:
                events.popleft()
            if per_day and len(events) >= per_day:
                raise HTTPException(status_code=429, detail="Daily voice quota reached. Try again tomorrow.")
            if per_minute:
                recent = sum(1 for stamp in events if now - stamp <= _WINDOW_MINUTE)
                if recent >= per_minute:
                    raise HTTPException(status_code=429, detail="Too many voice requests. Slow down and retry shortly.")
            events.append(now)


voice_quota = UserQuota()
