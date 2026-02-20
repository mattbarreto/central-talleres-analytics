from collections import defaultdict
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.crud.team_member import team_member as crud_team_member
from app.models.enrollment import Enrollment
from app.models.team_member import TeamMember
from app.models.workshop import Workshop
from app.models.workshop_staff_assignment import WorkshopStaffAssignment
from app.schemas.team_member import (
    TeamAssignmentCreate,
    TeamAssignmentOut,
    TeamMemberCreate,
    TeamMemberOut,
    TeamMemberProfileOut,
    TeamMemberSummaryOut,
    TeamMemberUpdate,
    TeamOverviewOut,
    TeamWorkshopRankingItemOut,
)


router = APIRouter(prefix="/team-members", tags=["team-members"])


def _month_key(d: date | None) -> str:
    if not d:
        return "sin_fecha"
    return f"{d.year:04d}-{d.month:02d}"


def _build_team_profiles(db: Session):
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
        entry = {
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
        profile["assignments"].append(entry)

    for profile in profiles.values():
        unique_workshops: dict[UUID, dict] = {}
        active_count = 0
        trend = defaultdict(int)
        last_workshop_date = None
        for a in profile["assignments"]:
            unique_workshops[a["workshop_id"]] = a
            if a["workshop_status"] == "active":
                active_count += 1
            d = a["start_date"] or a["end_date"]
            trend[_month_key(d)] += 1
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
            m = workshop_metrics[row.workshop_id]
            item = {
                "workshop_id": row.workshop_id,
                "workshop_name": row.workshop_name,
                "cohort_year": row.cohort_year,
                "workshop_status": row.workshop_status,
                "staff_count": 0,
                "total_enrollments": m["total_enrollments"],
                "attendees_estimated": m["attendees_estimated"],
                "staff_ids": set(),
            }
            workshop_rankings[row.workshop_id] = item
        item["staff_ids"].add(row.team_member_id)
    for item in workshop_rankings.values():
        item["staff_count"] = len(item["staff_ids"])
        del item["staff_ids"]

    return profiles, list(workshop_rankings.values())


def _serialize_summary(profile: dict):
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


@router.get("/", response_model=list[TeamMemberOut])
def list_team_members(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    return crud_team_member.get_multi(db, limit=20000)


@router.post("/", response_model=TeamMemberOut)
def create_team_member(payload: TeamMemberCreate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    try:
        return crud_team_member.create(db, payload)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="No se pudo crear el perfil de equipo")


@router.get("/profiles", response_model=list[TeamMemberSummaryOut])
def list_team_profiles(
    q: str | None = Query(default=None),
    role: Literal["all", "teacher", "coordinator"] = Query(default="all"),
    year: int | None = Query(default=None, ge=2000, le=2100),
    workshop_status: Literal["all", "planned", "active", "finished"] = Query(default="all"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    profiles, _ = _build_team_profiles(db)
    term = (q or "").strip().lower()
    out: list[dict] = []
    for profile in profiles.values():
        base = profile["base"]
        if role != "all" and base.role != role:
            continue
        if term:
            haystack = " ".join([base.name or "", base.email or "", base.phone or ""]).lower()
            if term not in haystack:
                continue
        if year is not None and not any(a["cohort_year"] == year for a in profile["assignments"]):
            continue
        if workshop_status != "all" and not any(a["workshop_status"] == workshop_status for a in profile["assignments"]):
            continue
        out.append(_serialize_summary(profile))
    out.sort(key=lambda p: (p["name"] or "").lower())
    return out


@router.get("/overview", response_model=TeamOverviewOut)
def team_overview(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    profiles, workshop_rankings = _build_team_profiles(db)
    profile_rows = [_serialize_summary(p) for p in profiles.values()]
    team_total = len(profile_rows)
    teachers_total = sum(1 for p in profile_rows if p["role"] == "teacher")
    coordinators_total = sum(1 for p in profile_rows if p["role"] == "coordinator")
    active_staff = sum(1 for p in profile_rows if p["active_workshops_count"] > 0 or p["workshops_count"] > 0)
    workshops_with_staff = len(workshop_rankings)
    top_active_staff = sorted(profile_rows, key=lambda p: (p["workshops_count"], p["attendees_reached"]), reverse=True)[:5]
    top_workshops_by_enrollments = sorted(workshop_rankings, key=lambda w: w["total_enrollments"], reverse=True)[:5]
    top_workshops_by_attendees = sorted(workshop_rankings, key=lambda w: w["attendees_estimated"], reverse=True)[:5]
    return {
        "team_total": team_total,
        "teachers_total": teachers_total,
        "coordinators_total": coordinators_total,
        "active_staff": active_staff,
        "workshops_with_staff": workshops_with_staff,
        "top_active_staff": top_active_staff,
        "top_workshops_by_enrollments": top_workshops_by_enrollments,
        "top_workshops_by_attendees": top_workshops_by_attendees,
    }


@router.get("/{member_id}/profile", response_model=TeamMemberProfileOut)
def get_team_member_profile(member_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    profiles, _ = _build_team_profiles(db)
    obj = crud_team_member.get(db, member_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Team member not found")
    profile = profiles.get(obj.id)
    if not profile:
        raise HTTPException(status_code=404, detail="Team profile not found")
    summary = _serialize_summary(profile)
    summary["assignments"] = sorted(profile["assignments"], key=lambda a: (a["cohort_year"], a["workshop_name"]), reverse=True)
    return summary


@router.post("/{member_id}/assignments", response_model=TeamAssignmentOut)
def assign_workshop_to_member(
    member_id: str, payload: TeamAssignmentCreate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    member = crud_team_member.get(db, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    workshop = db.query(Workshop).filter(Workshop.id == payload.workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    existing = (
        db.query(WorkshopStaffAssignment)
        .filter(
            WorkshopStaffAssignment.workshop_id == payload.workshop_id,
            WorkshopStaffAssignment.team_member_id == member.id,
        )
        .first()
    )
    if existing:
        existing.assignment_role = payload.assignment_role
        db.add(existing)
        db.commit()
        db.refresh(existing)
        assignment = existing
    else:
        assignment = WorkshopStaffAssignment(
            workshop_id=payload.workshop_id, team_member_id=member.id, assignment_role=payload.assignment_role
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)

    return {
        "id": assignment.id,
        "workshop_id": workshop.id,
        "workshop_name": workshop.name,
        "cohort_year": workshop.cohort_year,
        "workshop_status": workshop.status,
        "start_date": workshop.start_date,
        "end_date": workshop.end_date,
        "assignment_role": assignment.assignment_role,
        "created_at": assignment.created_at,
    }


@router.delete("/assignments/{assignment_id}")
def delete_assignment(assignment_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = db.query(WorkshopStaffAssignment).filter(WorkshopStaffAssignment.id == assignment_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(obj)
    db.commit()
    return {"deleted": True}


@router.get("/{member_id}", response_model=TeamMemberOut)
def get_team_member(member_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_team_member.get(db, member_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Team member not found")
    return obj


@router.put("/{member_id}", response_model=TeamMemberOut)
def update_team_member(
    member_id: str, payload: TeamMemberUpdate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    obj = crud_team_member.get(db, member_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Team member not found")
    return crud_team_member.update(db, obj, payload)


@router.delete("/{member_id}", response_model=TeamMemberOut)
def delete_team_member(member_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_team_member.remove(db, member_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Team member not found")
    return obj
