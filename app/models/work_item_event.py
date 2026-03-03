from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDMixin


class WorkItemEvent(Base, UUIDMixin):
    __tablename__ = "work_item_events"

    work_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("work_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    actor_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    work_item = relationship("WorkItem", back_populates="events")

    __table_args__ = (
        Index("ix_work_item_events_item_occurred", "work_item_id", "occurred_at"),
        Index("ix_work_item_events_type_occurred", "event_type", "occurred_at"),
    )
