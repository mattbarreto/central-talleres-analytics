from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.schemas.operations import TacticalOperationsOut
from app.services import operations_service

router = APIRouter(prefix="/operations", tags=["operations"])


@router.get("/tactical", response_model=TacticalOperationsOut)
def get_tactical_operations_view(
    anchor_date: date | None = Query(default=None, description="Fecha de referencia para la vista táctica"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return operations_service.build_tactical_operations_payload(db, anchor_date=anchor_date)
