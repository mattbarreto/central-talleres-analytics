from __future__ import annotations

from collections import Counter
from datetime import UTC, date, datetime, timedelta
import json
import zoneinfo
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.admin import Admin
from app.models.enrollment import Enrollment
from app.models.resource_term import ResourceTerm
from app.models.session_resource_requirement import SessionResourceRequirement
from app.models.team_member import TeamMember
from app.models.work_item import WorkItem
from app.models.workshop import Workshop
from app.models.workshop_session import WorkshopSession
from app.schemas.operations import TacticalOperationsOut
from app.services import weekly_snapshot_service

TZ = zoneinfo.ZoneInfo("America/Argentina/Buenos_Aires")
OPEN_PENDING_STATUSES = {"new", "triaged", "in_progress", "waiting_response"}


def _local_due_date(value: datetime | None) -> date | None:
    if not value:
        return None
    parsed = value if value.tzinfo else value.replace(tzinfo=UTC)
    return parsed.astimezone(TZ).date()


def _topic_is_meaningful(topic: str | None) -> bool:
    value = (topic or "").strip().lower()
    if not value:
        return False
    return value not in {"sin tema", "s/t", "pendiente", "por definir", "tbd"}


def _format_time(value) -> str:
    return value.strftime("%H:%M") if value else ""


def _effective_quantity(quantity_required: float, requirement_mode: str, participants: int) -> float:
    if requirement_mode == "per_participant":
        return float(quantity_required or 0) * float(participants)
    return float(quantity_required or 0)


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

    rows = (
        db.query(Admin.id, Admin.first_name, Admin.last_name, Admin.email)
        .filter(Admin.id.in_(list(admin_ids)))
        .all()
    )
    names_by_id = {
        row.id: _compose_admin_display_name(row.first_name, row.last_name, row.email)
        for row in rows
    }
    for item in items:
        setattr(item, "assigned_admin_name", names_by_id.get(item.assigned_admin_id))
    return items


def _week_bounds(anchor_date: date) -> tuple[date, date]:
    week_start = anchor_date - timedelta(days=anchor_date.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def _fetch_enrollment_counts(db: Session, workshop_ids: set[UUID]) -> dict[UUID, int]:
    if not workshop_ids:
        return {}
    rows = (
        db.query(Enrollment.workshop_id, func.count(func.distinct(Enrollment.participant_id)))
        .filter(
            Enrollment.workshop_id.in_(list(workshop_ids)),
            Enrollment.status.in_(["enrolled", "active"]),
        )
        .group_by(Enrollment.workshop_id)
        .all()
    )
    return {workshop_id: int(total or 0) for workshop_id, total in rows}


def _fetch_session_resources(db: Session, session_ids: set[UUID]) -> dict[UUID, list[dict]]:
    if not session_ids:
        return {}

    rows = (
        db.query(
            SessionResourceRequirement.workshop_session_id,
            SessionResourceRequirement.resource_term_id,
            ResourceTerm.label,
            SessionResourceRequirement.quantity_required,
            SessionResourceRequirement.unit,
            SessionResourceRequirement.requirement_mode,
            SessionResourceRequirement.criticality,
        )
        .join(ResourceTerm, ResourceTerm.id == SessionResourceRequirement.resource_term_id)
        .filter(SessionResourceRequirement.workshop_session_id.in_(list(session_ids)))
        .all()
    )

    out: dict[UUID, list[dict]] = {}
    for session_id, term_id, label, quantity_required, unit, requirement_mode, criticality in rows:
        out.setdefault(session_id, []).append(
            {
                "resource_term_id": term_id,
                "resource_label": label,
                "quantity_required": float(quantity_required or 0),
                "unit": unit,
                "requirement_mode": requirement_mode,
                "criticality": criticality,
            }
        )
    return out


def _build_sessions_window(db: Session, date_from: date, date_to: date) -> list[dict]:
    rows = (
        db.query(
            WorkshopSession,
            Workshop.name.label("workshop_name"),
            TeamMember.name.label("facilitator_name"),
        )
        .join(Workshop, Workshop.id == WorkshopSession.workshop_id)
        .outerjoin(TeamMember, TeamMember.id == WorkshopSession.facilitator_id)
        .filter(WorkshopSession.date >= date_from, WorkshopSession.date <= date_to)
        .order_by(WorkshopSession.date.asc(), WorkshopSession.start_time.asc())
        .all()
    )

    if not rows:
        return []

    workshop_ids = {row.WorkshopSession.workshop_id for row in rows if row.WorkshopSession.workshop_id}
    session_ids = {row.WorkshopSession.id for row in rows}
    enrollment_counts = _fetch_enrollment_counts(db, workshop_ids)
    resources_by_session = _fetch_session_resources(db, session_ids)

    sessions: list[dict] = []
    for row in rows:
        session = row.WorkshopSession
        workshop_id = session.workshop_id
        participants_estimated = int(enrollment_counts.get(workshop_id, 0))
        resource_rows = resources_by_session.get(session.id, [])

        resources_payload = []
        for req in resource_rows:
            effective_quantity = round(
                _effective_quantity(req["quantity_required"], req["requirement_mode"], participants_estimated),
                2,
            )
            resources_payload.append(
                {
                    **req,
                    "effective_quantity": effective_quantity,
                }
            )

        missing_facilitator = session.facilitator_id is None
        missing_topic = not _topic_is_meaningful(session.topic)
        missing_resources = len(resources_payload) == 0
        has_critical_resources = any(r["criticality"] == "high" for r in resources_payload)

        if session.status == "cancelled":
            operational_status = "cancelled"
            attention_flags: list[str] = []
        elif session.status == "completed":
            operational_status = "completed"
            attention_flags = []
        else:
            attention_flags = []
            if missing_facilitator:
                attention_flags.append("missing_facilitator")
            if missing_topic:
                attention_flags.append("missing_topic")
            if missing_resources:
                attention_flags.append("missing_resources")
            if has_critical_resources:
                attention_flags.append("critical_resources")

            if any(flag in attention_flags for flag in {"missing_facilitator", "missing_topic", "missing_resources"}):
                operational_status = "incomplete"
            elif has_critical_resources:
                operational_status = "at_risk"
            else:
                operational_status = "ready"

        sessions.append(
            {
                "id": session.id,
                "workshop_id": workshop_id,
                "workshop_name": row.workshop_name,
                "date": session.date,
                "start_time": _format_time(session.start_time),
                "end_time": _format_time(session.end_time),
                "topic": (session.topic or "").strip() or "Sin tema",
                "facilitator_id": session.facilitator_id,
                "facilitator_name": row.facilitator_name,
                "session_status": session.status,
                "estimated_participants": participants_estimated,
                "resources": resources_payload,
                "operational_status": operational_status,
                "attention_flags": attention_flags,
            }
        )

    return sessions


def _aggregate_resources(sessions: list[dict]) -> list[dict]:
    aggregates: dict[tuple, dict] = {}
    for session in sessions:
        for req in session["resources"]:
            key = (req["resource_term_id"], req["resource_label"], req["unit"])
            if key not in aggregates:
                aggregates[key] = {
                    "resource_term_id": req["resource_term_id"],
                    "resource_label": req["resource_label"],
                    "total_required": 0.0,
                    "unit": req["unit"],
                    "critical_sessions_count": 0,
                }
            aggregates[key]["total_required"] += float(req["effective_quantity"])
            if req["criticality"] == "high":
                aggregates[key]["critical_sessions_count"] += 1

    rows = list(aggregates.values())
    for row in rows:
        row["total_required"] = round(float(row["total_required"]), 2)
    rows.sort(key=lambda item: item["total_required"], reverse=True)
    return rows


def _build_day_block(
    target_date: date,
    sessions: list[dict],
    pending_due_count: int,
    pending_unanswered_count: int,
) -> dict:
    workshops = {row["workshop_id"] for row in sessions}
    facilitators = {row["facilitator_id"] for row in sessions if row["facilitator_id"]}

    participants_by_workshop: dict[UUID, int] = {}
    for row in sessions:
        participants_by_workshop[row["workshop_id"]] = int(row["estimated_participants"])

    resource_rows = _aggregate_resources([row for row in sessions if row["session_status"] != "cancelled"])
    critical_resources = [row for row in resource_rows if row["critical_sessions_count"] > 0][:6]

    sessions_requiring_attention = [
        row for row in sessions if row["session_status"] == "scheduled" and row["operational_status"] in {"incomplete", "at_risk"}
    ]
    missing_facilitator = sum(1 for row in sessions if "missing_facilitator" in row["attention_flags"])
    missing_resources = sum(1 for row in sessions if "missing_resources" in row["attention_flags"])

    alerts: list[str] = []
    if not sessions:
        alerts.append("Sin encuentros programados para esta fecha.")
    if missing_facilitator:
        alerts.append(f"{missing_facilitator} encuentro(s) sin docente asignado.")
    if missing_resources:
        alerts.append(f"{missing_resources} encuentro(s) sin recursos cargados.")
    if pending_due_count:
        alerts.append(f"{pending_due_count} pendiente(s) con vencimiento en la fecha.")

    return {
        "summary": {
            "date": target_date,
            "sessions_count": len(sessions),
            "workshops_count": len(workshops),
            "facilitators_count": len(facilitators),
            "participants_estimated": sum(participants_by_workshop.values()),
            "critical_resources_count": len(critical_resources),
            "sessions_requiring_attention_count": len(sessions_requiring_attention),
            "pending_due_count": int(pending_due_count),
            "pending_unanswered_count": int(pending_unanswered_count),
        },
        "sessions": sessions,
        "critical_resources": critical_resources,
        "alerts": alerts,
    }


def _format_peak_day(value: date | None) -> str | None:
    if not value:
        return None
    day_labels = {0: "Lun", 1: "Mar", 2: "Mie", 3: "Jue", 4: "Vie", 5: "Sab", 6: "Dom"}
    return f"{day_labels.get(value.weekday(), '')} {value.strftime('%d/%m')}"


def _build_week_block(week_start: date, week_end: date, sessions: list[dict]) -> dict:
    operative_sessions = [row for row in sessions if row["session_status"] != "cancelled"]
    scheduled_sessions = [row for row in operative_sessions if row["session_status"] == "scheduled"]

    workshops = {row["workshop_id"] for row in operative_sessions}
    facilitators = {row["facilitator_id"] for row in operative_sessions if row["facilitator_id"]}

    day_counter = Counter(row["date"] for row in operative_sessions)
    peak_day_date = day_counter.most_common(1)[0][0] if day_counter else None

    slot_counter: Counter[str] = Counter()
    for row in operative_sessions:
        start_time = row["start_time"]
        if not start_time:
            continue
        hour = int(start_time.split(":")[0])
        slot_counter[f"{hour:02d}:00-{hour:02d}:59"] += 1
    peak_time_slot = slot_counter.most_common(1)[0][0] if slot_counter else None

    facilitator_counter: Counter[tuple[UUID, str]] = Counter()
    for row in operative_sessions:
        if row["facilitator_id"] and row["facilitator_name"]:
            facilitator_counter[(row["facilitator_id"], row["facilitator_name"])] += 1
    top_facilitators = [
        {
            "facilitator_id": facilitator_id,
            "facilitator_name": facilitator_name,
            "sessions_count": total,
        }
        for (facilitator_id, facilitator_name), total in facilitator_counter.most_common(6)
    ]

    top_resources = _aggregate_resources(operative_sessions)[:8]

    daily_sessions = [
        {"date": str(date_val), "count": count}
        for date_val, count in sorted(day_counter.items())
    ]

    return {
        "summary": {
            "week_start": week_start,
            "week_end": week_end,
            "sessions_count": len(operative_sessions),
            "workshops_count": len(workshops),
            "facilitators_count": len(facilitators),
            "peak_day": _format_peak_day(peak_day_date),
            "peak_time_slot": peak_time_slot,
            "sessions_without_facilitator_count": sum(
                1 for row in scheduled_sessions if "missing_facilitator" in row["attention_flags"]
            ),
            "sessions_without_topic_count": sum(1 for row in scheduled_sessions if "missing_topic" in row["attention_flags"]),
            "sessions_without_resources_count": sum(
                1 for row in scheduled_sessions if "missing_resources" in row["attention_flags"]
            ),
        },
        "top_facilitators": top_facilitators,
        "top_resources": top_resources,
        "daily_sessions": daily_sessions,
    }


def _build_pending_board(all_items: list[WorkItem], anchor_date: date, week_end: date) -> dict:
    tomorrow = anchor_date + timedelta(days=1)
    after_tomorrow = anchor_date + timedelta(days=2)

    buckets = {
        "today": [],
        "tomorrow": [],
        "week": [],
        "overdue": [],
        "unmanaged": [],
        "unanswered": [],
    }

    for item in all_items:
        due_date = _local_due_date(item.due_at)

        if due_date:
            if due_date < anchor_date:
                buckets["overdue"].append(item)
            elif due_date == anchor_date:
                buckets["today"].append(item)
            elif due_date == tomorrow:
                buckets["tomorrow"].append(item)
            elif after_tomorrow <= due_date <= week_end:
                buckets["week"].append(item)

        if item.status == "new" and item.first_managed_at is None:
            buckets["unmanaged"].append(item)

        if item.response_required and item.first_response_at is None and item.status in OPEN_PENDING_STATUSES:
            buckets["unanswered"].append(item)

    return {
        key: {
            "count": len(value),
            "items": value,
        }
        for key, value in buckets.items()
    }


def _count_unanswered_due_until(items: list[WorkItem], limit_date: date) -> int:
    total = 0
    for item in items:
        due_date = _local_due_date(item.due_at)
        if due_date is None or due_date <= limit_date:
            total += 1
    return total


def _build_attention_queue(
    anchor_date: date,
    today_sessions: list[dict],
    tomorrow_sessions: list[dict],
    pending_board: dict,
) -> list[dict]:
    def priority_rank(value: str) -> int:
        return {"high": 0, "medium": 1, "low": 2}.get(value, 3)

    queue: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def append(item: dict, dedupe_key: tuple[str, str]) -> None:
        if dedupe_key in seen:
            return
        seen.add(dedupe_key)
        queue.append(item)

    for row in today_sessions + tomorrow_sessions:
        base_priority = "high" if row["date"] == anchor_date else "medium"
        context = f"{row['start_time']} · {row['workshop_name']}"

        if "missing_resources" in row["attention_flags"]:
            append(
                {
                    "kind": "missing_resources",
                    "priority": base_priority,
                    "title": "Encuentro sin recursos cargados",
                    "subtitle": context,
                    "workshop_id": row["workshop_id"],
                    "session_id": row["id"],
                    "date": row["date"],
                    "start_time": row["start_time"],
                },
                ("missing_resources", str(row["id"])),
            )

        if "missing_facilitator" in row["attention_flags"]:
            append(
                {
                    "kind": "missing_facilitator",
                    "priority": base_priority,
                    "title": "Encuentro sin docente asignado",
                    "subtitle": context,
                    "workshop_id": row["workshop_id"],
                    "session_id": row["id"],
                    "date": row["date"],
                    "start_time": row["start_time"],
                },
                ("missing_facilitator", str(row["id"])),
            )

        if "critical_resources" in row["attention_flags"]:
            critical_labels = ", ".join(
                req["resource_label"] for req in row["resources"] if req["criticality"] == "high"
            )
            append(
                {
                    "kind": "critical_resources",
                    "priority": "medium" if row["date"] == anchor_date else "low",
                    "title": "Recursos criticos a preparar",
                    "subtitle": f"{context} · {critical_labels or 'Revisar requerimientos'}",
                    "workshop_id": row["workshop_id"],
                    "session_id": row["id"],
                    "date": row["date"],
                    "start_time": row["start_time"],
                },
                ("critical_resources", str(row["id"])),
            )

    for item in pending_board["overdue"]["items"][:10]:
        append(
            {
                "kind": "overdue_work_item",
                "priority": "high",
                "title": "Pendiente vencido",
                "subtitle": item.title,
                "work_item_id": item.id,
                "workshop_id": item.workshop_id,
                "due_at": item.due_at,
            },
            ("overdue_work_item", str(item.id)),
        )

    for item in pending_board["unanswered"]["items"][:10]:
        append(
            {
                "kind": "unanswered_work_item",
                "priority": "high" if _local_due_date(item.due_at) == anchor_date else "medium",
                "title": "Pendiente sin responder",
                "subtitle": item.title,
                "work_item_id": item.id,
                "workshop_id": item.workshop_id,
                "due_at": item.due_at,
            },
            ("unanswered_work_item", str(item.id)),
        )

    for item in pending_board["unmanaged"]["items"][:10]:
        append(
            {
                "kind": "unmanaged_work_item",
                "priority": "medium",
                "title": "Pendiente sin gestionar",
                "subtitle": item.title,
                "work_item_id": item.id,
                "workshop_id": item.workshop_id,
                "due_at": item.due_at,
            },
            ("unmanaged_work_item", str(item.id)),
        )

    queue.sort(key=lambda row: (priority_rank(row["priority"]), row.get("date") or date.max, row.get("start_time") or "99:99"))
    return queue[:30]


def _build_snapshot_payload(db: Session) -> dict | None:
    row = weekly_snapshot_service.latest_weekly_snapshot(db)
    if not row:
        return None

    projection_rows: list[dict] = []
    if row.resource_projection_json:
        try:
            parsed = json.loads(row.resource_projection_json)
            projection_rows = list(parsed.get("rows") or [])
        except json.JSONDecodeError:
            projection_rows = []

    top_resources = [
        {
            "resource_term_id": resource.get("resource_term_id"),
            "resource_label": resource.get("resource_label") or "Recurso",
            "total_required": float(resource.get("total_required") or 0),
            "unit": resource.get("unit"),
            "critical_sessions_count": 0,
        }
        for resource in projection_rows[:6]
        if resource.get("resource_term_id")
    ]

    return {
        "week_start": row.week_start,
        "week_end": row.week_end,
        "generated_at": row.generated_at,
        "work_items_created_count": int(row.work_items_created_count or 0),
        "work_items_resolved_count": int(row.work_items_resolved_count or 0),
        "backlog_open_end_count": int(row.backlog_open_end_count or 0),
        "backlog_overdue_end_count": int(row.backlog_overdue_end_count or 0),
        "sessions_scheduled_week_count": int(row.sessions_scheduled_week_count or 0),
        "top_resources": top_resources,
    }


def build_tactical_operations_payload(db: Session, anchor_date: date | None = None) -> TacticalOperationsOut:
    target_date = anchor_date or datetime.now(TZ).date()
    tomorrow_date = target_date + timedelta(days=1)
    week_start, week_end = _week_bounds(target_date)

    week_sessions = _build_sessions_window(db, week_start, week_end)
    today_sessions = [row for row in week_sessions if row["date"] == target_date]
    tomorrow_sessions = [row for row in week_sessions if row["date"] == tomorrow_date]

    pending_items = (
        db.query(WorkItem)
        .filter(WorkItem.status.in_(list(OPEN_PENDING_STATUSES)))
        .order_by(WorkItem.due_at.is_(None), WorkItem.due_at.asc(), WorkItem.created_at.desc())
        .all()
    )
    pending_items = _attach_assigned_admin_names(db, pending_items)
    pending_board = _build_pending_board(pending_items, target_date, week_end)

    unanswered_items = pending_board["unanswered"]["items"]
    today_block = _build_day_block(
        target_date,
        today_sessions,
        pending_due_count=pending_board["today"]["count"],
        pending_unanswered_count=_count_unanswered_due_until(unanswered_items, target_date),
    )
    tomorrow_block = _build_day_block(
        tomorrow_date,
        tomorrow_sessions,
        pending_due_count=pending_board["tomorrow"]["count"],
        pending_unanswered_count=_count_unanswered_due_until(unanswered_items, tomorrow_date),
    )
    week_block = _build_week_block(week_start, week_end, week_sessions)

    attention_queue = _build_attention_queue(target_date, today_sessions, tomorrow_sessions, pending_board)
    snapshot_payload = _build_snapshot_payload(db)
    recently_resolved = (
        db.query(WorkItem)
        .filter(WorkItem.status.in_(["resolved", "closed"]))
        .order_by(WorkItem.updated_at.desc())
        .limit(12)
        .all()
    )
    recently_resolved = _attach_assigned_admin_names(db, recently_resolved)

    return TacticalOperationsOut.model_validate(
        {
            "anchor_date": target_date,
            "today": today_block,
            "tomorrow": tomorrow_block,
            "week": week_block,
            "attention_required": attention_queue,
            "pending": pending_board,
            "snapshot_weekly": snapshot_payload,
            "recently_resolved": recently_resolved,
        },
        from_attributes=True,
    )
