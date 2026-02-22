from __future__ import annotations

import re


_SPACES = re.compile(r"\s+")


def normalize_whitespace(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = _SPACES.sub(" ", str(value)).strip()
    return cleaned or None


def normalize_phone(value: str | None) -> str | None:
    cleaned = normalize_whitespace(value)
    if not cleaned:
        return None
    if cleaned.startswith("+"):
        digits = "".join(ch for ch in cleaned[1:] if ch.isdigit())
        return f"+{digits}" if digits else None
    digits = "".join(ch for ch in cleaned if ch.isdigit())
    return digits or None


def normalize_dni(value: str | None) -> str | None:
    cleaned = normalize_whitespace(value)
    if not cleaned:
        return None
    compact = "".join(ch for ch in cleaned if ch.isalnum())
    return compact or None
