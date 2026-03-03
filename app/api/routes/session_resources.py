from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.schemas.session_resource_requirement import (
    ResourceProjectionRowOut,
    SessionResourceRequirementIn,
    SessionResourceRequirementOut,
)
from app.services import session_resource_service

router = APIRouter(tags=["session-resources"])


def _to_requirement_out(row) -> SessionResourceRequirementOut:
    label = row.resource_term.label if row.resource_term else "Recurso"
    return SessionResourceRequirementOut(
        id=row.id,
        workshop_session_id=row.workshop_session_id,
        resource_term_id=row.resource_term_id,
        resource_label=label,
        quantity_required=row.quantity_required,
        unit=row.unit,
        requirement_mode=row.requirement_mode,
        criticality=row.criticality,
        source=row.source,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "/workshops/{workshop_id}/sessions/{session_id}/resource-requirements",
    response_model=list[SessionResourceRequirementOut],
)
def list_session_resource_requirements(
    workshop_id: UUID,
    session_id: UUID,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    rows = session_resource_service.list_requirements(db, workshop_id, session_id)
    return [_to_requirement_out(row) for row in rows]


@router.put(
    "/workshops/{workshop_id}/sessions/{session_id}/resource-requirements",
    response_model=list[SessionResourceRequirementOut],
)
def replace_session_resource_requirements(
    workshop_id: UUID,
    session_id: UUID,
    payload: list[SessionResourceRequirementIn],
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    rows = session_resource_service.replace_requirements(db, workshop_id, session_id, payload, admin_email)
    return [_to_requirement_out(row) for row in rows]


@router.get("/resource-projections", response_model=list[ResourceProjectionRowOut])
def get_resource_projections(
    date_from: date = Query(...),
    date_to: date = Query(...),
    group_by: str = Query(default="week", pattern="^(week|month)$"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return session_resource_service.projected_requirements(db, date_from, date_to, group_by=group_by)
