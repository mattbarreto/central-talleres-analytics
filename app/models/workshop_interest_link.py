from __future__ import annotations

import uuid

from sqlalchemy import Float, ForeignKey, Index, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class WorkshopInterestLink(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workshop_interest_links"

    workshop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("workshops.id", ondelete="CASCADE"),
        nullable=False,
    )
    interest_term_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interest_terms.id", ondelete="CASCADE"),
        nullable=False,
    )
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0, server_default="1")

    workshop = relationship("Workshop")
    interest_term = relationship("InterestTerm")

    __table_args__ = (
        Index("ix_workshop_interest_links_workshop_term", "workshop_id", "interest_term_id", unique=True),
        Index("ix_workshop_interest_links_term", "interest_term_id"),
    )
