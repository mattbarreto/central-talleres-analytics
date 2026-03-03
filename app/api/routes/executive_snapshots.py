from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.schemas.executive_snapshot import WeeklyExecutiveSnapshotBuildIn, WeeklyExecutiveSnapshotOut
from app.services import weekly_snapshot_service

router = APIRouter(prefix="/executive-snapshots", tags=["executive-snapshots"])


def _to_out(row) -> WeeklyExecutiveSnapshotOut:
    metrics = None
    projection = None
    if row.metrics_json:
        try:
            metrics = json.loads(row.metrics_json)
        except json.JSONDecodeError:
            metrics = None
    if row.resource_projection_json:
        try:
            projection = json.loads(row.resource_projection_json)
        except json.JSONDecodeError:
            projection = None
    return WeeklyExecutiveSnapshotOut(
        id=row.id,
        scope_type=row.scope_type,
        workshop_id=row.workshop_id,
        week_start=row.week_start,
        week_end=row.week_end,
        generated_at=row.generated_at,
        is_final=row.is_final,
        methodology_version=row.methodology_version,
        work_items_created_count=row.work_items_created_count,
        work_items_managed_count=row.work_items_managed_count,
        work_items_responded_count=row.work_items_responded_count,
        work_items_resolved_count=row.work_items_resolved_count,
        work_items_closed_count=row.work_items_closed_count,
        work_items_reopened_count=row.work_items_reopened_count,
        backlog_open_end_count=row.backlog_open_end_count,
        backlog_unmanaged_end_count=row.backlog_unmanaged_end_count,
        backlog_unanswered_end_count=row.backlog_unanswered_end_count,
        backlog_overdue_end_count=row.backlog_overdue_end_count,
        sessions_scheduled_week_count=row.sessions_scheduled_week_count,
        metrics=metrics,
        resource_projection=projection,
    )


@router.get("/weekly/latest", response_model=WeeklyExecutiveSnapshotOut)
def latest_weekly_snapshot(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    row = weekly_snapshot_service.latest_weekly_snapshot(db)
    if not row:
        raise HTTPException(status_code=404, detail="No hay snapshots semanales")
    return _to_out(row)


@router.get("/weekly", response_model=list[WeeklyExecutiveSnapshotOut])
def list_weekly_snapshots(
    from_week: date | None = Query(default=None),
    to_week: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    rows = weekly_snapshot_service.list_weekly_snapshots(db, from_week=from_week, to_week=to_week)
    return [_to_out(row) for row in rows]


@router.post("/weekly/rebuild", response_model=WeeklyExecutiveSnapshotOut)
def rebuild_weekly_snapshot(
    payload: WeeklyExecutiveSnapshotBuildIn,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    row = weekly_snapshot_service.build_weekly_snapshot(db, week_start=payload.week_start)
    return _to_out(row)
