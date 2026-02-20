from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.crud.base import CRUDBase
from app.models.admin import Admin


class CRUDAdmin(CRUDBase):
    def create(self, db: Session, obj_in):
        data = obj_in.model_dump()
        data["email"] = data["email"].lower()
        data["password_hash"] = get_password_hash(data.pop("password"))
        db_obj = self.model(**data)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_by_email(self, db: Session, email: str):
        return db.query(self.model).filter(self.model.email == email.lower()).first()


admin = CRUDAdmin(Admin)
