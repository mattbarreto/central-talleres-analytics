import re

from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.models.team_member import TeamMember


def _normalize_spaces(value):
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", str(value)).strip()
    return cleaned or None


def _normalize_phone(value):
    cleaned = _normalize_spaces(value)
    if not cleaned:
        return None
    if cleaned.startswith("+"):
        return "+" + "".join(ch for ch in cleaned[1:] if ch.isdigit())
    digits = "".join(ch for ch in cleaned if ch.isdigit())
    return digits or None


class CRUDTeamMember(CRUDBase):
    def create(self, db: Session, obj_in):
        data = obj_in.model_dump()
        data["name"] = _normalize_spaces(data.get("name"))
        data["email"] = (_normalize_spaces(data.get("email")) or "").lower() or None
        data["phone"] = _normalize_phone(data.get("phone"))
        db_obj = self.model(**data)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(self, db: Session, db_obj, obj_in):
        data = obj_in.model_dump(exclude_unset=True)
        if "name" in data:
            data["name"] = _normalize_spaces(data.get("name"))
        if "email" in data:
            data["email"] = (_normalize_spaces(data.get("email")) or "").lower() or None
        if "phone" in data:
            data["phone"] = _normalize_phone(data.get("phone"))
        for field, value in data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj


team_member = CRUDTeamMember(TeamMember)
