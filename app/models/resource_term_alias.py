from __future__ import annotations

import uuid

from sqlalchemy import Enum, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class ResourceTermAlias(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "resource_term_aliases"

    resource_term_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("resource_terms.id", ondelete="CASCADE"),
        nullable=False,
    )
    alias_label: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_alias: Mapped[str] = mapped_column(String(120), nullable=False)
    scope: Mapped[str] = mapped_column(
        Enum("global", "personal", name="resource_alias_scope"),
        nullable=False,
    )
    owner_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
    )

    resource_term = relationship("ResourceTerm", back_populates="aliases")

    __table_args__ = (
        Index("ix_resource_term_aliases_term", "resource_term_id"),
        Index("ix_resource_term_aliases_norm", "normalized_alias"),
    )
