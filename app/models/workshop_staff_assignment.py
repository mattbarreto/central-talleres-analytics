import uuid

from sqlalchemy import Enum, ForeignKey, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin

class WorkshopStaffAssignment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "workshop_staff_assignments"
    __table_args__ = (UniqueConstraint("workshop_id", "team_member_id", name="uq_workshop_team_member"),)

    workshop_id: Mapped[uuid.UUID] = mapped_column(Uuid(), ForeignKey("workshops.id"), nullable=False, index=True)
    team_member_id: Mapped[uuid.UUID] = mapped_column(Uuid(), ForeignKey("team_members.id"), nullable=False, index=True)
    assignment_role: Mapped[str] = mapped_column(
        Enum("teacher", "coordinator", name="assignment_role"), nullable=False, default="teacher"
    )

    workshop = relationship("Workshop", back_populates="staff_assignments")
    team_member = relationship("TeamMember", back_populates="assignments")
