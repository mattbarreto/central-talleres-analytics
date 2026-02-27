from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common_validators import normalize_whitespace


class WorkshopBase(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., max_length=200)
    cohort_year: int = Field(..., ge=2000, le=2100)
    status: str = Field("planned", pattern="^(planned|active|finished)$")
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = normalize_whitespace(value)
        if not cleaned:
            raise ValueError("name no puede estar vacío")
        return cleaned

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date no puede ser anterior a start_date")
        return self


class WorkshopCreate(WorkshopBase):
    pass


class WorkshopUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, max_length=200)
    cohort_year: Optional[int] = Field(None, ge=2000, le=2100)
    status: Optional[str] = Field(None, pattern="^(planned|active|finished)$")
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = normalize_whitespace(value)
        if not cleaned:
            raise ValueError("name no puede estar vacío")
        return cleaned

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date no puede ser anterior a start_date")
        return self


class WorkshopOut(WorkshopBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
