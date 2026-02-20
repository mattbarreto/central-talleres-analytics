import csv
import io
import re
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.crud.participant import participant as crud_participant
from app.models.communication_recipient import CommunicationRecipient
from app.models.enrollment import Enrollment
from app.models.workshop import Workshop
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


router = APIRouter(prefix="/participants", tags=["participants"])

KNOWN_GENDERS = {"female", "male", "non_binary", "other", "undisclosed"}
CSV_HEADERS = ["name", "dni", "email", "phone", "birth_date", "gender"]
CSV_HEADER_ALIASES = {
    "name": "name",
    "nombre": "name",
    "apellido_y_nombre": "name",
    "fullname": "name",
    "dni": "dni",
    "documento": "dni",
    "email": "email",
    "correo": "email",
    "mail": "email",
    "telefono": "phone",
    "tel": "phone",
    "phone": "phone",
    "fecha_nacimiento": "birth_date",
    "birth_date": "birth_date",
    "nacimiento": "birth_date",
    "genero": "gender",
    "sexo": "gender",
    "gender": "gender",
}


def _calculate_age(birth_date: date | None) -> int | None:
    if not birth_date:
        return None
    today = datetime.utcnow().date()
    years = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1
    return max(years, 0)


def _population_segment(profile: dict) -> Literal["current", "graduated", "inactive", "no_history"]:
    if profile["active_workshops"] > 0:
        return "current"
    if profile["finished_workshops"] > 0:
        return "graduated"
    if profile["workshops_total"] > 0:
        return "inactive"
    return "no_history"


def _age_bracket(age: int | None) -> str:
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


def _normalize_spaces(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", str(value)).strip()
    return cleaned or None


def _normalize_phone(value: str | None) -> str | None:
    cleaned = _normalize_spaces(value)
    if not cleaned:
        return None
    if cleaned.startswith("+"):
        return "+" + "".join(ch for ch in cleaned[1:] if ch.isdigit())
    digits = "".join(ch for ch in cleaned if ch.isdigit())
    return digits or None


def _normalize_gender(value: str | None) -> str:
    cleaned = (_normalize_spaces(value) or "").lower()
    mapper = {
        "f": "female",
        "femenino": "female",
        "female": "female",
        "m": "male",
        "masculino": "male",
        "male": "male",
        "no binario": "non_binary",
        "no_binario": "non_binary",
        "non_binary": "non_binary",
        "non-binary": "non_binary",
        "nb": "non_binary",
        "otro": "other",
        "other": "other",
        "sin declarar": "undisclosed",
        "undisclosed": "undisclosed",
    }
    return mapper.get(cleaned, "undisclosed")


def _parse_birth_date(value: str | None) -> date | None:
    cleaned = _normalize_spaces(value)
    if not cleaned:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def _canonical_row_keys(row: dict[str, str]) -> dict[str, str]:
    mapped: dict[str, str] = {}
    for key, value in row.items():
        normalized_key = _normalize_spaces(key)
        if not normalized_key:
            continue
        canonical = CSV_HEADER_ALIASES.get(normalized_key.lower())
        if canonical:
            mapped[canonical] = value
    return mapped


def _engagement_level(profile: dict) -> Literal["high", "medium", "low"]:
    if profile["active_workshops"] >= 2 or profile["workshops_total"] >= 4:
        return "high"
    if profile["workshops_total"] >= 1 or profile["communications_sent"] >= 2:
        return "medium"
    return "low"


def _update_last_activity(profile: dict, value: datetime | None):
    if not value:
        return
    if not profile["last_activity"] or value > profile["last_activity"]:
        profile["last_activity"] = value


def _serialize_profile(profile: dict, include_workshops: bool):
    base = {
        "id": profile["id"],
        "name": profile["name"],
        "dni": profile["dni"],
        "email": profile["email"],
        "phone": profile["phone"],
        "birth_date": profile["birth_date"],
        "gender": profile["gender"],
        "created_at": profile["created_at"],
        "updated_at": profile["updated_at"],
        "age": profile["age"],
        "population_segment": profile["population_segment"],
        "workshops_total": profile["workshops_total"],
        "enrolled_workshops": profile["enrolled_workshops"],
        "active_workshops": profile["active_workshops"],
        "finished_workshops": profile["finished_workshops"],
        "dropped_workshops": profile["dropped_workshops"],
        "communications_sent": profile["communications_sent"],
        "communications_failed": profile["communications_failed"],
        "last_activity": profile["last_activity"],
        "engagement_level": profile["engagement_level"],
    }
    if include_workshops:
        base["workshops"] = sorted(profile["workshops"], key=lambda x: x["enrolled_at"], reverse=True)
    return base


def _build_profiles(db: Session) -> dict[UUID, dict]:
    participants = crud_participant.get_multi(db, limit=20000)
    profiles: dict[UUID, dict] = {}

    for p in participants:
        age = _calculate_age(p.birth_date)
        profiles[p.id] = {
            "id": p.id,
            "name": p.name,
            "dni": p.dni,
            "email": p.email,
            "phone": p.phone,
            "birth_date": p.birth_date,
            "gender": p.gender if p.gender in KNOWN_GENDERS else "undisclosed",
            "age": age,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "workshops_total": 0,
            "enrolled_workshops": 0,
            "active_workshops": 0,
            "finished_workshops": 0,
            "dropped_workshops": 0,
            "communications_sent": 0,
            "communications_failed": 0,
            "last_activity": None,
            "engagement_level": "low",
            "workshops": [],
        }

    enrollment_rows = (
        db.query(
            Enrollment.participant_id.label("participant_id"),
            Enrollment.status.label("enrollment_status"),
            Enrollment.created_at.label("enrolled_at"),
            Workshop.id.label("workshop_id"),
            Workshop.name.label("workshop_name"),
            Workshop.cohort_year.label("cohort_year"),
            Workshop.status.label("workshop_status"),
        )
        .join(Workshop, Enrollment.workshop_id == Workshop.id)
        .all()
    )

    for row in enrollment_rows:
        profile = profiles.get(row.participant_id)
        if not profile:
            continue
        profile["workshops"].append(
            {
                "workshop_id": row.workshop_id,
                "workshop_name": row.workshop_name,
                "cohort_year": row.cohort_year,
                "workshop_status": row.workshop_status,
                "enrollment_status": row.enrollment_status,
                "enrolled_at": row.enrolled_at,
            }
        )
        if row.enrollment_status == "enrolled":
            profile["enrolled_workshops"] += 1
        if row.enrollment_status == "active":
            profile["active_workshops"] += 1
        if row.enrollment_status == "finished":
            profile["finished_workshops"] += 1
        if row.enrollment_status == "dropped":
            profile["dropped_workshops"] += 1
        _update_last_activity(profile, row.enrolled_at)

    communication_rows = db.query(
        CommunicationRecipient.participant_id,
        CommunicationRecipient.status,
        CommunicationRecipient.created_at,
    ).all()
    for participant_id, status, created_at in communication_rows:
        profile = profiles.get(participant_id)
        if not profile:
            continue
        if status == "sent":
            profile["communications_sent"] += 1
        if status == "failed":
            profile["communications_failed"] += 1
        _update_last_activity(profile, created_at)

    for profile in profiles.values():
        profile["workshops_total"] = len(profile["workshops"])
        profile["engagement_level"] = _engagement_level(profile)
        profile["population_segment"] = _population_segment(profile)
    return profiles


def _apply_profile_filters(
    profiles: dict[UUID, dict],
    q: str | None,
    workshop_id: UUID | None,
    enrollment_status: str,
    engagement: str | None,
    gender: str | None,
    age_min: int | None,
    age_max: int | None,
    population: str,
):
    term = (q or "").strip().lower()
    filtered = []

    for profile in profiles.values():
        if term:
            haystack = " ".join(
                [
                    profile.get("name") or "",
                    profile.get("email") or "",
                    profile.get("phone") or "",
                    profile.get("dni") or "",
                ]
            ).lower()
            if term not in haystack:
                continue

        if workshop_id and not any(w["workshop_id"] == workshop_id for w in profile["workshops"]):
            continue

        if enrollment_status != "all" and not any(w["enrollment_status"] == enrollment_status for w in profile["workshops"]):
            continue

        if engagement and profile["engagement_level"] != engagement:
            continue

        if gender and profile["gender"] != gender:
            continue

        if age_min is not None and (profile["age"] is None or profile["age"] < age_min):
            continue

        if age_max is not None and (profile["age"] is None or profile["age"] > age_max):
            continue

        if population != "all" and profile.get("population_segment") != population:
            continue

        filtered.append(profile)

    filtered.sort(key=lambda p: (p["name"] or "").lower())
    return filtered


@router.get("/", response_model=list[ParticipantOut])
def list_participants(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    return crud_participant.get_multi(db)


@router.get("/overview", response_model=ParticipantOverviewOut)
def participants_overview(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    profiles = _build_profiles(db)
    age_brackets = {"0_17": 0, "18_24": 0, "25_34": 0, "35_44": 0, "45_54": 0, "55_64": 0, "65_plus": 0, "unknown": 0}
    gender_distribution = {"female": 0, "male": 0, "non_binary": 0, "other": 0, "undisclosed": 0}

    total_participants = len(profiles)
    with_workshops = 0
    active_members = 0
    certifiable_members = 0
    inactive_members = 0
    no_history_members = 0
    for profile in profiles.values():
        if profile["workshops_total"] > 0:
            with_workshops += 1
        if profile["active_workshops"] > 0:
            active_members += 1
        if profile["finished_workshops"] > 0:
            certifiable_members += 1
        if profile["population_segment"] == "inactive":
            inactive_members += 1
        if profile["population_segment"] == "no_history":
            no_history_members += 1
        age_brackets[_age_bracket(profile["age"])] += 1
        gender_distribution[profile["gender"] if profile["gender"] in gender_distribution else "undisclosed"] += 1

    return {
        "total_participants": total_participants,
        "with_workshops": with_workshops,
        "active_members": active_members,
        "certifiable_members": certifiable_members,
        "inactive_members": inactive_members,
        "no_history_members": no_history_members,
        "age_brackets": age_brackets,
        "gender_distribution": gender_distribution,
    }


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
    profiles = _build_profiles(db)
    filtered = _apply_profile_filters(
        profiles, q, workshop_id, enrollment_status, engagement, gender, age_min, age_max, population
    )
    return [_serialize_profile(p, include_workshops=False) for p in filtered]


@router.get("/profiles/{participant_id}", response_model=ParticipantProfileOut)
def get_participant_profile(participant_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    profiles = _build_profiles(db)
    obj = crud_participant.get(db, participant_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Participant not found")
    profile = profiles.get(obj.id)
    if not profile:
        raise HTTPException(status_code=404, detail="Participant profile not found")
    return _serialize_profile(profile, include_workshops=True)


@router.get("/grouped-by-workshop", response_model=list[WorkshopParticipantsGroupOut])
def participants_grouped_by_workshop(
    q: str | None = Query(default=None),
    workshop_id: UUID | None = Query(default=None),
    enrollment_status: Literal["all", "enrolled", "active", "dropped", "finished"] = Query(default="all"),
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
    profiles = _build_profiles(db)
    filtered = _apply_profile_filters(
        profiles, q, workshop_id, enrollment_status, engagement, gender, age_min, age_max, population
    )
    grouped: dict[UUID, dict] = {}

    for profile in filtered:
        for workshop in profile["workshops"]:
            if workshop_id and workshop["workshop_id"] != workshop_id:
                continue
            if enrollment_status != "all" and workshop["enrollment_status"] != enrollment_status:
                continue
            entry = grouped.get(workshop["workshop_id"])
            if not entry:
                entry = {
                    "workshop_id": workshop["workshop_id"],
                    "workshop_name": workshop["workshop_name"],
                    "cohort_year": workshop["cohort_year"],
                    "workshop_status": workshop["workshop_status"],
                    "participants_total": 0,
                    "participants": [],
                }
                grouped[workshop["workshop_id"]] = entry
            entry["participants"].append(
                {
                    "participant_id": profile["id"],
                    "name": profile["name"],
                    "dni": profile["dni"],
                    "email": profile["email"],
                    "phone": profile["phone"],
                    "age": profile["age"],
                    "gender": profile["gender"],
                    "enrollment_status": workshop["enrollment_status"],
                    "engagement_level": profile["engagement_level"],
                    "workshops_total": profile["workshops_total"],
                    "last_activity": profile["last_activity"],
                }
            )

    groups = []
    for group in grouped.values():
        group["participants"].sort(key=lambda p: (p["name"] or "").lower())
        group["participants_total"] = len(group["participants"])
        groups.append(group)
    groups.sort(key=lambda g: (-g["cohort_year"], g["workshop_name"].lower()))
    return groups


@router.get("/export.csv")
def export_participants_csv(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    participants = crud_participant.get_multi(db, limit=20000)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADERS)
    for p in participants:
        writer.writerow(
            [
                p.name or "",
                p.dni or "",
                p.email or "",
                p.phone or "",
                p.birth_date.isoformat() if p.birth_date else "",
                p.gender or "undisclosed",
            ]
        )
    csv_text = buffer.getvalue()
    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="participants_export.csv"'},
    )


@router.post("/import.csv", response_model=ParticipantImportCSVOut)
def import_participants_csv(
    payload: ParticipantImportCSVIn, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
):
    content = payload.csv_content or ""
    if not content.strip():
        raise HTTPException(status_code=400, detail="CSV vacío")

    try:
        dialect = csv.Sniffer().sniff(content[:4096], delimiters=",;")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(content), dialect=dialect)
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV sin encabezados")

    total_rows = 0
    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []

    for index, raw in enumerate(reader, start=2):
        total_rows += 1
        row = _canonical_row_keys(raw)

        name = _normalize_spaces(row.get("name"))
        email = (_normalize_spaces(row.get("email")) or "").lower()
        dni = "".join(ch for ch in (row.get("dni") or "") if ch.isdigit()) or None
        phone = _normalize_phone(row.get("phone"))
        birth_date = _parse_birth_date(row.get("birth_date"))
        gender = _normalize_gender(row.get("gender"))

        if not name or not email:
            skipped += 1
            errors.append(f"Fila {index}: faltan campos obligatorios (name/email)")
            continue

        try:
            by_email = crud_participant.get_by_email(db, email)
            by_dni = crud_participant.get_by_dni(db, dni) if dni else None
            if by_email and by_dni and by_email.id != by_dni.id:
                skipped += 1
                errors.append(f"Fila {index}: conflicto entre email y DNI existentes")
                continue

            existing = by_email or by_dni
            if existing:
                update_payload = ParticipantUpdate(
                    name=name,
                    email=email,
                    dni=dni,
                    phone=phone,
                    birth_date=birth_date,
                    gender=gender,
                )
                crud_participant.update(db, existing, update_payload)
                updated += 1
            else:
                create_payload = ParticipantCreate(
                    name=name,
                    email=email,
                    dni=dni,
                    phone=phone,
                    birth_date=birth_date,
                    gender=gender,
                )
                crud_participant.create(db, create_payload)
                created += 1
        except Exception as exc:
            db.rollback()
            skipped += 1
            errors.append(f"Fila {index}: {exc}")

    return {
        "total_rows": total_rows,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:50],
    }


@router.get("/{participant_id}", response_model=ParticipantOut)
def get_participant(participant_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_participant.get(db, participant_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Participant not found")
    return obj


@router.put("/{participant_id}", response_model=ParticipantOut)
def update_participant(
    participant_id: str, payload: ParticipantUpdate, db: Session = Depends(get_db), _: str = Depends(get_current_admin)
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
def delete_participant(participant_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    obj = crud_participant.remove(db, participant_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Participant not found")
    return obj

