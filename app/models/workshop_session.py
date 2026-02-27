from datetime import date, time
from typing import Optional

from sqlalchemy import Date, Enum, ForeignKey, Index, Integer, String, Text, Time, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin
import uuid

class WorkshopSession(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workshop_sessions"

    workshop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False
    )
    session_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    facilitator_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("team_members.id", ondelete="SET NULL"), nullable=True
    )

    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    topic: Mapped[str] = mapped_column(String(200), nullable=False)
    content_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    modality: Mapped[Optional[str]] = mapped_column(
        Enum("in_person", "virtual", "hybrid", name="session_modality"), nullable=True
    )
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    status: Mapped[str] = mapped_column(
        Enum("scheduled", "completed", "cancelled", name="session_status"),
        nullable=False,
        default="scheduled",
    )

    workshop = relationship("Workshop", back_populates="sessions")
    facilitator = relationship("TeamMember", back_populates="sessions")

    __table_args__ = (
        Index("ix_ws_workshop_date", "workshop_id", "date"),
        Index("ix_ws_date", "date"),
        Index("ix_ws_facilitator_date", "facilitator_id", "date"),
    )
