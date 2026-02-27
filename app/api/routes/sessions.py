from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.models.workshop_session import WorkshopSession
from app.schemas.workshop_session import WorkshopSessionResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.get("/today", response_model=list[WorkshopSessionResponse])
def get_today_sessions(
    db: Session = Depends(get_db), 
    _: str = Depends(get_current_admin),
    target_date: Optional[date] = Query(None, description="Fecha objetivo, por defecto hoy")
):
    query_date = target_date or date.today()
    return db.execute(
        select(WorkshopSession)
        .where(WorkshopSession.date == query_date)
        .order_by(WorkshopSession.start_time)
    ).scalars().all()
