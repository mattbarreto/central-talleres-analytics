from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock


class SlidingWindowRateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._lock = Lock()
        self._attempts: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            window = self._attempts[key]
            self._cleanup(window, now)
            return len(window) < self.max_attempts

    def register_failure(self, key: str) -> None:
        now = time.time()
        with self._lock:
            window = self._attempts[key]
            self._cleanup(window, now)
            window.append(now)

    def clear(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)

    def _cleanup(self, window: deque[float], now: float) -> None:
        threshold = now - self.window_seconds
        while window and window[0] < threshold:
            window.popleft()
