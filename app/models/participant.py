from datetime import date

from sqlalchemy import Date, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class Participant(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "participants"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    dni: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    birth_date: Mapped[date] = mapped_column(Date, nullable=True)
    gender: Mapped[str] = mapped_column(String(20), nullable=True)

    enrollments = relationship("Enrollment", back_populates="participant", cascade="all, delete-orphan")
    communication_recipients = relationship(
        "CommunicationRecipient", back_populates="participant", cascade="all, delete-orphan"
    )
