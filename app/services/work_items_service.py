from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
import json
import zoneinfo

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.admin import Admin
from app.models.work_item import WorkItem
from app.models.work_item_event import WorkItemEvent
from app.schemas.work_item import WorkItemCreate, WorkItemRespondIn, WorkItemTransitionIn, WorkItemUpdate

TZ = zoneinfo.ZoneInfo("America/Argentina/Buenos_Aires")

STATUS_TRANSITIONS: dict[str, set[str]] = {
    "new": {"triaged", "in_progress", "waiting_response", "resolved", "closed"},
    "triaged": {"in_progress", "waiting_response", "resolved", "closed"},
    "in_progress": {"waiting_response", "resolved", "closed"},
    "waiting_response": {"in_progress", "resolved", "closed"},
    "resolved": {"closed", "triaged", "in_progress", "waiting_response"},
    "closed": {"triaged", "in_progress", "waiting_response"},
}

ANSWER_PENDING_STATUSES = {"triaged", "in_progress", "waiting_response"}


def _now() -> datetime:
    return datetime.now(UTC)


def _get_admin(db: Session, email: str) -> Admin:
    admin = db.query(Admin).filter(Admin.email == email.lower()).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin no autenticado")
    return admin


def _compose_admin_display_name(first_name: str | None, last_name: str | None, email: str | None) -> str | None:
    full_name = " ".join(part for part in [(first_name or "").strip(), (last_name or "").strip()] if part)
    if full_name:
        return full_name
    normalized_email = (email or "").strip()
    return normalized_email or None


def _attach_assigned_admin_names(db: Session, items: list[WorkItem]) -> list[WorkItem]:
    if not items:
        return items

    admin_ids = {item.assigned_admin_id for item in items if item.assigned_admin_id}
    if not admin_ids:
        for item in items:
            setattr(item, "assigned_admin_name", None)
        return items

    admin_rows = (
        db.query(Admin.id, Admin.first_name, Admin.last_name, Admin.email)
        .filter(Admin.id.in_(list(admin_ids)))
        .all()
    )
    names_by_id = {
        row.id: _compose_admin_display_name(row.first_name, row.last_name, row.email)
        for row in admin_rows
    }
    for item in items:
        setattr(item, "assigned_admin_name", names_by_id.get(item.assigned_admin_id))
    return items


def _attach_assigned_admin_name(db: Session, item: WorkItem) -> WorkItem:
    _attach_assigned_admin_names(db, [item])
    return item


def _append_event(
    db: Session,
    *,
    item: WorkItem,
    actor_admin_id,
    event_type: str,
    from_status: str | None = None,
    to_status: str | None = None,
    note: str | None = None,
    payload: dict | None = None,
) -> None:
    db.add(
        WorkItemEvent(
            work_item_id=item.id,
            actor_admin_id=actor_admin_id,
            event_type=event_type,
            from_status=from_status,
            to_status=to_status,
            note=note,
            payload_json=json.dumps(payload, ensure_ascii=False) if payload else None,
            occurred_at=_now(),
        )
    )


def _apply_transition(item: WorkItem, target_status: str, now: datetime) -> tuple[str, bool]:
    current = item.status
    if target_status == current:
        raise HTTPException(status_code=400, detail="El estado destino coincide con el estado actual")
    allowed = STATUS_TRANSITIONS.get(current, set())
    if target_status not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Transicion no permitida: {current} -> {target_status}",
        )

    reopened = current in {"resolved", "closed"} and target_status in {"triaged", "in_progress", "waiting_response"}

    if current == "new" and item.first_managed_at is None:
        item.first_managed_at = now

    if target_status == "resolved":
        item.resolved_at = now
    if target_status == "closed":
        item.closed_at = now

    if reopened:
        item.reopen_count = int(item.reopen_count or 0) + 1
        item.reopened_at = now

    item.status = target_status
    item.last_status_change_at = now
    return current, reopened


def create_work_item(db: Session, payload: WorkItemCreate, actor_email: str) -> WorkItem:
    actor = _get_admin(db, actor_email)
    now = _now()
    response_required = payload.response_required
    if response_required is None:
        response_required = payload.kind in {"query", "report"}

    item = WorkItem(
        kind=payload.kind,
        status="new",
        priority=payload.priority,
        title=payload.title,
        description=payload.description,
        response_required=bool(response_required),
        due_at=payload.due_at,
        created_by_admin_id=actor.id,
        assigned_admin_id=payload.assigned_admin_id,
        workshop_id=payload.workshop_id,
        workshop_session_id=payload.workshop_session_id,
        participant_id=payload.participant_id,
        team_member_id=payload.team_member_id,
        last_status_change_at=now,
    )
    db.add(item)
    db.flush()
    _append_event(
        db,
        item=item,
        actor_admin_id=actor.id,
        event_type="created",
        to_status=item.status,
        payload={"kind": item.kind, "priority": item.priority},
    )
    db.commit()
    db.refresh(item)
    return _attach_assigned_admin_name(db, item)


def list_work_items(
    db: Session,
    *,
    kind: str | None = None,
    status_filter: str | None = None,
    unmanaged: bool = False,
    unanswered: bool = False,
    bucket: str | None = None,
    assigned_admin_id=None,
    skip: int = 0,
    limit: int = 200,
) -> list[WorkItem]:
    query = db.query(WorkItem)

    if kind:
        query = query.filter(WorkItem.kind == kind)
    if status_filter:
        query = query.filter(WorkItem.status == status_filter)
    if assigned_admin_id:
        query = query.filter(WorkItem.assigned_admin_id == assigned_admin_id)

    if unmanaged:
        query = query.filter(WorkItem.status == "new", WorkItem.first_managed_at.is_(None))

    if unanswered:
        query = query.filter(
            WorkItem.response_required.is_(True),
            WorkItem.first_response_at.is_(None),
            WorkItem.status.in_(list(ANSWER_PENDING_STATUSES)),
        )

    if bucket in {"today", "tomorrow", "week"}:
        today = datetime.now(TZ).date()
        start_date = today
        if bucket == "tomorrow":
            start_date = today + timedelta(days=1)
            end_date = start_date + timedelta(days=1)
        elif bucket == "week":
            end_date = start_date + timedelta(days=7)
        else:
            end_date = start_date + timedelta(days=1)

        start_dt = datetime.combine(start_date, time.min, tzinfo=TZ).astimezone(UTC)
        end_dt = datetime.combine(end_date, time.min, tzinfo=TZ).astimezone(UTC)
        query = query.filter(WorkItem.due_at.is_not(None), WorkItem.due_at >= start_dt, WorkItem.due_at < end_dt)

    rows = (
        query.order_by(
            WorkItem.due_at.is_(None),
            WorkItem.due_at.asc(),
            WorkItem.created_at.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )
    return _attach_assigned_admin_names(db, rows)


def get_work_item_or_404(db: Session, work_item_id) -> WorkItem:
    item = db.query(WorkItem).filter(WorkItem.id == work_item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Pendiente no encontrado")
    return _attach_assigned_admin_name(db, item)


def update_work_item(db: Session, work_item_id, payload: WorkItemUpdate, actor_email: str) -> WorkItem:
    actor = _get_admin(db, actor_email)
    item = get_work_item_or_404(db, work_item_id)
    before_assigned = item.assigned_admin_id

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)

    if before_assigned != item.assigned_admin_id:
        _append_event(
            db,
            item=item,
            actor_admin_id=actor.id,
            event_type="assigned",
            note="Actualizacion de responsable",
            payload={
                "before_assigned_admin_id": str(before_assigned) if before_assigned else None,
                "after_assigned_admin_id": str(item.assigned_admin_id) if item.assigned_admin_id else None,
            },
        )
    else:
        _append_event(
            db,
            item=item,
            actor_admin_id=actor.id,
            event_type="updated",
        )

    db.commit()
    db.refresh(item)
    return _attach_assigned_admin_name(db, item)


def transition_work_item(db: Session, work_item_id, payload: WorkItemTransitionIn, actor_email: str) -> WorkItem:
    actor = _get_admin(db, actor_email)
    item = get_work_item_or_404(db, work_item_id)
    now = _now()

    from_status, reopened = _apply_transition(item, payload.target_status, now)

    _append_event(
        db,
        item=item,
        actor_admin_id=actor.id,
        event_type="reopened" if reopened else "status_changed",
        from_status=from_status,
        to_status=item.status,
        note=payload.note,
    )

    db.commit()
    db.refresh(item)
    return _attach_assigned_admin_name(db, item)


def respond_work_item(db: Session, work_item_id, payload: WorkItemRespondIn, actor_email: str) -> WorkItem:
    actor = _get_admin(db, actor_email)
    item = get_work_item_or_404(db, work_item_id)
    now = _now()

    if item.first_response_at is None:
        item.first_response_at = now

    if item.status == "new" and item.first_managed_at is None:
        item.first_managed_at = now

    from_status = item.status
    if payload.status_after:
        previous_status, reopened = _apply_transition(item, payload.status_after, now)
        _append_event(
            db,
            item=item,
            actor_admin_id=actor.id,
            event_type="reopened" if reopened else "status_changed",
            from_status=previous_status,
            to_status=item.status,
            note="Cambio de estado en respuesta",
        )
    elif item.status == "new":
        item.status = "triaged"
        item.last_status_change_at = now
        _append_event(
            db,
            item=item,
            actor_admin_id=actor.id,
            event_type="status_changed",
            from_status=from_status,
            to_status=item.status,
            note="Cambio automatico al responder",
        )

    _append_event(
        db,
        item=item,
        actor_admin_id=actor.id,
        event_type="responded",
        note=payload.message,
    )

    db.commit()
    db.refresh(item)
    return _attach_assigned_admin_name(db, item)


def reopen_work_item(db: Session, work_item_id, actor_email: str, note: str | None = None) -> WorkItem:
    actor = _get_admin(db, actor_email)
    item = get_work_item_or_404(db, work_item_id)
    if item.status not in {"resolved", "closed"}:
        raise HTTPException(status_code=409, detail="Solo se puede reabrir un pendiente resuelto o cerrado")

    now = _now()
    from_status, _ = _apply_transition(item, "triaged", now)
    _append_event(
        db,
        item=item,
        actor_admin_id=actor.id,
        event_type="reopened",
        from_status=from_status,
        to_status=item.status,
        note=note,
    )

    db.commit()
    db.refresh(item)
    return _attach_assigned_admin_name(db, item)


def list_work_item_events(db: Session, work_item_id) -> list[WorkItemEvent]:
    _ = get_work_item_or_404(db, work_item_id)
    return (
        db.query(WorkItemEvent)
        .filter(WorkItemEvent.work_item_id == work_item_id)
        .order_by(WorkItemEvent.occurred_at.desc())
        .all()
    )
