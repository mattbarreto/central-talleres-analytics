from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CommunicationRecipientOut(BaseModel):
    id: UUID
    communication_id: UUID
    participant_id: UUID
    email_snapshot: str = Field(..., max_length=320)
    status: str
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CommunicationRecipientsSummaryOut(BaseModel):
    communication_id: UUID
    total: int
    sent: int
    failed: int


class ResendFailedResultOut(BaseModel):
    communication_id: UUID
    resent: int
    remaining_failed: int
