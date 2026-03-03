from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.resource_term_alias import ResourceTermAlias


class ResourceTerm(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "resource_terms"

    label: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_key: Mapped[str] = mapped_column(String(120), nullable=False)
    scope: Mapped[str] = mapped_column(
        Enum("global", "personal", name="resource_term_scope"),
        nullable=False,
        default="personal",
        server_default="personal",
    )
    governance_status: Mapped[str] = mapped_column(
        Enum("draft", "approved", "merged", "deprecated", name="resource_term_status"),
        nullable=False,
        default="draft",
        server_default="draft",
    )
    owner_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("admins.id", ondelete="SET NULL"),
        nullable=True,
    )
    merged_into_term_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("resource_terms.id", ondelete="SET NULL"),
        nullable=True,
    )

    aliases: Mapped[list[ResourceTermAlias]] = relationship(
        "ResourceTermAlias",
        back_populates="resource_term",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint(
            "(scope = 'global' AND owner_admin_id IS NULL) OR (scope = 'personal' AND owner_admin_id IS NOT NULL)",
            name="ck_resource_terms_scope_owner",
        ),
        Index("ix_resource_terms_scope_status", "scope", "governance_status"),
    )
