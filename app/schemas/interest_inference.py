from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common_validators import normalize_whitespace


class InterestTermCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = normalize_whitespace(value)
        if not normalized:
            raise ValueError("name no puede estar vacio")
        return normalized


class InterestTermOut(BaseModel):
    id: UUID
    name: str
    normalized_key: str
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkshopInterestLinkIn(BaseModel):
    interest_term_id: UUID
    weight: float = Field(default=1.0, gt=0)


class WorkshopInterestLinkOut(BaseModel):
    workshop_id: UUID
    interest_term_id: UUID
    interest_name: str
    weight: float


class InferenceRebuildIn(BaseModel):
    snapshot_date: date | None = None
    participant_id: UUID | None = None


class ParticipantInterestInferenceRowOut(BaseModel):
    interest_term_id: UUID
    interest_name: str
    score: float
    share: float
    confidence_level: Literal["insufficient", "low", "medium", "high"]
    evidence_points: float
    evidence_workshops_count: int
    methodology_version: str


class ParticipantInterestInferenceOut(BaseModel):
    participant_id: UUID
    window_type: Literal["rolling_12m", "all_time"]
    snapshot_date: date | None = None
    confidence_level: Literal["insufficient", "low", "medium", "high"] = "insufficient"
    primary_interest_term_id: UUID | None = None
    rows: list[ParticipantInterestInferenceRowOut]
