from datetime import date

from sqlalchemy import Date, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class CertificateIssue(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "certificate_issues"

    verification_code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    participant_id: Mapped[str] = mapped_column(Uuid(), ForeignKey("participants.id", ondelete="RESTRICT"), nullable=False)
    workshop_id: Mapped[str] = mapped_column(Uuid(), ForeignKey("workshops.id", ondelete="RESTRICT"), nullable=False)
    center_id: Mapped[str] = mapped_column(Uuid(), ForeignKey("certificate_centers.id", ondelete="RESTRICT"), nullable=False)
    template_id: Mapped[str] = mapped_column(Uuid(), ForeignKey("certificate_templates.id", ondelete="RESTRICT"), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    course_name: Mapped[str] = mapped_column(String(240), nullable=False)
    course_description: Mapped[str] = mapped_column(Text, nullable=True)
    issued_payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    pdf_path: Mapped[str] = mapped_column(String(500), nullable=False)

    participant = relationship("Participant")
    workshop = relationship("Workshop")
    center = relationship("CertificateCenter", back_populates="issues")
    template = relationship("CertificateTemplate", back_populates="issues")
