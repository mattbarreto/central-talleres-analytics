from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class TeamMemberBase(BaseModel):
    name: str = Field(..., max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    role: Literal["teacher", "coordinator"] = "teacher"


class TeamMemberCreate(TeamMemberBase):
    pass


class TeamMemberUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    role: Optional[Literal["teacher", "coordinator"]] = None


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
