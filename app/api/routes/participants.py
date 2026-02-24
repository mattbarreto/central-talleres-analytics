from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.crud.participant import participant as crud_participant
from app.schemas.participant import (
    ParticipantCreate,
    ParticipantImportCSVIn,
    ParticipantImportCSVOut,
    ParticipantOut,
    ParticipantOverviewOut,
    ParticipantProfileOut,
    ParticipantProfileSummaryOut,
    ParticipantUpdate,
    WorkshopParticipantsGroupOut,
)
from app.services.participants_service import (
    apply_profile_filters,
    build_overview,
    build_profiles,
    export_participants_csv_text,
    group_profiles_by_workshop,
    import_participants_csv,
    serialize_profile,
)


router = APIRouter(prefix="/participants", tags=["participants"])


@router.get("/", response_model=list[ParticipantOut])
def list_participants(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return crud_participant.get_multi(db, skip=skip, limit=limit)


@router.get("/overview", response_model=ParticipantOverviewOut)
def participants_overview(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    profiles = build_profiles(db)
    return build_overview(profiles)


@router.post("/", response_model=ParticipantOut)
def create_participant(payload: ParticipantCreate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    try:
        return crud_participant.create(db, payload)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email o DNI ya existe")


@router.get("/profiles", response_model=list[ParticipantProfileSummaryOut])
def list_participant_profiles(
    q: str | None = Query(default=None, description="Busca por nombre, apellido, email, DNI o telefono"),
    workshop_id: UUID | None = Query(default=None),
    enrollment_status: Literal["all", "enrolled", "active", "dropped", "finished"] = Query(default="all"),
    active_days: int | None = Query(default=None, ge=1, le=365, description="Filtro de ventana temporal para enrollments"),
    engagement: Literal["high", "medium", "low"] | None = Query(default=None),
    gender: Literal["female", "male", "non_binary", "other", "undisclosed"] | None = Query(default=None),
    age_min: int | None = Query(default=None, ge=0, le=120),
    age_max: int | None = Query(default=None, ge=0, le=120),
    population: Literal["all", "current", "graduated", "inactive", "no_history"] = Query(default="all"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    if age_min is not None and age_max is not None and age_min > age_max:
        raise HTTPException(status_code=422, detail="age_min no puede ser mayor que age_max")
    profiles = build_profiles(db)
    filtered = apply_profile_filters(
        profiles, q, workshop_id, enrollment_status, engagement, gender, age_min, age_max, population, active_days
    )
    return [serialize_profile(p, include_workshops=False) for p in filtered]


@router.get("/profiles/{participant_id}", response_model=ParticipantProfileOut)
def get_participant_profile(participant_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    profiles = build_profiles(db)
    obj = crud_participant.get(db, participant_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Participant not found")
    profile = profiles.get(obj.id)
    if not profile:
        raise HTTPException(status_code=404, detail="Participant profile not found")
    return serialize_profile(profile, include_workshops=True)


@router.get("/grouped-by-workshop", response_model=list[WorkshopParticipantsGroupOut])
def participants_grouped_by_workshop(
    q: str | None = Query(default=None),
    workshop_id: UUID | None = Query(default=None),
    enrollment_status: Literal["all", "enrolled", "active", "dropped", "finished"] = Query(default="all"),
    active_days: int | None = Query(default=None, ge=1, le=365, description="Filtro de ventana temporal para enrollments"),
    engagement: Literal["high", "medium", "low"] | None = Query(default=None),
    gender: Literal["female", "male", "non_binary", "other", "undisclosed"] | None = Query(default=None),
    age_min: int | None = Query(default=None, ge=0, le=120),
    age_max: int | None = Query(default=None, ge=0, le=120),
    population: Literal["all", "current", "graduated", "inactive", "no_history"] = Query(default="all"),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    if age_min is not None and age_max is not None and age_min > age_max:
        raise HTTPException(status_code=422, detail="age_min no puede ser mayor que age_max")
    profiles = build_profiles(db)
    filtered = apply_profile_filters(
        profiles, q, workshop_id, enrollment_status, engagement, gender, age_min, age_max, population, active_days
    )
    return group_profiles_by_workshop(filtered, workshop_id=workshop_id, enrollment_status=enrollment_status)


@router.get("/export.csv")
def export_participants_csv(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    csv_text = export_participants_csv_text(db)
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="participants_export.csv"'},
    )


@router.post("/import.csv", response_model=ParticipantImportCSVOut)
def import_participants_csv_endpoint(
    payload: ParticipantImportCSVIn, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    result = import_participants_csv(payload.csv_content or "", db)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/{participant_id}", response_model=ParticipantOut)
def get_participant(participant_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_participant.get(db, participant_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Participant not found")
    return obj


@router.put("/{participant_id}", response_model=ParticipantOut)
def update_participant(
    participant_id: UUID, payload: ParticipantUpdate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    obj = crud_participant.get(db, participant_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Participant not found")
    try:
        return crud_participant.update(db, obj, payload)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email o DNI ya existe")


@router.delete("/{participant_id}", response_model=ParticipantOut)
def delete_participant(participant_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_participant.remove(db, participant_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Participant not found")
    return obj
