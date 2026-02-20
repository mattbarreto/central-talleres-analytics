import csv
import io
import time
from collections import defaultdict
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.models.communication import Communication
from app.models.communication_recipient import CommunicationRecipient
from app.models.enrollment import Enrollment
from app.models.participant import Participant
from app.models.team_member import TeamMember
from app.models.workshop import Workshop
from app.models.workshop_staff_assignment import WorkshopStaffAssignment
from app.schemas.insights import InsightsOverviewOut, ParticipantJourneyOut


router = APIRouter(prefix="/insights", tags=["insights"])

PERIOD = Literal["monthly", "quarterly", "semesterly", "yearly"]
CACHE_TTL_SECONDS = 60
_INSIGHTS_CACHE: dict[tuple, tuple[float, dict]] = {}
PERIOD_FILENAME = {
    "monthly": "mensual",
    "quarterly": "trimestral",
    "semesterly": "semestral",
    "yearly": "anual",
}


METRIC_DEFINITIONS = [
    {
        "metric_id": "workshops_total",
        "label": "Talleres",
        "description": "Cantidad de talleres en el filtro actual.",
        "formula": "Conteo total de talleres considerados.",
    },
    {
        "metric_id": "enrollments_total",
        "label": "Inscripciones",
        "description": "Total de inscripciones registradas.",
        "formula": "Conteo total de inscripciones.",
    },
    {
        "metric_id": "active_enrollments_total",
        "label": "Inscripciones activas",
        "description": "Inscripciones en estado activo.",
        "formula": "Conteo de inscripciones con estado Activo.",
    },
    {
        "metric_id": "finished_enrollments_total",
        "label": "Finalizados",
        "description": "Inscripciones con recorrido finalizado.",
        "formula": "Conteo de inscripciones con estado Finalizado.",
    },
    {
        "metric_id": "communications_total",
        "label": "Comunicaciones",
        "description": "Mensajes enviados o registrados en el período.",
        "formula": "Conteo total de comunicaciones.",
    },
    {
        "metric_id": "active_team_members",
        "label": "Equipo activo",
        "description": "Docentes/coordinadores con talleres asignados en período.",
        "formula": "Conteo de perfiles del equipo con al menos un taller.",
    },
]


def _to_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return value.date()


def _months_per_period(period: PERIOD) -> int:
    if period == "monthly":
        return 1
    if period == "quarterly":
        return 3
    if period == "semesterly":
        return 6
    return 12


def _period_key_and_label(value: date | None, period: PERIOD) -> tuple[str, str]:
    if value is None:
        return ("sin_fecha", "Sin fecha")
    if period == "monthly":
        return (f"{value.year:04d}-{value.month:02d}", f"{value.month:02d}/{value.year}")
    if period == "quarterly":
        quarter = ((value.month - 1) // 3) + 1
        return (f"{value.year:04d}-Q{quarter}", f"Q{quarter} {value.year}")
    if period == "semesterly":
        semester = 1 if value.month <= 6 else 2
        return (f"{value.year:04d}-S{semester}", f"S{semester} {value.year}")
    return (f"{value.year:04d}", str(value.year))


def _period_index(value: date, period: PERIOD) -> int:
    step = _months_per_period(period)
    serial_month = value.year * 12 + (value.month - 1)
    return serial_month // step


def _in_range(value: date | None, start: date | None, end: date | None) -> bool:
    if value is None:
        return start is None and end is None
    if start and value < start:
        return False
    if end and value > end:
        return False
    return True


def _calculate_age(birth_date: date | None) -> int | None:
    if not birth_date:
        return None
    today = datetime.utcnow().date()
    years = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1
    return max(years, 0)


def _age_bucket(age: int | None) -> str:
    if age is None:
        return "unknown"
    if age <= 17:
        return "0_17"
    if age <= 24:
        return "18_24"
    if age <= 34:
        return "25_34"
    if age <= 44:
        return "35_44"
    if age <= 54:
        return "45_54"
    if age <= 64:
        return "55_64"
    return "65_plus"


def _delta(current: int, previous: int) -> tuple[int, float, str]:
    diff = current - previous
    if previous == 0:
        pct = 100.0 if current > 0 else 0.0
    else:
        pct = (diff / previous) * 100
    trend = "flat"
    if diff > 0:
        trend = "up"
    elif diff < 0:
        trend = "down"
    return diff, round(pct, 2), trend


def _build_payload(
    db: Session,
    period: PERIOD,
    start_date: date | None,
    end_date: date | None,
    workshop_id: UUID | None,
):
    cache_key = (period, start_date, end_date, workshop_id)
    cached = _INSIGHTS_CACHE.get(cache_key)
    now_ts = time.time()
    if cached and now_ts - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    workshops = db.query(Workshop).all()
    participants = db.query(Participant).all()
    enrollments = db.query(Enrollment).all()
    communications = db.query(Communication).all()
    recipients = db.query(CommunicationRecipient).all()
    team_members = db.query(TeamMember).all()
    assignments = db.query(WorkshopStaffAssignment).all()

    workshops_map = {w.id: w for w in workshops}
    selected_workshops = {workshop_id} if workshop_id else set(workshops_map.keys())

    age_distribution = {"0_17": 0, "18_24": 0, "25_34": 0, "35_44": 0, "45_54": 0, "55_64": 0, "65_plus": 0, "unknown": 0}
    gender_distribution = {"female": 0, "male": 0, "non_binary": 0, "other": 0, "undisclosed": 0}
    for p in participants:
        age_distribution[_age_bucket(_calculate_age(p.birth_date))] += 1
        g = p.gender if p.gender in gender_distribution else "undisclosed"
        gender_distribution[g] += 1

    series: dict[str, dict] = {}

    def _ensure(k: str, label: str):
        if k not in series:
            series[k] = {
                "period_key": k,
                "period_label": label,
                "enrollments": 0,
                "active_enrollments": 0,
                "finished_enrollments": 0,
                "dropped_enrollments": 0,
                "communications": 0,
                "workshops_started": 0,
            }

    workshop_metrics: dict[UUID, dict] = {}
    for w in workshops:
        if w.id not in selected_workshops:
            continue
        workshop_metrics[w.id] = {
            "workshop_id": w.id,
            "workshop_name": w.name,
            "cohort_year": w.cohort_year,
            "workshop_status": w.status,
            "enrollments_total": 0,
            "attendees_estimated": 0,
            "finished_total": 0,
        }
        when = _to_date(w.start_date) or _to_date(w.created_at)
        if _in_range(when, start_date, end_date):
            key, label = _period_key_and_label(when, period)
            _ensure(key, label)
            series[key]["workshops_started"] += 1

    participant_metrics: dict[UUID, dict] = {
        p.id: {
            "participant_id": p.id,
            "name": p.name,
            "email": p.email,
            "workshops_total": 0,
            "active_workshops": 0,
            "finished_workshops": 0,
            "enrolled_workshops": 0,
            "dropped_workshops": 0,
        }
        for p in participants
    }
    enrollment_totals = {"total": 0, "active": 0, "finished": 0, "dropped": 0}
    active_participants = set()
    certifiable_participants = set()

    participant_first_index: dict[UUID, int] = {}
    participant_first_date: dict[UUID, date] = {}
    participant_active_indices: defaultdict[UUID, set[int]] = defaultdict(set)
    cohort_members: defaultdict[str, set[UUID]] = defaultdict(set)

    for e in enrollments:
        if e.workshop_id not in selected_workshops:
            continue
        when = _to_date(e.created_at)
        if when is None:
            continue
        idx = _period_index(when, period)
        if e.participant_id not in participant_first_index or idx < participant_first_index[e.participant_id]:
            participant_first_index[e.participant_id] = idx
            participant_first_date[e.participant_id] = when
        if e.status in {"active", "finished"}:
            participant_active_indices[e.participant_id].add(idx)

        if not _in_range(when, start_date, end_date):
            continue
        key, label = _period_key_and_label(when, period)
        _ensure(key, label)
        series[key]["enrollments"] += 1
        enrollment_totals["total"] += 1

        if e.status == "active":
            series[key]["active_enrollments"] += 1
            enrollment_totals["active"] += 1
            active_participants.add(e.participant_id)
        if e.status == "finished":
            series[key]["finished_enrollments"] += 1
            enrollment_totals["finished"] += 1
            certifiable_participants.add(e.participant_id)
        if e.status == "dropped":
            series[key]["dropped_enrollments"] += 1
            enrollment_totals["dropped"] += 1

        wm = workshop_metrics.get(e.workshop_id)
        if wm:
            wm["enrollments_total"] += 1
            if e.status in {"active", "finished"}:
                wm["attendees_estimated"] += 1
            if e.status == "finished":
                wm["finished_total"] += 1

        pm = participant_metrics.get(e.participant_id)
        if pm:
            pm["workshops_total"] += 1
            if e.status == "active":
                pm["active_workshops"] += 1
            elif e.status == "finished":
                pm["finished_workshops"] += 1
            elif e.status == "enrolled":
                pm["enrolled_workshops"] += 1
            elif e.status == "dropped":
                pm["dropped_workshops"] += 1

    for participant_id, idx in participant_first_index.items():
        first_date = participant_first_date.get(participant_id)
        if not first_date:
            continue
        if start_date or end_date:
            if not _in_range(first_date, start_date, end_date):
                continue
        cohort_key, _ = _period_key_and_label(first_date, period)
        cohort_members[cohort_key].add(participant_id)

    communications_total = 0
    for c in communications:
        if c.workshop_id not in selected_workshops:
            continue
        when = _to_date(c.sent_at) or _to_date(c.created_at)
        if not _in_range(when, start_date, end_date):
            continue
        key, label = _period_key_and_label(when, period)
        _ensure(key, label)
        series[key]["communications"] += 1
        communications_total += 1

    staff_metrics = {
        m.id: {
            "team_member_id": m.id,
            "name": m.name,
            "role": m.role,
            "workshops_count": 0,
            "active_workshops_count": 0,
            "participants_reached": 0,
            "attendees_reached": 0,
            "_seen": set(),
        }
        for m in team_members
    }
    for a in assignments:
        if a.workshop_id not in selected_workshops:
            continue
        when = _to_date(a.created_at)
        if not _in_range(when, start_date, end_date):
            continue
        s = staff_metrics.get(a.team_member_id)
        w = workshops_map.get(a.workshop_id)
        wm = workshop_metrics.get(a.workshop_id)
        if not s or not w or not wm or a.workshop_id in s["_seen"]:
            continue
        s["_seen"].add(a.workshop_id)
        s["workshops_count"] += 1
        if w.status == "active":
            s["active_workshops_count"] += 1
        s["participants_reached"] += wm["enrollments_total"]
        s["attendees_reached"] += wm["attendees_estimated"]

    top_workshops_by_enrollments = sorted(workshop_metrics.values(), key=lambda x: (x["enrollments_total"], x["attendees_estimated"]), reverse=True)[:8]
    top_workshops_by_attendees = sorted(workshop_metrics.values(), key=lambda x: (x["attendees_estimated"], x["finished_total"]), reverse=True)[:8]
    top_staff_by_activity = sorted(
        [v for v in staff_metrics.values() if v["workshops_count"] > 0],
        key=lambda x: (x["workshops_count"], x["attendees_reached"], x["participants_reached"]),
        reverse=True,
    )[:8]
    for row in top_staff_by_activity:
        del row["_seen"]
    active_team_members = sum(1 for v in staff_metrics.values() if v["workshops_count"] > 0)

    top_participants_by_activity = sorted(
        [v for v in participant_metrics.values() if v["workshops_total"] > 0],
        key=lambda x: (x["workshops_total"], x["active_workshops"], x["finished_workshops"]),
        reverse=True,
    )[:12]

    series_rows = sorted(series.values(), key=lambda r: r["period_key"] if r["period_key"] != "sin_fecha" else "0000")
    current = series_rows[-1] if series_rows else {}
    previous = series_rows[-2] if len(series_rows) > 1 else {}
    comparisons = []
    mapping = [
        ("enrollments", "Inscripciones"),
        ("active_enrollments", "Activos"),
        ("finished_enrollments", "Finalizados"),
        ("communications", "Comunicaciones"),
        ("workshops_started", "Talleres iniciados"),
    ]
    for key, label in mapping:
        cur = int(current.get(key, 0) or 0)
        prev = int(previous.get(key, 0) or 0)
        d, pct, trend = _delta(cur, prev)
        comparisons.append(
            {
                "metric_id": key,
                "label": label,
                "current": cur,
                "previous": prev,
                "delta": d,
                "delta_pct": pct,
                "trend": trend,
            }
        )

    enrolled_ids = {e.participant_id for e in enrollments if e.workshop_id in selected_workshops and _in_range(_to_date(e.created_at), start_date, end_date)}
    active_ids = {e.participant_id for e in enrollments if e.workshop_id in selected_workshops and e.status in {"active", "finished"} and _in_range(_to_date(e.created_at), start_date, end_date)}
    finished_ids = {e.participant_id for e in enrollments if e.workshop_id in selected_workshops and e.status == "finished" and _in_range(_to_date(e.created_at), start_date, end_date)}
    funnel = [
        {"key": "enrolled", "label": "Inscriptos", "total": len(enrolled_ids)},
        {"key": "active", "label": "Activos", "total": len(active_ids)},
        {"key": "finished", "label": "Finalizados", "total": len(finished_ids)},
        {"key": "certifiable", "label": "Certificables", "total": len(finished_ids)},
    ]

    retention_rows = []
    for cohort_key, members in sorted(cohort_members.items(), key=lambda x: x[0], reverse=True)[:8]:
        cohort_size = len(members)
        if cohort_size == 0:
            continue
        retained_next = 0
        retained_3 = 0
        for pid in members:
            first_idx = participant_first_index.get(pid)
            active_set = participant_active_indices.get(pid, set())
            if first_idx is None:
                continue
            if (first_idx + 1) in active_set:
                retained_next += 1
            if (first_idx + 3) in active_set:
                retained_3 += 1
        retention_rows.append(
            {
                "cohort_period": cohort_key,
                "cohort_size": cohort_size,
                "retained_next": retained_next,
                "retained_next_pct": round((retained_next / cohort_size) * 100, 2),
                "retained_3": retained_3,
                "retained_3_pct": round((retained_3 / cohort_size) * 100, 2),
            }
        )

    alerts = []
    drop_rate = 0.0
    if enrollment_totals["total"] > 0:
        drop_rate = (enrollment_totals["dropped"] / enrollment_totals["total"]) * 100
    if drop_rate >= 30:
        alerts.append(
            {
                "severity": "critical",
                "title": "Baja alta",
                "message": f"La tasa de baja está en {drop_rate:.1f}% en el período.",
            }
        )
    if communications_total == 0 and enrollment_totals["total"] > 0:
        alerts.append(
            {
                "severity": "warning",
                "title": "Sin comunicaciones",
                "message": "Hay inscripciones pero no se registraron comunicaciones.",
            }
        )
    if len(selected_workshops) > 0 and active_team_members < max(1, int(len(selected_workshops) * 0.4)):
        alerts.append(
            {
                "severity": "warning",
                "title": "Cobertura baja de equipo",
                "message": "La cobertura docente/coordinación puede ser insuficiente para la cantidad de talleres.",
            }
        )
    avg_retention = (
        sum(r["retained_next_pct"] for r in retention_rows) / len(retention_rows) if retention_rows else 0
    )
    if retention_rows and avg_retention < 40:
        alerts.append(
            {
                "severity": "info",
                "title": "Retención a reforzar",
                "message": f"Retención promedio al período siguiente: {avg_retention:.1f}%.",
            }
        )
    if not alerts:
        alerts.append(
            {
                "severity": "info",
                "title": "Sin alertas críticas",
                "message": "No se detectaron señales críticas en los filtros actuales.",
            }
        )

    payload = {
        "period": period,
        "from_date": start_date,
        "to_date": end_date,
        "kpis": {
            "workshops_total": len(selected_workshops),
            "participants_total": len(participants),
            "enrollments_total": enrollment_totals["total"],
            "active_enrollments_total": enrollment_totals["active"],
            "finished_enrollments_total": enrollment_totals["finished"],
            "dropped_enrollments_total": enrollment_totals["dropped"],
            "communications_total": communications_total,
            "team_members_total": len(team_members),
            "active_team_members": active_team_members,
            "active_participants_total": len(active_participants),
            "certifiable_participants_total": len(certifiable_participants),
        },
        "series": series_rows,
        "gender_distribution": gender_distribution,
        "age_distribution": age_distribution,
        "top_workshops_by_enrollments": top_workshops_by_enrollments,
        "top_workshops_by_attendees": top_workshops_by_attendees,
        "top_staff_by_activity": top_staff_by_activity,
        "top_participants_by_activity": top_participants_by_activity,
        "comparisons": comparisons,
        "funnel": funnel,
        "retention": retention_rows,
        "alerts": alerts,
        "metric_definitions": METRIC_DEFINITIONS,
    }
    _INSIGHTS_CACHE[cache_key] = (now_ts, payload)
    return payload


@router.get("/overview", response_model=InsightsOverviewOut)
def insights_overview(
    period: PERIOD = Query(default="monthly"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    workshop_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return _build_payload(db, period, start_date, end_date, workshop_id)


@router.get("/report.csv")
def insights_report_csv(
    period: PERIOD = Query(default="monthly"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    workshop_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    payload = _build_payload(db, period, start_date, end_date, workshop_id)
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
        writer.writerow(["indicador_clave", kpi_labels.get(key, key), value])
    for row in payload["series"]:
        writer.writerow(["serie", row["period_label"], f"inscripciones={row['enrollments']};comunicaciones={row['communications']}"])
    for row in payload["comparisons"]:
        writer.writerow(["comparacion", row["label"], f"actual={row['current']};anterior={row['previous']};variacion={row['delta_pct']}%"])
    for step in payload["funnel"]:
        writer.writerow(["embudo", step["label"], step["total"]])
    for alert in payload["alerts"]:
        writer.writerow(["alerta", alert["title"], alert["message"]])
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
    payload = _build_payload(db, period, start_date, end_date, workshop_id)
    return payload


@router.get("/participant-journey/{participant_id}", response_model=ParticipantJourneyOut)
def participant_journey(
    participant_id: UUID,
    workshop_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participante no encontrado")

    enrollments = db.query(Enrollment).filter(Enrollment.participant_id == participant_id).all()
    communications = db.query(CommunicationRecipient).filter(CommunicationRecipient.participant_id == participant_id).all()
    workshop_map = {w.id: w for w in db.query(Workshop).all()}
    communication_map = {c.id: c for c in db.query(Communication).all()}

    events = []
    totals = {"enrolled": 0, "active": 0, "finished": 0, "dropped": 0, "communications_sent": 0, "communications_failed": 0}
    first_seen = None
    last_seen = None

    for e in enrollments:
        if workshop_id and e.workshop_id != workshop_id:
            continue
        when = _to_date(e.created_at)
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

    for r in communications:
        c = communication_map.get(r.communication_id)
        if workshop_id and c and c.workshop_id != workshop_id:
            continue
        when = _to_date(r.created_at)
        if when and (first_seen is None or when < first_seen):
            first_seen = when
        if when and (last_seen is None or when > last_seen):
            last_seen = when
        if r.status == "sent":
            totals["communications_sent"] += 1
        if r.status == "failed":
            totals["communications_failed"] += 1
        wk = workshop_map.get(c.workshop_id) if c else None
        events.append(
            {
                "at": when,
                "type": "communication",
                "workshop_id": c.workshop_id if c else None,
                "workshop_name": wk.name if wk else None,
                "status": r.status,
                "detail": f"Comunicación {r.status}: {r.email_snapshot}",
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
