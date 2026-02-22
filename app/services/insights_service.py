from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.communication import Communication
from app.models.enrollment import Enrollment
from app.models.participant import Participant
from app.models.team_member import TeamMember
from app.models.workshop import Workshop
from app.models.workshop_staff_assignment import WorkshopStaffAssignment
from app.services.insights_cache_store import get_cached_payload, set_cached_payload


PERIOD = Literal["monthly", "quarterly", "semesterly", "yearly"]
CACHE_TTL_SECONDS = 60
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


def to_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return value.date()


def months_per_period(period: PERIOD) -> int:
    if period == "monthly":
        return 1
    if period == "quarterly":
        return 3
    if period == "semesterly":
        return 6
    return 12


def period_key_and_label(value: date | None, period: PERIOD) -> tuple[str, str]:
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


def period_index(value: date, period: PERIOD) -> int:
    step = months_per_period(period)
    serial_month = value.year * 12 + (value.month - 1)
    return serial_month // step


def in_range(value: date | None, start: date | None, end: date | None) -> bool:
    if value is None:
        return start is None and end is None
    if start and value < start:
        return False
    if end and value > end:
        return False
    return True


def calculate_age(birth_date: date | None) -> int | None:
    if not birth_date:
        return None
    today = datetime.now(UTC).date()
    years = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1
    return max(years, 0)


def age_bucket(age: int | None) -> str:
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


def delta(current: int, previous: int) -> tuple[int, float, str]:
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


def insights_period_label(period: PERIOD) -> str:
    labels = {
        "monthly": "Mensual",
        "quarterly": "Trimestral",
        "semesterly": "Semestral",
        "yearly": "Anual",
    }
    return labels.get(period, str(period))


def build_insights_payload(
    db: Session,
    period: PERIOD,
    start_date: date | None,
    end_date: date | None,
    workshop_id: UUID | None,
):
    bind_url = str(getattr(getattr(db, "bind", None), "url", "") or "")
    cache_enabled = ":memory:" not in bind_url
    if cache_enabled:
        cached = get_cached_payload(
            period=period,
            start_date=start_date,
            end_date=end_date,
            workshop_id=workshop_id,
            ttl_seconds=CACHE_TTL_SECONDS,
        )
        if cached:
            return cached

    workshops_q = db.query(
        Workshop.id,
        Workshop.name,
        Workshop.cohort_year,
        Workshop.status,
        Workshop.start_date,
        Workshop.created_at,
    )
    if workshop_id:
        workshops_q = workshops_q.filter(Workshop.id == workshop_id)
    workshops = workshops_q.all()
    workshops_map = {w.id: w for w in workshops}
    selected_workshops = set(workshops_map.keys())

    if selected_workshops:
        enrollments_q = db.query(
            Enrollment.workshop_id,
            Enrollment.participant_id,
            Enrollment.status,
            Enrollment.created_at,
        ).filter(Enrollment.workshop_id.in_(selected_workshops))
        if end_date:
            enrollments_q = enrollments_q.filter(Enrollment.created_at <= end_date)
        enrollments = enrollments_q.all()

        communications_q = db.query(
            Communication.workshop_id,
            Communication.created_at,
            Communication.sent_at,
        ).filter(Communication.workshop_id.in_(selected_workshops))
        if start_date:
            communications_q = communications_q.filter(
                or_(Communication.sent_at.is_(None), Communication.sent_at >= start_date)
            )
        if end_date:
            communications_q = communications_q.filter(
                or_(Communication.sent_at.is_(None), Communication.sent_at <= end_date)
            )
        communications = communications_q.all()

        assignments = db.query(
            WorkshopStaffAssignment.team_member_id,
            WorkshopStaffAssignment.workshop_id,
            WorkshopStaffAssignment.created_at,
        ).filter(WorkshopStaffAssignment.workshop_id.in_(selected_workshops)).all()
    else:
        enrollments = []
        communications = []
        assignments = []

    participant_ids_in_scope = {e.participant_id for e in enrollments}
    participants_scope = (
        db.query(
            Participant.id,
            Participant.name,
            Participant.email,
            Participant.birth_date,
            Participant.gender,
        )
        .filter(Participant.id.in_(participant_ids_in_scope))
        .all()
        if participant_ids_in_scope
        else []
    )
    participants_map = {p.id: p for p in participants_scope}

    participants_total_count = (
        len(participants_scope)
        if workshop_id
        else int(db.query(func.count(Participant.id)).scalar() or 0)
    )

    team_member_ids = {a.team_member_id for a in assignments}
    team_members = (
        db.query(TeamMember.id, TeamMember.name, TeamMember.role)
        .filter(TeamMember.id.in_(team_member_ids))
        .all()
        if team_member_ids
        else []
    )
    team_members_total_count = (
        len(team_members)
        if workshop_id
        else int(db.query(func.count(TeamMember.id)).scalar() or 0)
    )

    age_distribution = {"0_17": 0, "18_24": 0, "25_34": 0, "35_44": 0, "45_54": 0, "55_64": 0, "65_plus": 0, "unknown": 0}
    gender_distribution = {"female": 0, "male": 0, "non_binary": 0, "other": 0, "undisclosed": 0}
    if workshop_id:
        for p in participants_scope:
            age_distribution[age_bucket(calculate_age(p.birth_date))] += 1
            g = p.gender if p.gender in gender_distribution else "undisclosed"
            gender_distribution[g] += 1
    else:
        for (birth_date,) in db.query(Participant.birth_date).all():
            age_distribution[age_bucket(calculate_age(birth_date))] += 1
        for g, total in db.query(Participant.gender, func.count(Participant.id)).group_by(Participant.gender).all():
            key = g if g in gender_distribution else "undisclosed"
            gender_distribution[key] += int(total or 0)

    series: dict[str, dict] = {}

    def ensure(k: str, label: str):
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
        workshop_metrics[w.id] = {
            "workshop_id": w.id,
            "workshop_name": w.name,
            "cohort_year": w.cohort_year,
            "workshop_status": w.status,
            "enrollments_total": 0,
            "attendees_estimated": 0,
            "finished_total": 0,
        }
        when = to_date(w.start_date) or to_date(w.created_at)
        if in_range(when, start_date, end_date):
            key, label = period_key_and_label(when, period)
            ensure(key, label)
            series[key]["workshops_started"] += 1

    participant_metrics: dict[UUID, dict] = {}
    for pid in participant_ids_in_scope:
        p = participants_map.get(pid)
        if not p:
            continue
        participant_metrics[pid] = {
            "participant_id": p.id,
            "name": p.name,
            "email": p.email,
            "workshops_total": 0,
            "active_workshops": 0,
            "finished_workshops": 0,
            "enrolled_workshops": 0,
            "dropped_workshops": 0,
        }
    enrollment_totals = {"total": 0, "active": 0, "finished": 0, "dropped": 0}
    active_participants = set()
    certifiable_participants = set()

    participant_first_index: dict[UUID, int] = {}
    participant_first_date: dict[UUID, date] = {}
    participant_active_indices: defaultdict[UUID, set[int]] = defaultdict(set)
    cohort_members: defaultdict[str, set[UUID]] = defaultdict(set)

    for e in enrollments:
        when = to_date(e.created_at)
        if when is None:
            continue
        idx = period_index(when, period)
        if e.participant_id not in participant_first_index or idx < participant_first_index[e.participant_id]:
            participant_first_index[e.participant_id] = idx
            participant_first_date[e.participant_id] = when
        if e.status in {"active", "finished"}:
            participant_active_indices[e.participant_id].add(idx)

        if not in_range(when, start_date, end_date):
            continue
        key, label = period_key_and_label(when, period)
        ensure(key, label)
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
        if (start_date or end_date) and not in_range(first_date, start_date, end_date):
            continue
        cohort_key, _ = period_key_and_label(first_date, period)
        cohort_members[cohort_key].add(participant_id)

    communications_total = 0
    for c in communications:
        when = to_date(c.sent_at) or to_date(c.created_at)
        if not in_range(when, start_date, end_date):
            continue
        key, label = period_key_and_label(when, period)
        ensure(key, label)
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
    team_members_by_period: defaultdict[str, set[UUID]] = defaultdict(set)
    for a in assignments:
        when = to_date(a.created_at)
        if not in_range(when, start_date, end_date):
            continue
        period_k, period_label = period_key_and_label(when, period)
        ensure(period_k, period_label)
        team_members_by_period[period_k].add(a.team_member_id)
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

    top_workshops_by_enrollments = sorted(workshop_metrics.values(), key=lambda x: (x["enrollments_total"], x["attendees_estimated"]), reverse=True)[:200]
    top_workshops_by_attendees = sorted(workshop_metrics.values(), key=lambda x: (x["attendees_estimated"], x["finished_total"]), reverse=True)[:200]
    top_staff_by_activity = sorted(
        [v for v in staff_metrics.values() if v["workshops_count"] > 0],
        key=lambda x: (x["workshops_count"], x["attendees_reached"], x["participants_reached"]),
        reverse=True,
    )[:100]
    for row in top_staff_by_activity:
        row.pop("_seen", None)
    active_team_members = sum(1 for v in staff_metrics.values() if v["workshops_count"] > 0)

    top_participants_by_activity = sorted(
        [v for v in participant_metrics.values() if v["workshops_total"] > 0],
        key=lambda x: (x["workshops_total"], x["active_workshops"], x["finished_workshops"]),
        reverse=True,
    )[:200]

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
        d, pct, trend = delta(cur, prev)
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
    current_period_key = str(current.get("period_key", "") or "")
    previous_period_key = str(previous.get("period_key", "") or "")
    current_active_team = len(team_members_by_period.get(current_period_key, set()))
    previous_active_team = len(team_members_by_period.get(previous_period_key, set()))
    d, pct, trend = delta(current_active_team, previous_active_team)
    comparisons.append(
        {
            "metric_id": "active_team_members",
            "label": "Equipo activo",
            "current": current_active_team,
            "previous": previous_active_team,
            "delta": d,
            "delta_pct": pct,
            "trend": trend,
        }
    )

    enrolled_ids = {e.participant_id for e in enrollments if in_range(to_date(e.created_at), start_date, end_date)}
    active_ids = {e.participant_id for e in enrollments if e.status in {"active", "finished"} and in_range(to_date(e.created_at), start_date, end_date)}
    finished_ids = {e.participant_id for e in enrollments if e.status == "finished" and in_range(to_date(e.created_at), start_date, end_date)}
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
    avg_retention = (sum(r["retained_next_pct"] for r in retention_rows) / len(retention_rows) if retention_rows else 0)
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
            "participants_total": participants_total_count,
            "enrollments_total": enrollment_totals["total"],
            "active_enrollments_total": enrollment_totals["active"],
            "finished_enrollments_total": enrollment_totals["finished"],
            "dropped_enrollments_total": enrollment_totals["dropped"],
            "communications_total": communications_total,
            "team_members_total": team_members_total_count,
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
    if cache_enabled:
        set_cached_payload(
            period=period,
            start_date=start_date,
            end_date=end_date,
            workshop_id=workshop_id,
            payload=payload,
            ttl_seconds=CACHE_TTL_SECONDS,
        )
    return payload
