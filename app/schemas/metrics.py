from uuid import UUID

from pydantic import BaseModel


class WorkshopsByYear(BaseModel):
    cohort_year: int
    total: int


class ParticipantsByWorkshop(BaseModel):
    workshop_id: UUID
    total: int


class CommunicationsCount(BaseModel):
    total: int
