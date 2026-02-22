from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock

from app.core.config import settings


class RevokedTokenStore:
    def __init__(self, storage_path: str | None = None) -> None:
        self._lock = Lock()
        self._storage_path = Path(storage_path) if storage_path else None
        self._items: dict[str, datetime] = {}
        self._load_from_disk()

    def revoke(self, jti: str, expires_at: datetime) -> None:
        if not jti:
            return
        with self._lock:
            normalized = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=UTC)
            self._items[jti] = normalized
            changed = self._cleanup_locked(datetime.now(UTC))
            self._persist_locked(force=True)

    def is_revoked(self, jti: str) -> bool:
        if not jti:
            return False
        now = datetime.now(UTC)
        with self._lock:
            self._sync_from_disk_locked(now)
            changed = self._cleanup_locked(now)
            if changed:
                self._persist_locked()
            return jti in self._items

    def _cleanup_locked(self, now: datetime) -> bool:
        expired = [jti for jti, exp in self._items.items() if exp <= now]
        for jti in expired:
            self._items.pop(jti, None)
        return bool(expired)

    def _load_from_disk(self) -> None:
        now = datetime.now(UTC)
        self._sync_from_disk_locked(now)

    def _sync_from_disk_locked(self, now: datetime) -> None:
        if not self._storage_path or not self._storage_path.exists():
            return
        try:
            payload = json.loads(self._storage_path.read_text(encoding="utf-8"))
        except Exception:
            return
        if not isinstance(payload, dict):
            return
        for jti, expires_at in payload.items():
            if not isinstance(jti, str) or not isinstance(expires_at, str):
                continue
            try:
                dt = datetime.fromisoformat(expires_at)
            except ValueError:
                continue
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            if dt > now:
                current = self._items.get(jti)
                if not current or dt > current:
                    self._items[jti] = dt

    def _persist_locked(self, force: bool = False) -> None:
        if not self._storage_path:
            return
        if not force and not self._items:
            return
        try:
            self._storage_path.parent.mkdir(parents=True, exist_ok=True)
            data = {jti: exp.astimezone(UTC).isoformat() for jti, exp in self._items.items()}
            temp_path = self._storage_path.with_suffix(".tmp")
            temp_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            temp_path.replace(self._storage_path)
        except Exception:
            return


revoked_token_store = RevokedTokenStore(settings.revoked_access_tokens_path)
used_refresh_token_store = RevokedTokenStore(settings.revoked_refresh_tokens_path)
