from datetime import date as date_type, time as time_type
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WorkshopSessionBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    date: date_type = Field(..., description="Fecha exacta del encuentro")
    start_time: time_type = Field(..., description="Hora de inicio")
    end_time: time_type = Field(..., description="Hora de cierre")
    
    topic: str = Field(..., max_length=200, description="Tema a dictar")
    content_description: Optional[str] = Field(None, description="Descripción del contenido o notas")
    
    session_order: Optional[int] = Field(None, description="Número de clase o encuentro en la cursada")
    facilitator_id: Optional[UUID] = Field(None, description="Fk a team_members p.ej Docente invitado")
    
    modality: Optional[str] = Field(None, pattern="^(in_person|virtual|hybrid)$")
    location: Optional[str] = Field(None, max_length=200)
    status: str = Field("scheduled", pattern="^(scheduled|completed|cancelled)$")

    @model_validator(mode="after")
    def validate_times(self) -> "WorkshopSessionBase":
        if self.start_time >= self.end_time:
            raise ValueError("La hora de inicio debe ser anterior a la hora de cierre")
        return self


class WorkshopSessionCreate(WorkshopSessionBase):
    pass


class WorkshopSessionUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    date: Optional[date_type] = None
    start_time: Optional[time_type] = None
    end_time: Optional[time_type] = None
    topic: Optional[str] = Field(None, max_length=200)
    content_description: Optional[str] = None
    session_order: Optional[int] = None
    facilitator_id: Optional[UUID] = None
    modality: Optional[str] = Field(None, pattern="^(in_person|virtual|hybrid)$")
    location: Optional[str] = Field(None, max_length=200)
    status: Optional[str] = Field(None, pattern="^(scheduled|completed|cancelled)$")


class WorkshopSessionResponse(WorkshopSessionBase):
    id: UUID
    workshop_id: UUID


class WorkshopSessionBulkDelete(BaseModel):
    session_ids: list[UUID] = Field(..., description="Lista de IDs de encuentros a eliminar")

