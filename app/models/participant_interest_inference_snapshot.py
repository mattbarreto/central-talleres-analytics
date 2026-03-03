from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Date, Enum, Float, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class ParticipantInterestInferenceSnapshot(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "participant_interest_inference_snapshots"

    participant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("participants.id", ondelete="CASCADE"),
        nullable=False,
    )
    interest_term_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interest_terms.id", ondelete="CASCADE"),
        nullable=False,
    )
    window_type: Mapped[str] = mapped_column(
        Enum("rolling_12m", "all_time", name="interest_window_type"),
        nullable=False,
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    share: Mapped[float] = mapped_column(Float, nullable=False)
    confidence_level: Mapped[str] = mapped_column(
        Enum("insufficient", "low", "medium", "high", name="interest_confidence_level"),
        nullable=False,
    )
    evidence_points: Mapped[float] = mapped_column(Float, nullable=False)
    evidence_workshops_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    methodology_version: Mapped[str] = mapped_column(String(20), nullable=False, default="v1", server_default="v1")

    participant = relationship("Participant")
    interest_term = relationship("InterestTerm")

    __table_args__ = (
        Index("ix_interest_snapshots_participant_window_date", "participant_id", "window_type", "snapshot_date"),
        Index("ix_interest_snapshots_term_window_date", "interest_term_id", "window_type", "snapshot_date"),
        Index(
            "ix_interest_snapshots_unique",
            "participant_id",
            "window_type",
            "snapshot_date",
            "interest_term_id",
            unique=True,
        ),
    )
