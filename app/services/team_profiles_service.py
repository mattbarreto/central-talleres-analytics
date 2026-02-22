from __future__ import annotations

from collections import defaultdict
from datetime import date
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.enrollment import Enrollment
from app.models.team_member import TeamMember
from app.models.workshop import Workshop
from app.models.workshop_staff_assignment import WorkshopStaffAssignment


def month_key(d: date | None) -> str:
    if not d:
        return "sin_fecha"
    return f"{d.year:04d}-{d.month:02d}"


def build_team_profiles(db: Session):
    members = db.query(TeamMember).all()
    workshop_rows = (
        db.query(
            WorkshopStaffAssignment.id,
            WorkshopStaffAssignment.team_member_id,
            WorkshopStaffAssignment.assignment_role,
            WorkshopStaffAssignment.created_at,
            Workshop.id.label("workshop_id"),
            Workshop.name.label("workshop_name"),
            Workshop.cohort_year,
            Workshop.status.label("workshop_status"),
            Workshop.start_date,
            Workshop.end_date,
        )
        .join(Workshop, WorkshopStaffAssignment.workshop_id == Workshop.id)
        .all()
    )
    enrollment_rows = db.query(Enrollment.workshop_id, Enrollment.status).all()

    workshop_metrics: dict[UUID, dict] = defaultdict(lambda: {"total_enrollments": 0, "attendees_estimated": 0})
    for workshop_id, status in enrollment_rows:
        workshop_metrics[workshop_id]["total_enrollments"] += 1
        if status in {"active", "finished"}:
            workshop_metrics[workshop_id]["attendees_estimated"] += 1

    profiles: dict[UUID, dict] = {}
    for member in members:
        profiles[member.id] = {
            "base": member,
            "assignments": [],
            "workshops_count": 0,
            "active_workshops_count": 0,
            "participants_reached": 0,
            "attendees_reached": 0,
            "last_workshop_date": None,
            "trend_by_month": defaultdict(int),
        }

    for row in workshop_rows:
        profile = profiles.get(row.team_member_id)
        if not profile:
            continue
        metrics = workshop_metrics[row.workshop_id]
        profile["assignments"].append(
            {
                "id": row.id,
                "workshop_id": row.workshop_id,
                "workshop_name": row.workshop_name,
                "cohort_year": row.cohort_year,
                "workshop_status": row.workshop_status,
                "start_date": row.start_date,
                "end_date": row.end_date,
                "assignment_role": row.assignment_role,
                "created_at": row.created_at,
                "total_enrollments": metrics["total_enrollments"],
                "attendees_estimated": metrics["attendees_estimated"],
            }
        )

    for profile in profiles.values():
        unique_workshops: dict[UUID, dict] = {}
        active_count = 0
        trend = defaultdict(int)
        last_workshop_date = None
        for assignment in profile["assignments"]:
            unique_workshops[assignment["workshop_id"]] = assignment
            if assignment["workshop_status"] == "active":
                active_count += 1
            d = assignment["start_date"] or assignment["end_date"]
            trend[month_key(d)] += 1
            if d and (not last_workshop_date or d > last_workshop_date):
                last_workshop_date = d
        profile["workshops_count"] = len(unique_workshops)
        profile["active_workshops_count"] = active_count
        profile["participants_reached"] = sum(w["total_enrollments"] for w in unique_workshops.values())
        profile["attendees_reached"] = sum(w["attendees_estimated"] for w in unique_workshops.values())
        profile["last_workshop_date"] = last_workshop_date
        profile["trend_by_month"] = dict(sorted(trend.items()))

    workshop_rankings: dict[UUID, dict] = {}
    for row in workshop_rows:
        item = workshop_rankings.get(row.workshop_id)
        if not item:
            metrics = workshop_metrics[row.workshop_id]
            item = {
                "workshop_id": row.workshop_id,
                "workshop_name": row.workshop_name,
                "cohort_year": row.cohort_year,
                "workshop_status": row.workshop_status,
                "staff_count": 0,
                "total_enrollments": metrics["total_enrollments"],
                "attendees_estimated": metrics["attendees_estimated"],
                "staff_ids": set(),
            }
            workshop_rankings[row.workshop_id] = item
        item["staff_ids"].add(row.team_member_id)
    for item in workshop_rankings.values():
        item["staff_count"] = len(item["staff_ids"])
        del item["staff_ids"]

    return profiles, list(workshop_rankings.values())


def serialize_summary(profile: dict):
    base = profile["base"]
    return {
        "id": base.id,
        "name": base.name,
        "email": base.email,
        "phone": base.phone,
        "role": base.role,
        "created_at": base.created_at,
        "updated_at": base.updated_at,
        "workshops_count": profile["workshops_count"],
        "active_workshops_count": profile["active_workshops_count"],
        "participants_reached": profile["participants_reached"],
        "attendees_reached": profile["attendees_reached"],
        "last_workshop_date": profile["last_workshop_date"],
        "trend_by_month": profile["trend_by_month"],
    }
