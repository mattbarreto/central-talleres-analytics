from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.crud.admin import admin as admin_crud
from app.models.admin import Admin
from app.schemas.admin import AdminCreate, AdminOut


router = APIRouter(prefix="/admins", tags=["admins"])


@router.get("/", response_model=list[AdminOut])
def list_admins(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return db.query(Admin).order_by(Admin.created_at.desc()).offset(skip).limit(limit).all()


@router.post("/", response_model=AdminOut, status_code=status.HTTP_201_CREATED)
def create_admin(payload: AdminCreate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    existing = admin_crud.get_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un admin con ese email")
    return admin_crud.create(db, payload)


@router.delete("/{admin_id}", status_code=status.HTTP_200_OK)
def delete_admin(admin_id: UUID, db: Session = Depends(get_db), current_email: str = Depends(get_current_admin)):
    target = db.query(Admin).filter(Admin.id == admin_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin no encontrado")
    if (target.email or "").lower() == current_email.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No podés eliminarte a vos mismo")
    db.delete(target)
    db.commit()
    return {"detail": "Admin eliminado"}
