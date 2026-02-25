from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class AdminCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    role: str = Field(default="admin")
    dni: str | None = None
    phone: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("password no puede estar vacio")
        return cleaned


class AdminUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=256)
    first_name: str | None = Field(default=None, min_length=1)
    last_name: str | None = Field(default=None, min_length=1)
    role: str | None = None
    dni: str | None = None
    phone: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str | None) -> str | None:
        if value is not None:
            cleaned = value.strip()
            if not cleaned:
                raise ValueError("password no puede estar vacio")
            return cleaned
        return value


class AdminOut(BaseModel):
    id: UUID
    email: str
    first_name: str | None = None
    last_name: str | None = None
    role: str
    dni: str | None = None
    phone: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

