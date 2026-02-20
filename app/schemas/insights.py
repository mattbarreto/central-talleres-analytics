from datetime import date
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class InsightsSeriesPointOut(BaseModel):
    period_key: str
    period_label: str
    enrollments: int
    active_enrollments: int
    finished_enrollments: int
    dropped_enrollments: int
    communications: int
    workshops_started: int


class InsightsWorkshopRankingOut(BaseModel):
    workshop_id: UUID
    workshop_name: str
    cohort_year: int
    workshop_status: str
    enrollments_total: int
    attendees_estimated: int
    finished_total: int


class InsightsStaffRankingOut(BaseModel):
    team_member_id: UUID
    name: str
    role: Literal["teacher", "coordinator"]
    workshops_count: int
    active_workshops_count: int
    participants_reached: int
    attendees_reached: int


class InsightsParticipantRankingOut(BaseModel):
    participant_id: UUID
    name: str
    email: str
    workshops_total: int
    active_workshops: int
    finished_workshops: int
    enrolled_workshops: int
    dropped_workshops: int


class InsightsKpisOut(BaseModel):
    workshops_total: int
    participants_total: int
    enrollments_total: int
    active_enrollments_total: int
    finished_enrollments_total: int
    dropped_enrollments_total: int
    communications_total: int
    team_members_total: int
    active_team_members: int
    active_participants_total: int
    certifiable_participants_total: int


class InsightsMetricDefinitionOut(BaseModel):
    metric_id: str
    label: str
    description: str
    formula: str


class InsightsComparisonOut(BaseModel):
    metric_id: str
    label: str
    current: int
    previous: int
    delta: int
    delta_pct: float
    trend: Literal["up", "down", "flat"]


class InsightsFunnelStepOut(BaseModel):
    key: str
    label: str
    total: int


class InsightsRetentionPointOut(BaseModel):
    cohort_period: str
    cohort_size: int
    retained_next: int
    retained_next_pct: float
    retained_3: int
    retained_3_pct: float


class InsightsAlertOut(BaseModel):
    severity: Literal["info", "warning", "critical"]
    title: str
    message: str


class ParticipantJourneyEventOut(BaseModel):
    at: Optional[date] = None
    type: Literal["enrollment", "communication"]
    workshop_id: Optional[UUID] = None
    workshop_name: Optional[str] = None
    status: str
    detail: str


class ParticipantJourneyOut(BaseModel):
    participant_id: UUID
    participant_name: str
    participant_email: str
    first_seen: Optional[date] = None
    last_seen: Optional[date] = None
    totals: dict[str, int]
    events: list[ParticipantJourneyEventOut]


class InsightsOverviewOut(BaseModel):
    period: Literal["monthly", "quarterly", "semesterly", "yearly"]
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    kpis: InsightsKpisOut
    series: list[InsightsSeriesPointOut]
    gender_distribution: dict[str, int]
    age_distribution: dict[str, int]
    top_workshops_by_enrollments: list[InsightsWorkshopRankingOut]
    top_workshops_by_attendees: list[InsightsWorkshopRankingOut]
    top_staff_by_activity: list[InsightsStaffRankingOut]
    top_participants_by_activity: list[InsightsParticipantRankingOut]
    comparisons: list[InsightsComparisonOut]
    funnel: list[InsightsFunnelStepOut]
    retention: list[InsightsRetentionPointOut]
    alerts: list[InsightsAlertOut]
    metric_definitions: list[InsightsMetricDefinitionOut]
