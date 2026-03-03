from __future__ import annotations

import uuid

from sqlalchemy import Enum, Float, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class SessionResourceRequirement(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "session_resource_requirements"

    workshop_session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workshop_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    resource_term_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("resource_terms.id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity_required: Mapped[float] = mapped_column(Float, nullable=False, default=1.0, server_default="1")
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    requirement_mode: Mapped[str] = mapped_column(
        Enum("fixed", "per_participant", name="resource_requirement_mode"),
        nullable=False,
        default="fixed",
        server_default="fixed",
    )
    criticality: Mapped[str] = mapped_column(
        Enum("low", "medium", "high", name="resource_criticality"),
        nullable=False,
        default="medium",
        server_default="medium",
    )
    source: Mapped[str] = mapped_column(
        Enum("manual", name="resource_requirement_source"),
        nullable=False,
        default="manual",
        server_default="manual",
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    workshop_session = relationship("WorkshopSession")
    resource_term = relationship("ResourceTerm")

    __table_args__ = (
        Index("ix_session_resource_requirements_session", "workshop_session_id"),
        Index("ix_session_resource_requirements_term", "resource_term_id"),
        Index("ix_session_resource_requirements_session_term", "workshop_session_id", "resource_term_id", unique=True),
    )
