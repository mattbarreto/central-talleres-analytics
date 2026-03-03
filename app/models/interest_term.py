from __future__ import annotations

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class InterestTerm(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "interest_terms"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_key: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
