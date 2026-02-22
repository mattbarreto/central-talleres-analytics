from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class AdminCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("password no puede estar vacio")
        return cleaned


class AdminOut(BaseModel):
    id: UUID
    email: EmailStr
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
