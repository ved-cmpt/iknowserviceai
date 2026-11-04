"""A small in-process sliding-window rate limiter (ADR-030).

State lives in one process and is lost on restart, so this suits a single-instance deployment.
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable

from app.core.config import get_settings
from app.core.errors import AppError

_PURGE_THRESHOLD = 10_000


class SlidingWindowLimiter:
    def __init__(
        self, limit: int, window_seconds: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._clock = clock
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = {}

    def _purge_expired(self, cutoff: float) -> None:
        """Keep memory bounded when many different keys arrive, for example from a scan."""
        for key in [key for key, hits in self._hits.items() if not hits or hits[-1] <= cutoff]:
            del self._hits[key]

    def retry_after(self, key: str) -> int | None:
        """Record a hit and return None, or return seconds to wait if the limit is reached."""
        now = self._clock()
        cutoff = now - self.window_seconds
        with self._lock:
            if len(self._hits) >= _PURGE_THRESHOLD:
                self._purge_expired(cutoff)
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                return max(1, math.ceil(hits[0] + self.window_seconds - now))
            hits.append(now)
            return None

    def check(self, key: str) -> None:
        wait = self.retry_after(key)
        if wait is not None:
            raise AppError(
                429,
                "RATE_LIMITED",
                "Too many attempts. Please wait and try again",
                headers={"Retry-After": str(wait)},
            )

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


login_limiter = SlidingWindowLimiter(get_settings().rate_limit_login_per_minute, 60)
analyze_limiter = SlidingWindowLimiter(get_settings().rate_limit_analyze_per_hour, 3600)
