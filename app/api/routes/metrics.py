from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.models.communication import Communication
from app.models.enrollment import Enrollment
from app.models.workshop import Workshop
from app.schemas.metrics import CommunicationsCount, ParticipantsByWorkshop, WorkshopsByYear


router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/workshops-by-year", response_model=list[WorkshopsByYear])
def workshops_by_year(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    rows = db.query(Workshop.cohort_year, func.count(Workshop.id)).group_by(Workshop.cohort_year).all()
    return [{"cohort_year": r[0], "total": r[1]} for r in rows]


@router.get("/participants-by-workshop", response_model=list[ParticipantsByWorkshop])
def participants_by_workshop(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    rows = db.query(Enrollment.workshop_id, func.count(Enrollment.id)).group_by(Enrollment.workshop_id).all()
    return [{"workshop_id": r[0], "total": r[1]} for r in rows]


@router.get("/communications-count", response_model=CommunicationsCount)
def communications_count(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    total = db.query(func.count(Communication.id)).scalar() or 0
    return {"total": total}
