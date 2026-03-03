from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common_validators import normalize_whitespace

WorkItemKind = Literal["task", "query", "report"]
WorkItemStatus = Literal["new", "triaged", "in_progress", "waiting_response", "resolved", "closed"]
WorkItemPriority = Literal["low", "medium", "high"]


class WorkItemCreate(BaseModel):
    kind: WorkItemKind
    title: str = Field(min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=4000)
    priority: WorkItemPriority = "medium"
    response_required: bool | None = None
    due_at: datetime | None = None
    assigned_admin_id: UUID | None = None
    workshop_id: UUID | None = None
    workshop_session_id: UUID | None = None
    participant_id: UUID | None = None
    team_member_id: UUID | None = None

    @field_validator("title", "description")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return normalize_whitespace(value)


class WorkItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=4000)
    priority: WorkItemPriority | None = None
    due_at: datetime | None = None
    response_required: bool | None = None
    assigned_admin_id: UUID | None = None
    workshop_id: UUID | None = None
    workshop_session_id: UUID | None = None
    participant_id: UUID | None = None
    team_member_id: UUID | None = None

    @field_validator("title", "description")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return normalize_whitespace(value)


class WorkItemTransitionIn(BaseModel):
    target_status: WorkItemStatus
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        return normalize_whitespace(value)


class WorkItemRespondIn(BaseModel):
    message: str | None = Field(default=None, max_length=4000)
    status_after: WorkItemStatus | None = None

    @field_validator("message")
    @classmethod
    def normalize_message(cls, value: str | None) -> str | None:
        return normalize_whitespace(value)


class WorkItemEventOut(BaseModel):
    id: UUID
    work_item_id: UUID
    actor_admin_id: UUID | None = None
    event_type: str
    from_status: str | None = None
    to_status: str | None = None
    note: str | None = None
    payload_json: str | None = None
    occurred_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkItemOut(BaseModel):
    id: UUID
    kind: WorkItemKind
    status: WorkItemStatus
    priority: WorkItemPriority
    title: str
    description: str | None = None
    response_required: bool
    due_at: datetime | None = None
    first_managed_at: datetime | None = None
    first_response_at: datetime | None = None
    resolved_at: datetime | None = None
    closed_at: datetime | None = None
    reopened_at: datetime | None = None
    reopen_count: int
    last_status_change_at: datetime
    created_by_admin_id: UUID | None = None
    assigned_admin_id: UUID | None = None
    assigned_admin_name: str | None = None
    workshop_id: UUID | None = None
    workshop_session_id: UUID | None = None
    participant_id: UUID | None = None
    team_member_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
