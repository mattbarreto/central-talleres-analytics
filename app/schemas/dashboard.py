from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Literal


class DashboardMeta(BaseModel):
    range_days: int
    current_start: datetime
    current_end: datetime
    previous_start: datetime
    previous_end: datetime
    timezone: str


class TrendRow(BaseModel):
    label: str
    value: int


class KpiDelta(BaseModel):
    current: int
    previous: int


class DashboardKpis(BaseModel):
    workshops: KpiDelta
    participants_unique: KpiDelta
    enrollments: KpiDelta
    active_enrollments: KpiDelta
    finished_enrollments: KpiDelta
    communications: KpiDelta


class TopWorkshopRow(BaseModel):
    id: str
    label: str
    value: int


class RecentActivityRow(BaseModel):
    label: str
    date: datetime
    meta: str
    type: Literal["workshop", "communication"]


class DashboardMetricsResponse(BaseModel):
    meta: DashboardMeta
    kpis: DashboardKpis
    trends_enrollments: list[TrendRow]
    trends_communications: list[TrendRow]
    status_distribution: list[TrendRow]
    top_workshops: list[TopWorkshopRow]
    recent_activity: list[RecentActivityRow]
