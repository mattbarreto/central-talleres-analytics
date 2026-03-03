from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
import json
import zoneinfo

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.weekly_executive_snapshot import WeeklyExecutiveSnapshot
from app.models.work_item import WorkItem
from app.models.workshop_session import WorkshopSession
from app.services import session_resource_service

TZ = zoneinfo.ZoneInfo("America/Argentina/Buenos_Aires")


def _week_bounds(week_start: date | None = None) -> tuple[date, date, datetime, datetime]:
    today = datetime.now(TZ).date()
    base_start = week_start or (today - timedelta(days=today.weekday()))
    base_end = base_start + timedelta(days=6)
    start_dt = datetime.combine(base_start, time.min, tzinfo=TZ).astimezone(UTC)
    end_dt = datetime.combine(base_end + timedelta(days=1), time.min, tzinfo=TZ).astimezone(UTC)
    return base_start, base_end, start_dt, end_dt


def _open_backlog_query(db: Session, end_dt: datetime):
    return db.query(WorkItem).filter(
        WorkItem.created_at < end_dt,
        or_(WorkItem.closed_at.is_(None), WorkItem.closed_at >= end_dt),
    )


def build_weekly_snapshot(db: Session, week_start: date | None = None) -> WeeklyExecutiveSnapshot:
    week_start_date, week_end_date, start_dt, end_dt = _week_bounds(week_start)

    created_count = db.query(WorkItem).filter(WorkItem.created_at >= start_dt, WorkItem.created_at < end_dt).count()
    managed_count = db.query(WorkItem).filter(WorkItem.first_managed_at >= start_dt, WorkItem.first_managed_at < end_dt).count()
    responded_count = db.query(WorkItem).filter(WorkItem.first_response_at >= start_dt, WorkItem.first_response_at < end_dt).count()
    resolved_count = db.query(WorkItem).filter(WorkItem.resolved_at >= start_dt, WorkItem.resolved_at < end_dt).count()
    closed_count = db.query(WorkItem).filter(WorkItem.closed_at >= start_dt, WorkItem.closed_at < end_dt).count()
    reopened_count = db.query(WorkItem).filter(WorkItem.reopened_at >= start_dt, WorkItem.reopened_at < end_dt).count()

    open_query = _open_backlog_query(db, end_dt)
    backlog_open_end_count = open_query.count()
    backlog_unmanaged_end_count = open_query.filter(or_(WorkItem.first_managed_at.is_(None), WorkItem.first_managed_at >= end_dt)).count()
    backlog_unanswered_end_count = open_query.filter(
        WorkItem.response_required.is_(True),
        WorkItem.status.in_(["triaged", "in_progress", "waiting_response"]),
        or_(WorkItem.first_response_at.is_(None), WorkItem.first_response_at >= end_dt),
    ).count()
    backlog_overdue_end_count = open_query.filter(WorkItem.due_at.is_not(None), WorkItem.due_at < end_dt).count()

    sessions_scheduled_week_count = (
        db.query(WorkshopSession)
        .filter(
            WorkshopSession.date >= week_start_date,
            WorkshopSession.date <= week_end_date,
            WorkshopSession.status != "cancelled",
        )
        .count()
    )

    kind_rows = (
        db.query(WorkItem.kind, func.count(WorkItem.id))
        .filter(WorkItem.created_at >= start_dt, WorkItem.created_at < end_dt)
        .group_by(WorkItem.kind)
        .all()
    )
    kind_breakdown = {kind: int(total or 0) for kind, total in kind_rows}

    status_rows = (
        open_query.with_entities(WorkItem.status, func.count(WorkItem.id))
        .group_by(WorkItem.status)
        .all()
    )
    status_breakdown_end = {status: int(total or 0) for status, total in status_rows}

    priority_rows = (
        open_query.with_entities(WorkItem.priority, func.count(WorkItem.id))
        .group_by(WorkItem.priority)
        .all()
    )
    priority_breakdown_open = {priority: int(total or 0) for priority, total in priority_rows}

    projection_rows = session_resource_service.projected_requirements(db, week_start_date, week_end_date, group_by="week")
    projection_compact = [
        {
            "resource_term_id": str(row.resource_term_id),
            "resource_label": row.resource_label,
            "total_required": row.total_required,
            "unit": row.unit,
        }
        for row in projection_rows
    ]

    now = datetime.now(UTC)
    snapshot = (
        db.query(WeeklyExecutiveSnapshot)
        .filter(
            WeeklyExecutiveSnapshot.scope_type == "institutional",
            WeeklyExecutiveSnapshot.week_start == week_start_date,
            WeeklyExecutiveSnapshot.workshop_id.is_(None),
        )
        .first()
    )

    if not snapshot:
        snapshot = WeeklyExecutiveSnapshot(
            scope_type="institutional",
            workshop_id=None,
            week_start=week_start_date,
            week_end=week_end_date,
            generated_at=now,
            is_final=True,
            methodology_version="v1",
        )
        db.add(snapshot)

    snapshot.week_end = week_end_date
    snapshot.generated_at = now
    snapshot.work_items_created_count = int(created_count or 0)
    snapshot.work_items_managed_count = int(managed_count or 0)
    snapshot.work_items_responded_count = int(responded_count or 0)
    snapshot.work_items_resolved_count = int(resolved_count or 0)
    snapshot.work_items_closed_count = int(closed_count or 0)
    snapshot.work_items_reopened_count = int(reopened_count or 0)
    snapshot.backlog_open_end_count = int(backlog_open_end_count or 0)
    snapshot.backlog_unmanaged_end_count = int(backlog_unmanaged_end_count or 0)
    snapshot.backlog_unanswered_end_count = int(backlog_unanswered_end_count or 0)
    snapshot.backlog_overdue_end_count = int(backlog_overdue_end_count or 0)
    snapshot.sessions_scheduled_week_count = int(sessions_scheduled_week_count or 0)
    snapshot.metrics_json = json.dumps(
        {
            "kind_breakdown": kind_breakdown,
            "status_breakdown_end": status_breakdown_end,
            "priority_breakdown_open": priority_breakdown_open,
        },
        ensure_ascii=False,
    )
    snapshot.resource_projection_json = json.dumps(
        {
            "week_start": week_start_date.isoformat(),
            "week_end": week_end_date.isoformat(),
            "rows": projection_compact,
        },
        ensure_ascii=False,
    )

    db.commit()
    db.refresh(snapshot)
    return snapshot


def list_weekly_snapshots(db: Session, from_week: date | None = None, to_week: date | None = None) -> list[WeeklyExecutiveSnapshot]:
    query = db.query(WeeklyExecutiveSnapshot).filter(
        WeeklyExecutiveSnapshot.scope_type == "institutional",
        WeeklyExecutiveSnapshot.workshop_id.is_(None),
    )
    if from_week:
        query = query.filter(WeeklyExecutiveSnapshot.week_start >= from_week)
    if to_week:
        query = query.filter(WeeklyExecutiveSnapshot.week_start <= to_week)
    return query.order_by(WeeklyExecutiveSnapshot.week_start.desc()).all()


def latest_weekly_snapshot(db: Session) -> WeeklyExecutiveSnapshot | None:
    return (
        db.query(WeeklyExecutiveSnapshot)
        .filter(
            WeeklyExecutiveSnapshot.scope_type == "institutional",
            WeeklyExecutiveSnapshot.workshop_id.is_(None),
        )
        .order_by(WeeklyExecutiveSnapshot.week_start.desc())
        .first()
    )
