from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common_validators import normalize_whitespace


class ResourceTermCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str) -> str:
        normalized = normalize_whitespace(value)
        if not normalized:
            raise ValueError("label no puede estar vacio")
        return normalized


class ResourceTermAliasCreate(BaseModel):
    alias_label: str = Field(min_length=1, max_length=120)

    @field_validator("alias_label")
    @classmethod
    def normalize_alias(cls, value: str) -> str:
        normalized = normalize_whitespace(value)
        if not normalized:
            raise ValueError("alias_label no puede estar vacio")
        return normalized


class ResourceTermPromoteIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class ResourceTermOut(BaseModel):
    id: UUID
    label: str
    normalized_key: str
    scope: Literal["global", "personal"]
    governance_status: Literal["draft", "approved", "merged", "deprecated"]
    owner_admin_id: UUID | None = None
    merged_into_term_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ResourceTermAliasOut(BaseModel):
    id: UUID
    resource_term_id: UUID
    alias_label: str
    normalized_alias: str
    scope: Literal["global", "personal"]
    owner_admin_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
