from __future__ import annotations

from datetime import date, timedelta
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.enrollment import Enrollment
from app.models.resource_term import ResourceTerm
from app.models.session_resource_requirement import SessionResourceRequirement
from app.models.workshop_session import WorkshopSession
from app.schemas.session_resource_requirement import ResourceProjectionRowOut, SessionResourceRequirementIn
from app.services import resource_terms_service


def _get_session_or_404(db: Session, workshop_id, session_id) -> WorkshopSession:
    row = (
        db.query(WorkshopSession)
        .filter(WorkshopSession.id == session_id, WorkshopSession.workshop_id == workshop_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Encuentro no encontrado para el taller")
    return row


def list_requirements(db: Session, workshop_id, session_id) -> list[SessionResourceRequirement]:
    _ = _get_session_or_404(db, workshop_id, session_id)
    return (
        db.query(SessionResourceRequirement)
        .filter(SessionResourceRequirement.workshop_session_id == session_id)
        .order_by(SessionResourceRequirement.created_at.asc())
        .all()
    )


def replace_requirements(
    db: Session,
    workshop_id,
    session_id,
    payload: list[SessionResourceRequirementIn],
    actor_email: str,
) -> list[SessionResourceRequirement]:
    _ = _get_session_or_404(db, workshop_id, session_id)

    normalized_entries: dict = {}
    for entry in payload:
        if entry.resource_term_id:
            term = resource_terms_service.get_visible_term_or_404(db, entry.resource_term_id, actor_email)
        else:
            term, _ = resource_terms_service.ensure_personal_term(db, entry.new_tag_label or "", actor_email)

        if term.governance_status == "merged" and term.merged_into_term_id:
            term = db.query(ResourceTerm).filter(ResourceTerm.id == term.merged_into_term_id).first() or term

        if term.id in normalized_entries:
            raise HTTPException(status_code=409, detail="La misma etiqueta no puede repetirse en un mismo encuentro")

        normalized_entries[term.id] = {
            "term": term,
            "quantity_required": float(entry.quantity_required),
            "unit": entry.unit,
            "requirement_mode": entry.requirement_mode,
            "criticality": entry.criticality,
            "notes": entry.notes,
        }

    existing = (
        db.query(SessionResourceRequirement)
        .filter(SessionResourceRequirement.workshop_session_id == session_id)
        .all()
    )
    existing_map = {row.resource_term_id: row for row in existing}

    keep_ids = set()
    for term_id, info in normalized_entries.items():
        keep_ids.add(term_id)
        current = existing_map.get(term_id)
        if current:
            current.quantity_required = info["quantity_required"]
            current.unit = info["unit"]
            current.requirement_mode = info["requirement_mode"]
            current.criticality = info["criticality"]
            current.notes = info["notes"]
            continue

        db.add(
            SessionResourceRequirement(
                workshop_session_id=session_id,
                resource_term_id=term_id,
                quantity_required=info["quantity_required"],
                unit=info["unit"],
                requirement_mode=info["requirement_mode"],
                criticality=info["criticality"],
                source="manual",
                notes=info["notes"],
            )
        )

    for stale in existing:
        if stale.resource_term_id not in keep_ids:
            db.delete(stale)

    db.commit()
    return list_requirements(db, workshop_id, session_id)


def _period_start(value: date, group_by: str) -> date:
    if group_by == "month":
        return value.replace(day=1)
    return value - timedelta(days=value.weekday())


def _period_label(value: date, group_by: str) -> str:
    if group_by == "month":
        return f"{value.year:04d}-{value.month:02d}"
    return value.strftime("%Y-W%W")


def projected_requirements(db: Session, date_from: date, date_to: date, group_by: str = "week") -> list[ResourceProjectionRowOut]:
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="Rango de fechas invalido")

    rows = (
        db.query(
            SessionResourceRequirement,
            WorkshopSession.workshop_id,
            WorkshopSession.date,
            ResourceTerm.label,
        )
        .join(WorkshopSession, WorkshopSession.id == SessionResourceRequirement.workshop_session_id)
        .join(ResourceTerm, ResourceTerm.id == SessionResourceRequirement.resource_term_id)
        .filter(WorkshopSession.date >= date_from, WorkshopSession.date <= date_to)
        .all()
    )

    workshop_ids = {
        workshop_id
        for req, workshop_id, _session_date, _label in rows
        if req.requirement_mode == "per_participant" and workshop_id
    }
    enrollment_counts = {}
    if workshop_ids:
        count_rows = (
            db.query(Enrollment.workshop_id, func.count(func.distinct(Enrollment.participant_id)))
            .filter(Enrollment.workshop_id.in_(list(workshop_ids)), Enrollment.status.in_(["enrolled", "active"]))
            .group_by(Enrollment.workshop_id)
            .all()
        )
        enrollment_counts = {workshop_id: int(total or 0) for workshop_id, total in count_rows}

    aggregates: dict[tuple, float] = {}
    for req, workshop_id, session_date, label in rows:
        period_start = _period_start(session_date, group_by)
        multiplier = 1.0
        if req.requirement_mode == "per_participant":
            multiplier = float(enrollment_counts.get(workshop_id, 0))
        total = float(req.quantity_required or 0.0) * multiplier
        key = (period_start, req.resource_term_id, req.unit, label)
        aggregates[key] = aggregates.get(key, 0.0) + total

    out: list[ResourceProjectionRowOut] = []
    for (period_start, resource_term_id, unit, label), total in sorted(aggregates.items()):
        out.append(
            ResourceProjectionRowOut(
                period_label=_period_label(period_start, group_by),
                period_start=period_start,
                resource_term_id=resource_term_id,
                resource_label=label,
                total_required=round(total, 2),
                unit=unit,
            )
        )
    return out
