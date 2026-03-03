from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class WeeklyExecutiveSnapshotOut(BaseModel):
    id: UUID
    scope_type: str
    workshop_id: UUID | None = None
    week_start: date
    week_end: date
    generated_at: datetime
    is_final: bool
    methodology_version: str

    work_items_created_count: int
    work_items_managed_count: int
    work_items_responded_count: int
    work_items_resolved_count: int
    work_items_closed_count: int
    work_items_reopened_count: int
    backlog_open_end_count: int
    backlog_unmanaged_end_count: int
    backlog_unanswered_end_count: int
    backlog_overdue_end_count: int
    sessions_scheduled_week_count: int

    metrics: dict[str, Any] | None = None
    resource_projection: dict[str, Any] | None = None


class WeeklyExecutiveSnapshotBuildIn(BaseModel):
    week_start: date | None = None
