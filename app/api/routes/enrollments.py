from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.crud.enrollment import enrollment as crud_enrollment
from app.models.enrollment import Enrollment
from app.schemas.enrollment import EnrollmentCreate, EnrollmentOut, EnrollmentUpdate


router = APIRouter(tags=["enrollments"])


@router.get("/workshops/{workshop_id}/enrollments", response_model=list[EnrollmentOut])
def list_enrollments(workshop_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    return crud_enrollment.get_by_workshop(db, workshop_id)


@router.get("/enrollments/by-workshops", response_model=list[EnrollmentOut])
def list_enrollments_by_workshops(
    workshop_ids: str = Query(..., description="Lista de IDs separados por coma"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    ids: list[UUID] = []
    for raw_id in (workshop_ids or "").split(","):
        cleaned = raw_id.strip()
        if not cleaned:
            continue
        try:
            ids.append(UUID(cleaned))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Workshop ID inválido: {cleaned}")
    if not ids:
        return []
    return (
        db.query(Enrollment)
        .filter(Enrollment.workshop_id.in_(ids))
        .order_by(Enrollment.created_at.desc())
        .all()
    )


@router.post("/workshops/{workshop_id}/enrollments", response_model=EnrollmentOut)
def create_enrollment(
    workshop_id: UUID, payload: EnrollmentCreate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    if payload.workshop_id != workshop_id:
        raise HTTPException(status_code=400, detail="Workshop ID mismatch")
    try:
        return crud_enrollment.create(db, payload)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Enrollment already exists")


@router.put("/enrollments/{enrollment_id}", response_model=EnrollmentOut)
def update_enrollment(
    enrollment_id: UUID, payload: EnrollmentUpdate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    obj = crud_enrollment.get(db, enrollment_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return crud_enrollment.update(db, obj, payload)


@router.delete("/enrollments/{enrollment_id}", response_model=EnrollmentOut)
def delete_enrollment(enrollment_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_enrollment.remove(db, enrollment_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return obj
