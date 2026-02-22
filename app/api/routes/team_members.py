from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.crud.team_member import team_member as crud_team_member
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
)
from app.services.team_profiles_service import build_team_profiles, serialize_summary


router = APIRouter(prefix="/team-members", tags=["team-members"])


@router.get("/", response_model=list[TeamMemberOut])
def list_team_members(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return crud_team_member.get_multi(db, skip=skip, limit=limit)


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
    profiles, _ = build_team_profiles(db)
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
        out.append(serialize_summary(profile))
    out.sort(key=lambda p: (p["name"] or "").lower())
    return out


@router.get("/overview", response_model=TeamOverviewOut)
def team_overview(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    profiles, workshop_rankings = build_team_profiles(db)
    profile_rows = [serialize_summary(p) for p in profiles.values()]
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
def get_team_member_profile(member_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    profiles, _ = build_team_profiles(db)
    obj = crud_team_member.get(db, member_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Team member not found")
    profile = profiles.get(obj.id)
    if not profile:
        raise HTTPException(status_code=404, detail="Team profile not found")
    summary = serialize_summary(profile)
    summary["assignments"] = sorted(profile["assignments"], key=lambda a: (a["cohort_year"], a["workshop_name"]), reverse=True)
    return summary


@router.post("/{member_id}/assignments", response_model=TeamAssignmentOut)
def assign_workshop_to_member(
    member_id: UUID, payload: TeamAssignmentCreate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
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
def delete_assignment(assignment_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = db.query(WorkshopStaffAssignment).filter(WorkshopStaffAssignment.id == assignment_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(obj)
    db.commit()
    return {"deleted": True}


@router.get("/{member_id}", response_model=TeamMemberOut)
def get_team_member(member_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_team_member.get(db, member_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Team member not found")
    return obj


@router.put("/{member_id}", response_model=TeamMemberOut)
def update_team_member(
    member_id: UUID, payload: TeamMemberUpdate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    obj = crud_team_member.get(db, member_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Team member not found")
    return crud_team_member.update(db, obj, payload)


@router.delete("/{member_id}", response_model=TeamMemberOut)
def delete_team_member(member_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_team_member.remove(db, member_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Team member not found")
    return obj
