import uuid
from typing import Any

from sqlalchemy.orm import Session


def _to_uuid(value):
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError):
        return value


class CRUDBase:
    def __init__(self, model):
        self.model = model

    def get(self, db: Session, id: Any):
        return db.get(self.model, _to_uuid(id))

    def get_multi(self, db: Session, skip: int = 0, limit: int = 100):
        return db.query(self.model).offset(skip).limit(limit).all()

    def create(self, db: Session, obj_in):
        db_obj = self.model(**obj_in.model_dump())
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(self, db: Session, db_obj, obj_in):
        data = obj_in.model_dump(exclude_unset=True)
        for field, value in data.items():
            setattr(db_obj, field, value)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def remove(self, db: Session, id: Any):
        obj = db.get(self.model, _to_uuid(id))
        if obj:
            db.delete(obj)
            db.commit()
        return obj
