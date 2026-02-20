from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.models.participant import Participant


def _normalize_dni(value):
    if not value:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    return digits or None


def _normalize_gender(value):
    if not value:
        return "undisclosed"
    allowed = {"female", "male", "non_binary", "other", "undisclosed"}
    normalized = str(value).strip().lower()
    return normalized if normalized in allowed else "undisclosed"


class CRUDParticipant(CRUDBase):
    def create(self, db: Session, obj_in):
        data = obj_in.model_dump()
        data["email"] = data["email"].lower()
        data["dni"] = _normalize_dni(data.get("dni"))
        data["gender"] = _normalize_gender(data.get("gender"))
        db_obj = self.model(**data)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(self, db: Session, db_obj, obj_in):
        data = obj_in.model_dump(exclude_unset=True)
        if "email" in data and data["email"]:
            data["email"] = data["email"].lower()
        if "dni" in data:
            data["dni"] = _normalize_dni(data.get("dni"))
        if "gender" in data:
            data["gender"] = _normalize_gender(data.get("gender"))
        for field, value in data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_by_email(self, db: Session, email: str):
        return db.query(self.model).filter(self.model.email == email.lower()).first()

    def get_by_dni(self, db: Session, dni: str):
        normalized = _normalize_dni(dni)
        if not normalized:
            return None
        return db.query(self.model).filter(self.model.dni == normalized).first()


participant = CRUDParticipant(Participant)
