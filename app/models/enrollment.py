import uuid

from sqlalchemy import Enum, ForeignKey, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class Enrollment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("workshop_id", "participant_id", name="uq_workshop_participant"),)

    workshop_id: Mapped[uuid.UUID] = mapped_column(Uuid(), ForeignKey("workshops.id"), nullable=False)
    participant_id: Mapped[uuid.UUID] = mapped_column(Uuid(), ForeignKey("participants.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("enrolled", "active", "dropped", "finished", name="enrollment_status"), nullable=False, default="enrolled"
    )

    workshop = relationship("Workshop", back_populates="enrollments")
    participant = relationship("Participant", back_populates="enrollments")

