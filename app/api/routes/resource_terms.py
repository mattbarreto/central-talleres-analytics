from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.schemas.resource_term import (
    ResourceTermAliasCreate,
    ResourceTermAliasOut,
    ResourceTermCreate,
    ResourceTermOut,
    ResourceTermPromoteIn,
)
from app.services import resource_terms_service

router = APIRouter(prefix="/resource-terms", tags=["resource-terms"])


@router.get("/", response_model=list[ResourceTermOut])
def list_resource_terms(
    q: str | None = Query(default=None),
    include_merged: bool = Query(default=False),
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    return resource_terms_service.list_terms(db, admin_email, q=q, include_merged=include_merged)


@router.post("/", response_model=ResourceTermOut)
def create_resource_term(
    payload: ResourceTermCreate,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    term, _ = resource_terms_service.ensure_personal_term(db, payload.label, admin_email)
    return term


@router.post("/{term_id}/aliases", response_model=ResourceTermAliasOut)
def create_resource_term_alias(
    term_id: UUID,
    payload: ResourceTermAliasCreate,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    return resource_terms_service.create_alias(db, term_id, payload.alias_label, admin_email)


@router.post("/{term_id}/promote", response_model=ResourceTermOut)
def promote_resource_term(
    term_id: UUID,
    payload: ResourceTermPromoteIn,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    _ = payload
    return resource_terms_service.promote_term_to_global(db, term_id, admin_email)
