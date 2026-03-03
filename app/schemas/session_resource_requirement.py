from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SessionResourceRequirementIn(BaseModel):
    resource_term_id: UUID | None = None
    new_tag_label: str | None = Field(default=None, max_length=120)
    quantity_required: float = Field(default=1.0, ge=0)
    unit: str | None = Field(default=None, max_length=30)
    requirement_mode: Literal["fixed", "per_participant"] = "fixed"
    criticality: Literal["low", "medium", "high"] = "medium"
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_tag_source(self) -> "SessionResourceRequirementIn":
        if not self.resource_term_id and not (self.new_tag_label or "").strip():
            raise ValueError("Debe enviar resource_term_id o new_tag_label")
        return self


class SessionResourceRequirementOut(BaseModel):
    id: UUID
    workshop_session_id: UUID
    resource_term_id: UUID
    resource_label: str
    quantity_required: float
    unit: str | None = None
    requirement_mode: Literal["fixed", "per_participant"]
    criticality: Literal["low", "medium", "high"]
    source: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class ResourceProjectionRowOut(BaseModel):
    period_label: str
    period_start: date
    resource_term_id: UUID
    resource_label: str
    total_required: float
    unit: str | None = None
