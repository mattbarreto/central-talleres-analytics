from sqlalchemy import ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDMixin


class CertificateSigner(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "certificate_signers"

    template_id: Mapped[str] = mapped_column(Uuid(), ForeignKey("certificate_templates.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role_title: Mapped[str] = mapped_column(String(200), nullable=False)
    signature_data_url: Mapped[str] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    template = relationship("CertificateTemplate", back_populates="signers")
