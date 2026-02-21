from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.communication import Communication
from app.models.enrollment import Enrollment
from app.models.workshop import Workshop
from app.schemas.metrics import CommunicationsCount, ParticipantsByWorkshop, WorkshopsByYear
from app.services.report_jobs import report_job_store
from app.services.reporting_service import build_dashboard_pdf_bytes


router = APIRouter(prefix="/metrics", tags=["metrics"])


def _range_start(range_key: str | None):
    key = (range_key or "30d").strip().lower()
    days = 7 if key == "7d" else 30 if key == "30d" else 90 if key == "90d" else 0
    if not days:
        return None
    return datetime.now(UTC) - timedelta(days=days)


def _dashboard_dataset(db: Session, range_key: str, year: str | None, status: str | None, workshop_id: str | None):
    q = db.query(
        Workshop.id,
        Workshop.name,
        Workshop.cohort_year,
        Workshop.status,
        Workshop.created_at,
    )
    if year:
        try:
            q = q.filter(Workshop.cohort_year == int(year))
        except ValueError:
            pass
    if status:
        q = q.filter(Workshop.status == status)
    if workshop_id:
        q = q.filter(Workshop.id == workshop_id)
    rs = _range_start(range_key)
    if rs is not None:
        q = q.filter(Workshop.created_at >= rs)

    workshops = q.order_by(Workshop.created_at.desc()).all()
    workshop_ids = [w.id for w in workshops]

    enrollments_q = db.query(
        Enrollment.participant_id,
        Enrollment.status,
        Enrollment.workshop_id,
        Enrollment.created_at,
    )
    communications_q = db.query(Communication.created_at)
    if workshop_ids:
        enrollments_q = enrollments_q.filter(Enrollment.workshop_id.in_(workshop_ids))
        communications_q = communications_q.filter(Communication.workshop_id.in_(workshop_ids))
    else:
        enrollments_q = enrollments_q.filter(False)
        communications_q = communications_q.filter(False)
    if rs is not None:
        enrollments_q = enrollments_q.filter(Enrollment.created_at >= rs)
        communications_q = communications_q.filter(Communication.created_at >= rs)

    return workshops, enrollments_q.all(), communications_q.all()


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


@router.get("/dashboard-report.pdf")
def dashboard_report_pdf(
    range: str = Query(default="30d"),
    year: str | None = Query(default=None),
    status: str | None = Query(default=None),
    workshop_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    workshops, enrollments, communications = _dashboard_dataset(db, range, year, status, workshop_id)
    try:
        pdf_bytes = build_dashboard_pdf_bytes(workshops, enrollments, communications, range, year, status)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="panel_dashboard.pdf"'},
    )


@router.post("/dashboard-report-jobs/pdf")
def create_dashboard_report_pdf_job(
    background_tasks: BackgroundTasks,
    range: str = Query(default="30d"),
    year: str | None = Query(default=None),
    status: str | None = Query(default=None),
    workshop_id: str | None = Query(default=None),
    _: str = Depends(get_current_admin),
):
    try:
        job = report_job_store.create()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Sistema de reportes no disponible: {exc}") from exc
    def builder():
        db = SessionLocal()
        try:
            workshops, enrollments, communications = _dashboard_dataset(db, range, year, status, workshop_id)
            pdf_bytes = build_dashboard_pdf_bytes(workshops, enrollments, communications, range, year, status)
            return pdf_bytes, "panel_dashboard.pdf", "application/pdf"
        finally:
            db.close()

    background_tasks.add_task(
        report_job_store.run,
        job.id,
        builder,
    )
    return {
        "job_id": job.id,
        "status": job.status,
        "status_url": f"{settings.api_v1_prefix}/report-jobs/{job.id}",
        "download_url": f"{settings.api_v1_prefix}/report-jobs/{job.id}/download",
    }
