import uuid
from datetime import datetime as dt
from typing import Optional

from sqlalchemy import ForeignKey, String, Text, DateTime, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class Communication(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "communications"

    workshop_id: Mapped[uuid.UUID] = mapped_column(Uuid(), ForeignKey("workshops.id"), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    sent_at: Mapped[Optional[dt]] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_by_admin_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(), ForeignKey("admins.id"), nullable=True)

    workshop = relationship("Workshop", back_populates="communications")
    recipients = relationship("CommunicationRecipient", back_populates="communication", cascade="all, delete-orphan")

