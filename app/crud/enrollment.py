import uuid

from sqlalchemy.orm import Session

from app.crud.base import CRUDBase
from app.models.enrollment import Enrollment


class CRUDEnrollment(CRUDBase):
    def get_by_workshop(self, db: Session, workshop_id):
        try:
            wid = uuid.UUID(str(workshop_id))
        except (ValueError, AttributeError):
            wid = workshop_id
        return db.query(self.model).filter(self.model.workshop_id == wid).all()


enrollment = CRUDEnrollment(Enrollment)
