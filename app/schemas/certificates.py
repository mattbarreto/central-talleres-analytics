from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CertificateCenterBase(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    legal_name: str | None = None
    logo_data_url: str | None = None
    primary_color: str = "#2D5BFF"
    secondary_color: str = "#0F172A"
    watermark_text: str = "Certificado"
    watermark_opacity: float = 0.08
    footer_text: str | None = None


class CertificateCenterCreate(CertificateCenterBase):
    pass


class CertificateCenterUpdate(CertificateCenterBase):
    pass


class CertificateCenterOut(CertificateCenterBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CertificateSignerIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    role_title: str = Field(min_length=2, max_length=200)
    signature_data_url: str | None = None
    sort_order: int = 0


class CertificateSignerOut(CertificateSignerIn):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CertificateTemplateBase(BaseModel):
    center_id: UUID
    name: str = Field(min_length=2, max_length=200)
    orientation: str = "landscape"
    paper_size: str = "A4"
    title_text: str = "Certificado de participación"
    subtitle_text: str | None = None
    body_template: str = "Se certifica que {participant_name} completó el curso/taller {course_name}."
    default_description: str | None = None


class CertificateTemplateCreate(CertificateTemplateBase):
    signers: list[CertificateSignerIn] = []


class CertificateTemplateUpdate(CertificateTemplateBase):
    signers: list[CertificateSignerIn] = []


class CertificateTemplateOut(CertificateTemplateBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    signers: list[CertificateSignerOut] = []

    class Config:
        from_attributes = True


class CertificateIssueCreate(BaseModel):
    participant_id: UUID
    workshop_id: UUID
    center_id: UUID
    template_id: UUID
    issue_date: date
    course_name: str = Field(min_length=2, max_length=240)
    course_description: str | None = None
    signers: list[CertificateSignerIn] | None = None
    center_overrides: dict[str, str | float | None] | None = None
    template_overrides: dict[str, str | float | None] | None = None


class CertificateIssueOut(BaseModel):
    id: UUID
    verification_code: str
    participant_id: UUID
    workshop_id: UUID
    center_id: UUID
    template_id: UUID
    issue_date: date
    course_name: str
    course_description: str | None = None
    download_url: str
    verify_url: str
    created_at: datetime


class CertificateVerifyOut(BaseModel):
    verification_code: str
    issued_at: datetime
    issue_date: date
    participant_name: str
    workshop_name: str
    center_name: str
    course_name: str
    valid: bool = True


class CertificatePendingOut(BaseModel):
    participant_id: UUID
    participant_name: str
    workshop_id: UUID
    workshop_name: str
    cohort_year: int
    finished_at: datetime | None = None


class CertificateIssueListOut(BaseModel):
    id: UUID
    verification_code: str
    participant_id: UUID
    participant_name: str
    workshop_id: UUID
    workshop_name: str
    center_id: UUID
    center_name: str
    template_id: UUID
    template_name: str
    issue_date: date
    course_name: str
    created_at: datetime
