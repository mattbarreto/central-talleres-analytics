from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common_validators import normalize_phone, normalize_whitespace


class TeamMemberBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    role: Literal["teacher", "coordinator"] = "teacher"

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
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

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        normalized = normalize_phone(value)
        if normalized:
            digits = "".join(ch for ch in normalized if ch.isdigit())
            if len(digits) < 6:
                raise ValueError("phone debe contener al menos 6 dígitos")
        return normalized


class TeamMemberCreate(TeamMemberBase):
    pass


class TeamMemberUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    role: Optional[Literal["teacher", "coordinator"]] = None

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

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        normalized = normalize_phone(value)
        if normalized:
            digits = "".join(ch for ch in normalized if ch.isdigit())
            if len(digits) < 6:
                raise ValueError("phone debe contener al menos 6 dígitos")
        return normalized


class TeamMemberOut(TeamMemberBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TeamAssignmentCreate(BaseModel):
    workshop_id: UUID
    assignment_role: Literal["teacher", "coordinator"]


class TeamAssignmentOut(BaseModel):
    id: UUID
    workshop_id: UUID
    workshop_name: str
    cohort_year: int
    workshop_status: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    assignment_role: Literal["teacher", "coordinator"]
    created_at: datetime


class TeamMemberProfileOut(TeamMemberOut):
    workshops_count: int
    active_workshops_count: int
    participants_reached: int
    attendees_reached: int
    last_workshop_date: Optional[date] = None
    trend_by_month: dict[str, int]
    assignments: list[TeamAssignmentOut]


class TeamMemberSummaryOut(TeamMemberOut):
    workshops_count: int
    active_workshops_count: int
    participants_reached: int
    attendees_reached: int
    last_workshop_date: Optional[date] = None
    trend_by_month: dict[str, int]


class TeamWorkshopRankingItemOut(BaseModel):
    workshop_id: UUID
    workshop_name: str
    cohort_year: int
    workshop_status: str
    staff_count: int
    total_enrollments: int
    attendees_estimated: int


class TeamOverviewOut(BaseModel):
    team_total: int
    teachers_total: int
    coordinators_total: int
    active_staff: int
    workshops_with_staff: int
    top_active_staff: list[TeamMemberSummaryOut]
    top_workshops_by_enrollments: list[TeamWorkshopRankingItemOut]
    top_workshops_by_attendees: list[TeamWorkshopRankingItemOut]
