from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path
from threading import Lock
from uuid import UUID

from fastapi.encoders import jsonable_encoder

from app.core.config import settings


_CACHE_LOCK = Lock()
_CACHE_PATH = Path(settings.insights_cache_path)


def _cache_key(
    period: str,
    start_date: date | None,
    end_date: date | None,
    workshop_id: UUID | None,
) -> str:
    from_key = start_date.isoformat() if start_date else ""
    to_key = end_date.isoformat() if end_date else ""
    workshop_key = str(workshop_id) if workshop_id else ""
    return f"{period}|{from_key}|{to_key}|{workshop_key}"


def _read_cache_file() -> dict[str, dict]:
    if not _CACHE_PATH.exists():
        return {}
    try:
        raw = _CACHE_PATH.read_text(encoding="utf-8")
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _write_cache_file(cache_data: dict[str, dict]) -> None:
    _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = _CACHE_PATH.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(cache_data, ensure_ascii=False), encoding="utf-8")
    tmp_path.replace(_CACHE_PATH)


def _prune_cache(cache_data: dict[str, dict], ttl_seconds: int) -> dict[str, dict]:
    now = time.time()
    valid_items: list[tuple[str, dict]] = []
    for key, value in cache_data.items():
        ts = float(value.get("ts") or 0)
        if now - ts < ttl_seconds and isinstance(value.get("payload"), dict):
            valid_items.append((key, value))
    valid_items.sort(key=lambda item: float(item[1].get("ts") or 0), reverse=True)
    max_entries = max(8, int(settings.insights_cache_max_entries))
    return dict(valid_items[:max_entries])


def get_cached_payload(
    period: str,
    start_date: date | None,
    end_date: date | None,
    workshop_id: UUID | None,
    ttl_seconds: int,
) -> dict | None:
    key = _cache_key(period, start_date, end_date, workshop_id)
    with _CACHE_LOCK:
        original = _read_cache_file()
        cache_data = _prune_cache(original, ttl_seconds)
        item = cache_data.get(key)
        if cache_data != original:
            _write_cache_file(cache_data)
        if not item:
            return None
        return item.get("payload")


def set_cached_payload(
    period: str,
    start_date: date | None,
    end_date: date | None,
    workshop_id: UUID | None,
    payload: dict,
    ttl_seconds: int,
) -> None:
    key = _cache_key(period, start_date, end_date, workshop_id)
    with _CACHE_LOCK:
        cache_data = _read_cache_file()
        cache_data[key] = {
            "ts": time.time(),
            "payload": jsonable_encoder(payload),
        }
        cache_data = _prune_cache(cache_data, ttl_seconds)
        _write_cache_file(cache_data)
