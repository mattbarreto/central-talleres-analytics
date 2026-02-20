from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class WorkshopBase(BaseModel):
    name: str = Field(..., max_length=200)
    cohort_year: int = Field(..., ge=2000, le=2100)
    status: str = Field("planned", pattern="^(planned|active|finished)$")
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class WorkshopCreate(WorkshopBase):
    pass


class WorkshopUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    cohort_year: Optional[int] = Field(None, ge=2000, le=2100)
    status: Optional[str] = Field(None, pattern="^(planned|active|finished)$")
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class WorkshopOut(WorkshopBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
