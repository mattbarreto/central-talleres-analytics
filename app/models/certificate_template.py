from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class CertificateTemplate(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "certificate_templates"

    center_id: Mapped[str] = mapped_column(Uuid(), ForeignKey("certificate_centers.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    orientation: Mapped[str] = mapped_column(String(20), nullable=False, default="landscape")
    paper_size: Mapped[str] = mapped_column(String(20), nullable=False, default="A4")
    title_text: Mapped[str] = mapped_column(String(200), nullable=False, default="Certificado de participación")
    subtitle_text: Mapped[str] = mapped_column(String(300), nullable=True)
    body_template: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Se certifica que {participant_name} completó el curso/taller {course_name}.",
    )
    default_description: Mapped[str] = mapped_column(Text, nullable=True)

    center = relationship("CertificateCenter", back_populates="templates")
    signers = relationship("CertificateSigner", back_populates="template", cascade="all, delete-orphan")
    issues = relationship("CertificateIssue", back_populates="template")
