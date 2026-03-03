from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.schemas.work_item import (
    WorkItemCreate,
    WorkItemEventOut,
    WorkItemOut,
    WorkItemRespondIn,
    WorkItemTransitionIn,
    WorkItemUpdate,
)
from app.services import work_items_service

router = APIRouter(prefix="/work-items", tags=["work-items"])


@router.post("/", response_model=WorkItemOut, status_code=status.HTTP_201_CREATED)
def create_work_item(
    payload: WorkItemCreate,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    return work_items_service.create_work_item(db, payload, admin_email)


@router.get("/", response_model=list[WorkItemOut])
def list_work_items(
    kind: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    unmanaged: bool = Query(default=False),
    unanswered: bool = Query(default=False),
    bucket: str | None = Query(default=None, pattern="^(today|tomorrow|week)$"),
    assigned_admin_id: UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return work_items_service.list_work_items(
        db,
        kind=kind,
        status_filter=status_filter,
        unmanaged=unmanaged,
        unanswered=unanswered,
        bucket=bucket,
        assigned_admin_id=assigned_admin_id,
        skip=skip,
        limit=limit,
    )


@router.get("/{work_item_id}", response_model=WorkItemOut)
def get_work_item(
    work_item_id: UUID,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return work_items_service.get_work_item_or_404(db, work_item_id)


@router.patch("/{work_item_id}", response_model=WorkItemOut)
def patch_work_item(
    work_item_id: UUID,
    payload: WorkItemUpdate,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    return work_items_service.update_work_item(db, work_item_id, payload, admin_email)


@router.post("/{work_item_id}/transition", response_model=WorkItemOut)
def transition_work_item(
    work_item_id: UUID,
    payload: WorkItemTransitionIn,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    return work_items_service.transition_work_item(db, work_item_id, payload, admin_email)


@router.post("/{work_item_id}/respond", response_model=WorkItemOut)
def respond_work_item(
    work_item_id: UUID,
    payload: WorkItemRespondIn,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    return work_items_service.respond_work_item(db, work_item_id, payload, admin_email)


@router.post("/{work_item_id}/reopen", response_model=WorkItemOut)
def reopen_work_item(
    work_item_id: UUID,
    note: str | None = Query(default=None),
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    return work_items_service.reopen_work_item(db, work_item_id, admin_email, note=note)


@router.get("/{work_item_id}/events", response_model=list[WorkItemEventOut])
def list_work_item_events(
    work_item_id: UUID,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return work_items_service.list_work_item_events(db, work_item_id)
