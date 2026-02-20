from datetime import date
from typing import Optional

from sqlalchemy import Date, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class Workshop(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workshops"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    cohort_year: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("planned", "active", "finished", name="workshop_status"), nullable=False, default="planned"
    )
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    enrollments = relationship("Enrollment", back_populates="workshop", cascade="all, delete-orphan")
    communications = relationship("Communication", back_populates="workshop", cascade="all, delete-orphan")
    staff_assignments = relationship("WorkshopStaffAssignment", back_populates="workshop", cascade="all, delete-orphan")
