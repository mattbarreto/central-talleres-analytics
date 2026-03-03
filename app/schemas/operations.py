from __future__ import annotations

from datetime import date as date_type, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.work_item import WorkItemOut


OperationalStatus = Literal["ready", "incomplete", "at_risk", "completed", "cancelled"]
AttentionPriority = Literal["high", "medium", "low"]


class TacticalSessionResourceOut(BaseModel):
    resource_term_id: UUID
    resource_label: str
    quantity_required: float
    effective_quantity: float
    unit: str | None = None
    requirement_mode: Literal["fixed", "per_participant"] = "fixed"
    criticality: Literal["low", "medium", "high"] = "medium"


class TacticalSessionOut(BaseModel):
    id: UUID
    workshop_id: UUID
    workshop_name: str
    date: date_type
    start_time: str
    end_time: str
    topic: str
    facilitator_id: UUID | None = None
    facilitator_name: str | None = None
    session_status: Literal["scheduled", "completed", "cancelled"] = "scheduled"
    estimated_participants: int = 0
    resources: list[TacticalSessionResourceOut] = []
    operational_status: OperationalStatus = "ready"
    attention_flags: list[str] = []


class TacticalResourceDemandOut(BaseModel):
    resource_term_id: UUID
    resource_label: str
    total_required: float
    unit: str | None = None
    critical_sessions_count: int = 0


class TacticalDaySummaryOut(BaseModel):
    date: date_type
    sessions_count: int
    workshops_count: int
    facilitators_count: int
    participants_estimated: int
    critical_resources_count: int
    sessions_requiring_attention_count: int
    pending_due_count: int
    pending_unanswered_count: int


class TacticalDayBlockOut(BaseModel):
    summary: TacticalDaySummaryOut
    sessions: list[TacticalSessionOut]
    critical_resources: list[TacticalResourceDemandOut]
    alerts: list[str]


class TacticalFacilitatorLoadOut(BaseModel):
    facilitator_id: UUID
    facilitator_name: str
    sessions_count: int


class TacticalWeekSummaryOut(BaseModel):
    week_start: date_type
    week_end: date_type
    sessions_count: int
    workshops_count: int
    facilitators_count: int
    peak_day: str | None = None
    peak_time_slot: str | None = None
    sessions_without_facilitator_count: int
    sessions_without_topic_count: int
    sessions_without_resources_count: int


class TacticalDailyCountOut(BaseModel):
    date: str
    count: int


class TacticalWeekBlockOut(BaseModel):
    summary: TacticalWeekSummaryOut
    top_facilitators: list[TacticalFacilitatorLoadOut]
    top_resources: list[TacticalResourceDemandOut]
    daily_sessions: list[TacticalDailyCountOut]


class TacticalAttentionItemOut(BaseModel):
    kind: str
    priority: AttentionPriority
    title: str
    subtitle: str
    workshop_id: UUID | None = None
    session_id: UUID | None = None
    work_item_id: UUID | None = None
    date: date_type | None = None
    start_time: str | None = None
    due_at: datetime | None = None


class TacticalPendingGroupOut(BaseModel):
    count: int
    items: list[WorkItemOut]


class TacticalPendingBoardOut(BaseModel):
    today: TacticalPendingGroupOut
    tomorrow: TacticalPendingGroupOut
    week: TacticalPendingGroupOut
    overdue: TacticalPendingGroupOut
    unmanaged: TacticalPendingGroupOut
    unanswered: TacticalPendingGroupOut


class TacticalSnapshotOut(BaseModel):
    week_start: date_type
    week_end: date_type
    generated_at: datetime
    work_items_created_count: int
    work_items_resolved_count: int
    backlog_open_end_count: int
    backlog_overdue_end_count: int
    sessions_scheduled_week_count: int
    top_resources: list[TacticalResourceDemandOut]


class TacticalOperationsOut(BaseModel):
    anchor_date: date_type
    today: TacticalDayBlockOut
    tomorrow: TacticalDayBlockOut
    week: TacticalWeekBlockOut
    attention_required: list[TacticalAttentionItemOut]
    pending: TacticalPendingBoardOut
    snapshot_weekly: TacticalSnapshotOut | None = None
    recently_resolved: list[WorkItemOut] = []
