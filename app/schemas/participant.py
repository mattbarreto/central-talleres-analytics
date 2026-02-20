from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class ParticipantBase(BaseModel):
    name: str = Field(..., max_length=200)
    dni: Optional[str] = Field(None, max_length=20)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=50)
    birth_date: Optional[date] = None
    gender: Optional[Literal["female", "male", "non_binary", "other", "undisclosed"]] = None


class ParticipantCreate(ParticipantBase):
    pass


class ParticipantUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    dni: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    birth_date: Optional[date] = None
    gender: Optional[Literal["female", "male", "non_binary", "other", "undisclosed"]] = None


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
