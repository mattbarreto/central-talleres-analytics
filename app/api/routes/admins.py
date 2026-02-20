import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.crud.admin import admin as admin_crud
from app.models.admin import Admin
from app.schemas.admin import AdminCreate, AdminOut


router = APIRouter(prefix="/admins", tags=["admins"])


@router.get("/", response_model=list[AdminOut])
def list_admins(db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    try:
        with open("admin_debug.log", "a") as f: f.write("Entering list_admins\n")
        items = db.query(Admin).order_by(Admin.created_at.desc()).all()
        with open("admin_debug.log", "a") as f: f.write(f"Found items: {len(items)}\n")
        
        return items
    except Exception as e:
        with open("admin_debug.log", "a") as f: f.write(f"Error in list_admins: {e}\n")
        import traceback
        with open("admin_debug.log", "a") as f: traceback.print_exc(file=f)
        raise e


@router.post("/", response_model=AdminOut, status_code=status.HTTP_201_CREATED)
def create_admin(payload: AdminCreate, db: Session = Depends(get_db), _: Admin = Depends(get_current_admin)):
    try:
        with open("admin_debug.log", "a") as f: f.write(f"Creating admin: {payload.email}\n")
        existing = admin_crud.get_by_email(db, payload.email)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un admin con ese email")
        new_admin = admin_crud.create(db, payload)
        with open("admin_debug.log", "a") as f: f.write(f"Created admin: {new_admin.id}\n")
        return new_admin
    except Exception as e:
        with open("admin_debug.log", "a") as f: f.write(f"Error in create_admin: {e}\n")
        raise e


@router.delete("/{admin_id}", status_code=status.HTTP_200_OK)
def delete_admin(admin_id: str, db: Session = Depends(get_db), current: Admin = Depends(get_current_admin)):
    try:
        aid = uuid.UUID(admin_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID inválido")
    target = db.query(Admin).filter(Admin.id == aid).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin no encontrado")
    if str(target.id) == str(current.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No podés eliminarte a vos mismo")
    db.delete(target)
    db.commit()
    return {"detail": "Admin eliminado"}



