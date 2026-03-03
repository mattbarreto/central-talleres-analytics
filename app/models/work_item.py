from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.work_item_event import WorkItemEvent


class WorkItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "work_items"

    kind: Mapped[str] = mapped_column(
        Enum("task", "query", "report", name="work_item_kind"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        Enum(
            "new",
            "triaged",
            "in_progress",
            "waiting_response",
            "resolved",
            "closed",
            name="work_item_status",
        ),
        nullable=False,
        default="new",
        server_default="new",
    )
    priority: Mapped[str] = mapped_column(
        Enum("low", "medium", "high", name="work_item_priority"),
        nullable=False,
        default="medium",
        server_default="medium",
    )

    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    response_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_managed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reopened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reopen_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_status_change_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    created_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
    )
    workshop_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workshops.id", ondelete="SET NULL"),
        nullable=True,
    )
    workshop_session_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workshop_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    participant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("participants.id", ondelete="SET NULL"),
        nullable=True,
    )
    team_member_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("team_members.id", ondelete="SET NULL"),
        nullable=True,
    )

    events: Mapped[list[WorkItemEvent]] = relationship(
        "WorkItemEvent",
        back_populates="work_item",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("reopen_count >= 0", name="ck_work_items_reopen_count_nonnegative"),
        Index("ix_work_items_status_due", "status", "due_at"),
        Index("ix_work_items_response_pending", "response_required", "first_response_at", "status"),
        Index("ix_work_items_first_managed_status", "first_managed_at", "status"),
        Index("ix_work_items_assigned_status", "assigned_admin_id", "status"),
        Index("ix_work_items_workshop_session", "workshop_session_id"),
        Index("ix_work_items_participant", "participant_id"),
    )
