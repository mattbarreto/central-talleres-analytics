from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common_validators import normalize_dni, normalize_phone, normalize_whitespace


class ParticipantBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., max_length=200)
    dni: Optional[str] = Field(None, max_length=20)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=50)
    birth_date: Optional[date] = None
    gender: Optional[Literal["female", "male", "non_binary", "other", "undisclosed"]] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = normalize_whitespace(value)
        if not cleaned:
            raise ValueError("name no puede estar vacío")
        return cleaned

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()

    @field_validator("dni")
    @classmethod
    def validate_dni(cls, value: str | None) -> str | None:
        return normalize_dni(value)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        normalized = normalize_phone(value)
        if normalized:
            digits = "".join(ch for ch in normalized if ch.isdigit())
            if len(digits) < 6:
                raise ValueError("phone debe contener al menos 6 dígitos")
        return normalized

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("birth_date no puede ser futura")
        return value


class ParticipantCreate(ParticipantBase):
    pass


class ParticipantUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, max_length=200)
    dni: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    birth_date: Optional[date] = None
    gender: Optional[Literal["female", "male", "non_binary", "other", "undisclosed"]] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = normalize_whitespace(value)
        if not cleaned:
            raise ValueError("name no puede estar vacío")
        return cleaned

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr | None) -> str | None:
        if value is None:
            return None
        return str(value).strip().lower()

    @field_validator("dni")
    @classmethod
    def validate_dni(cls, value: str | None) -> str | None:
        return normalize_dni(value)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        normalized = normalize_phone(value)
        if normalized:
            digits = "".join(ch for ch in normalized if ch.isdigit())
            if len(digits) < 6:
                raise ValueError("phone debe contener al menos 6 dígitos")
        return normalized

    @field_validator("birth_date")
    @classmethod
    def validate_birth_date(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("birth_date no puede ser futura")
        return value


class ParticipantOut(ParticipantBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ParticipantWorkshopOut(BaseModel):
    workshop_id: UUID
    workshop_name: str
    cohort_year: int
    workshop_status: str
    enrollment_status: str
    enrolled_at: datetime


class ParticipantProfileSummaryOut(ParticipantOut):
    age: Optional[int] = None
    population_segment: Literal["current", "graduated", "inactive", "no_history"]
    workshops_total: int
    enrolled_workshops: int
    active_workshops: int
    finished_workshops: int
    dropped_workshops: int
    communications_sent: int
    communications_failed: int
    last_activity: Optional[datetime] = None
    engagement_level: Literal["high", "medium", "low"]


class ParticipantProfileOut(ParticipantProfileSummaryOut):
    workshops: list[ParticipantWorkshopOut]


class WorkshopParticipantItemOut(BaseModel):
    participant_id: UUID
    name: str
    dni: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[Literal["female", "male", "non_binary", "other", "undisclosed"]] = None
    enrollment_status: str
    engagement_level: Literal["high", "medium", "low"]
    workshops_total: int
    last_activity: Optional[datetime] = None


class WorkshopParticipantsGroupOut(BaseModel):
    workshop_id: UUID
    workshop_name: str
    cohort_year: int
    workshop_status: str
    participants_total: int
    participants: list[WorkshopParticipantItemOut]


class ParticipantOverviewOut(BaseModel):
    total_participants: int
    with_workshops: int
    active_members: int
    certifiable_members: int
    inactive_members: int
    no_history_members: int
    age_brackets: dict[str, int]
    gender_distribution: dict[str, int]


class ParticipantImportCSVIn(BaseModel):
    csv_content: str


class ParticipantImportCSVOut(BaseModel):
    total_rows: int
    created: int
    updated: int
    skipped: int
    errors: list[str]
