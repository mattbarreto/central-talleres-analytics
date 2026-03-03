from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class WeeklyExecutiveSnapshot(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "weekly_executive_snapshots"

    scope_type: Mapped[str] = mapped_column(
        Enum("institutional", "workshop", name="executive_snapshot_scope"),
        nullable=False,
        default="institutional",
        server_default="institutional",
    )
    workshop_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workshops.id", ondelete="SET NULL"),
        nullable=True,
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    week_end: Mapped[date] = mapped_column(Date, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_final: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    methodology_version: Mapped[str] = mapped_column(String(20), nullable=False, default="v1", server_default="v1")

    work_items_created_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    work_items_managed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    work_items_responded_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    work_items_resolved_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    work_items_closed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    work_items_reopened_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    backlog_open_end_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    backlog_unmanaged_end_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    backlog_unanswered_end_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    backlog_overdue_end_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    sessions_scheduled_week_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    metrics_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource_projection_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    workshop = relationship("Workshop")

    __table_args__ = (
        Index("ix_weekly_snapshots_scope_week", "scope_type", "week_start"),
        Index("ix_weekly_snapshots_week", "week_start"),
    )
