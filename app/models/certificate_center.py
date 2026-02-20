from sqlalchemy import Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class CertificateCenter(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "certificate_centers"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(300), nullable=True)
    logo_data_url: Mapped[str] = mapped_column(Text, nullable=True)
    primary_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#2D5BFF")
    secondary_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#0F172A")
    watermark_text: Mapped[str] = mapped_column(String(200), nullable=False, default="Certificado")
    watermark_opacity: Mapped[float] = mapped_column(Float, nullable=False, default=0.08)
    footer_text: Mapped[str] = mapped_column(Text, nullable=True)

    templates = relationship("CertificateTemplate", back_populates="center", cascade="all, delete-orphan")
    issues = relationship("CertificateIssue", back_populates="center")
