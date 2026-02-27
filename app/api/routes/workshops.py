from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.crud.workshop import workshop as crud_workshop
from app.schemas.workshop import WorkshopCreate, WorkshopOut, WorkshopUpdate


router = APIRouter(prefix="/workshops", tags=["workshops"])


@router.get("/", response_model=list[WorkshopOut])
def list_workshops(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return crud_workshop.get_multi(db, skip=skip, limit=limit)


@router.post("/", response_model=WorkshopOut)
def create_workshop(payload: WorkshopCreate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    return crud_workshop.create(db, payload)


@router.get("/{workshop_id}", response_model=WorkshopOut)
def get_workshop(workshop_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_workshop.get(db, workshop_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Workshop not found")
    return obj


@router.put("/{workshop_id}", response_model=WorkshopOut)
def update_workshop(
    workshop_id: UUID, payload: WorkshopUpdate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    obj = crud_workshop.get(db, workshop_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Workshop not found")
    return crud_workshop.update(db, obj, payload)


@router.delete("/{workshop_id}", response_model=WorkshopOut)
def delete_workshop(workshop_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_workshop.remove(db, workshop_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Workshop not found")
    return obj


# --- Workshop Sessions (Agenda Pedagógica) ---

from app.schemas.workshop_session import WorkshopSessionCreate, WorkshopSessionResponse, WorkshopSessionUpdate
from app.services import workshop_session_service

@router.get("/{workshop_id}/sessions", response_model=list[WorkshopSessionResponse])
def list_workshop_sessions(
    workshop_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    workshop = crud_workshop.get(db, workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")
    return workshop_session_service.get_sessions(db, workshop_id)


@router.post("/{workshop_id}/sessions/bulk", response_model=list[WorkshopSessionResponse])
def bulk_create_workshop_sessions(
    workshop_id: UUID, payloads: list[WorkshopSessionCreate], db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    return workshop_session_service.bulk_create_sessions(db, workshop_id, payloads)


@router.post("/{workshop_id}/sessions", response_model=WorkshopSessionResponse)
def create_workshop_session(
    workshop_id: UUID, payload: WorkshopSessionCreate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    return workshop_session_service.create_session(db, workshop_id, payload)


@router.put("/{workshop_id}/sessions/{session_id}", response_model=WorkshopSessionResponse)
def update_workshop_session(
    workshop_id: UUID, session_id: UUID, payload: WorkshopSessionUpdate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    return workshop_session_service.update_session(db, workshop_id, session_id, payload)


@router.delete("/{workshop_id}/sessions/bulk", status_code=204)
def bulk_delete_workshop_sessions(
    workshop_id: UUID, payload: list[UUID], db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    workshop_session_service.bulk_delete_sessions(db, workshop_id, payload)


@router.delete("/{workshop_id}/sessions/{session_id}", status_code=204)
def delete_workshop_session(
    workshop_id: UUID, session_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    workshop_session_service.delete_session(db, workshop_id, session_id)
