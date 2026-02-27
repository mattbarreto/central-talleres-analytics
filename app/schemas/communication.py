from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CommunicationBase(BaseModel):
    workshop_id: UUID
    subject: str = Field(..., max_length=200)
    body: str


class CommunicationCreate(CommunicationBase):
    pass


class CommunicationOut(CommunicationBase):
    id: UUID
    sent_at: Optional[datetime]
    sent_by_admin_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
