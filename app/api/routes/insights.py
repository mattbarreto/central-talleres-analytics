import csv
import io
import logging
from datetime import date
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.core.config import settings
from app.models.communication import Communication
from app.models.communication_recipient import CommunicationRecipient
from app.models.enrollment import Enrollment
from app.models.participant import Participant
from app.models.workshop import Workshop
from app.schemas.insights import InsightsOverviewOut, ParticipantJourneyOut
from app.db.session import SessionLocal
from app.services.insights_service import PERIOD, PERIOD_FILENAME, build_insights_payload, insights_period_label, to_date
from app.services.report_jobs import report_job_store
from app.services.reporting_service import build_insights_pdf_bytes


router = APIRouter(prefix="/insights", tags=["insights"])
logger = logging.getLogger("app.api.insights")


def _sanitize_csv_value(value):
    if isinstance(value, (int, float)):
        return value
    text = str(value or "")
    if text and text[0] in {"=", "+", "-", "@"}:
        return f"'{text}"
    return text


@router.get("/overview", response_model=InsightsOverviewOut)
def insights_overview(
    period: PERIOD = Query(default="monthly"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    workshop_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return build_insights_payload(db, period, start_date, end_date, workshop_id)


@router.get("/report.csv")
def insights_report_csv(
    period: PERIOD = Query(default="monthly"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    workshop_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    payload = build_insights_payload(db, period, start_date, end_date, workshop_id)
    kpi_labels = {
        "workshops_total": "Talleres",
        "participants_total": "Participantes",
        "enrollments_total": "Inscripciones",
        "active_enrollments_total": "Inscripciones activas",
        "finished_enrollments_total": "Finalizados",
        "dropped_enrollments_total": "Bajas",
        "communications_total": "Comunicaciones",
        "team_members_total": "Perfiles de equipo",
        "active_team_members": "Equipo activo",
        "active_participants_total": "Participantes activos",
        "certifiable_participants_total": "Participantes certificables",
    }
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["seccion", "metrica", "valor"])
    for key, value in payload["kpis"].items():
        writer.writerow(["indicador_clave", _sanitize_csv_value(kpi_labels.get(key, key)), _sanitize_csv_value(value)])
    for row in payload["series"]:
        writer.writerow(
            [
                "serie",
                _sanitize_csv_value(row["period_label"]),
                _sanitize_csv_value(f"inscripciones={row['enrollments']};comunicaciones={row['communications']}"),
            ]
        )
    for row in payload["comparisons"]:
        writer.writerow(
            [
                "comparacion",
                _sanitize_csv_value(row["label"]),
                _sanitize_csv_value(f"actual={row['current']};anterior={row['previous']};variacion={row['delta_pct']}%"),
            ]
        )
    for step in payload["funnel"]:
        writer.writerow(["embudo", _sanitize_csv_value(step["label"]), _sanitize_csv_value(step["total"])])
    for alert in payload["alerts"]:
        writer.writerow(["alerta", _sanitize_csv_value(alert["title"]), _sanitize_csv_value(alert["message"])])
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="analitica_{PERIOD_FILENAME.get(period, period)}.csv"'},
    )


@router.get("/report.json")
def insights_report_json(
    period: PERIOD = Query(default="monthly"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    workshop_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return build_insights_payload(db, period, start_date, end_date, workshop_id)


@router.get("/report.pdf")
def insights_report_pdf(
    period: PERIOD = Query(default="monthly"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    workshop_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    try:
        payload = build_insights_payload(db, period, start_date, end_date, workshop_id)
        pdf_bytes = build_insights_pdf_bytes(payload, period_label=insights_period_label(period))
    except RuntimeError as exc:
        logger.exception("insights_pdf_build_failed", extra={"period": period})
        raise HTTPException(status_code=500, detail="No se pudo generar el PDF de insights") from exc
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="analitica_{PERIOD_FILENAME.get(period, period)}.pdf"'},
    )


@router.post("/report-jobs/pdf")
def create_insights_report_pdf_job(
    background_tasks: BackgroundTasks,
    period: PERIOD = Query(default="monthly"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    workshop_id: UUID | None = Query(default=None),
    _: str = Depends(get_current_admin),
):
    filename = f"analitica_{PERIOD_FILENAME.get(period, period)}.pdf"
    try:
        job = report_job_store.create()
    except Exception as exc:
        logger.exception("insights_report_job_unavailable")
        raise HTTPException(status_code=503, detail="Sistema de reportes temporalmente no disponible") from exc
    def builder():
        db = SessionLocal()
        try:
            payload = build_insights_payload(db, period, start_date, end_date, workshop_id)
            pdf_bytes = build_insights_pdf_bytes(payload, period_label=insights_period_label(period))
            return pdf_bytes, filename, "application/pdf"
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


@router.get("/participant-journey/{participant_id}", response_model=ParticipantJourneyOut)
def participant_journey(
    participant_id: UUID,
    workshop_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    participant = (
        db.query(Participant.id, Participant.name, Participant.email)
        .filter(Participant.id == participant_id)
        .first()
    )
    if not participant:
        raise HTTPException(status_code=404, detail="Participante no encontrado")

    enrollments_q = db.query(
        Enrollment.workshop_id,
        Enrollment.status,
        Enrollment.created_at,
    ).filter(Enrollment.participant_id == participant_id)
    if workshop_id:
        enrollments_q = enrollments_q.filter(Enrollment.workshop_id == workshop_id)
    enrollments = enrollments_q.all()

    comm_q = (
        db.query(
            CommunicationRecipient.status,
            CommunicationRecipient.email_snapshot,
            CommunicationRecipient.created_at,
            Communication.workshop_id,
        )
        .join(Communication, Communication.id == CommunicationRecipient.communication_id)
        .filter(CommunicationRecipient.participant_id == participant_id)
    )
    if workshop_id:
        comm_q = comm_q.filter(Communication.workshop_id == workshop_id)
    comm_pairs = comm_q.all()

    workshop_ids = {e.workshop_id for e in enrollments}
    workshop_ids.update(workshop_ref for _, _, _, workshop_ref in comm_pairs if workshop_ref)
    workshop_map = {}
    if workshop_ids:
        workshop_rows = db.query(Workshop.id, Workshop.name).filter(Workshop.id.in_(workshop_ids)).all()
        workshop_map = {w.id: w for w in workshop_rows}

    events = []
    totals = {"enrolled": 0, "active": 0, "finished": 0, "dropped": 0, "communications_sent": 0, "communications_failed": 0}
    first_seen = None
    last_seen = None

    for e in enrollments:
        when = to_date(e.created_at)
        if when and (first_seen is None or when < first_seen):
            first_seen = when
        if when and (last_seen is None or when > last_seen):
            last_seen = when
        if e.status in totals:
            totals[e.status] += 1
        wk = workshop_map.get(e.workshop_id)
        events.append(
            {
                "at": when,
                "type": "enrollment",
                "workshop_id": e.workshop_id,
                "workshop_name": wk.name if wk else "Taller",
                "status": e.status,
                "detail": f"Estado de inscripción: {e.status}",
            }
        )

    for recipient_status, recipient_email_snapshot, recipient_created_at, comm_workshop_id in comm_pairs:
        when = to_date(recipient_created_at)
        if when and (first_seen is None or when < first_seen):
            first_seen = when
        if when and (last_seen is None or when > last_seen):
            last_seen = when
        if recipient_status == "sent":
            totals["communications_sent"] += 1
        if recipient_status == "failed":
            totals["communications_failed"] += 1
        wk = workshop_map.get(comm_workshop_id) if comm_workshop_id else None
        events.append(
            {
                "at": when,
                "type": "communication",
                "workshop_id": comm_workshop_id,
                "workshop_name": wk.name if wk else None,
                "status": recipient_status,
                "detail": f"Comunicación {recipient_status}: {recipient_email_snapshot}",
            }
        )

    events.sort(key=lambda x: (x["at"] or date(1900, 1, 1), x["type"]))
    return {
        "participant_id": participant.id,
        "participant_name": participant.name,
        "participant_email": participant.email,
        "first_seen": first_seen,
        "last_seen": last_seen,
        "totals": totals,
        "events": events,
    }
