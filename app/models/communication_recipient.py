import uuid

from sqlalchemy import Enum, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class CommunicationRecipient(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "communication_recipients"

    communication_id: Mapped[uuid.UUID] = mapped_column(Uuid(), ForeignKey("communications.id"), nullable=False)
    participant_id: Mapped[uuid.UUID] = mapped_column(Uuid(), ForeignKey("participants.id"), nullable=False)
    email_snapshot: Mapped[str] = mapped_column(String(320), nullable=False)
    status: Mapped[str] = mapped_column(Enum("sent", "failed", name="recipient_status"), nullable=False, default="sent")
    error_message: Mapped[str] = mapped_column(Text, nullable=True)

    communication = relationship("Communication", back_populates="recipients")
    participant = relationship("Participant", back_populates="communication_recipients")

