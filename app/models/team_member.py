from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class TeamMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "team_members"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=True, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    role: Mapped[str] = mapped_column(
        Enum("teacher", "coordinator", name="team_member_role"), nullable=False, default="teacher"
    )

    assignments = relationship("WorkshopStaffAssignment", back_populates="team_member", cascade="all, delete-orphan")
    sessions = relationship("WorkshopSession", back_populates="facilitator")
