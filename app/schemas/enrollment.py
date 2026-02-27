from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class EnrollmentBase(BaseModel):
    workshop_id: UUID
    participant_id: UUID
    status: str = Field("enrolled", pattern="^(enrolled|active|dropped|finished)$")


class EnrollmentCreate(EnrollmentBase):
    pass


class EnrollmentUpdate(BaseModel):
    status: str = Field(..., pattern="^(enrolled|active|dropped|finished)$")


class EnrollmentOut(EnrollmentBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
