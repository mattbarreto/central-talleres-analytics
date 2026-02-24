from __future__ import annotations

import csv
import io
import re
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy.orm import Session

from app.crud.participant import participant as crud_participant
from app.models.communication_recipient import CommunicationRecipient
from app.models.enrollment import Enrollment
from app.models.participant import Participant
from app.models.workshop import Workshop
from app.schemas.participant import ParticipantCreate, ParticipantUpdate


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


def to_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return value.date()

def calculate_age(birth_date: date | None) -> int | None:
    if not birth_date:
        return None
    today = datetime.now(UTC).date()
    years = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        years -= 1
    return max(years, 0)


def population_segment(profile: dict) -> Literal["current", "graduated", "inactive", "no_history"]:
    if profile["active_workshops"] > 0:
        return "current"
    if profile["finished_workshops"] > 0:
        return "graduated"
    if profile["workshops_total"] > 0:
        return "inactive"
    return "no_history"


def age_bracket(age: int | None) -> str:
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


def normalize_spaces(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", str(value)).strip()
    return cleaned or None


def sanitize_csv_cell(value: str | None) -> str:
    text = str(value or "")
    if text and text[0] in {"=", "+", "-", "@"}:
        return f"'{text}"
    return text


def normalize_phone(value: str | None) -> str | None:
    cleaned = normalize_spaces(value)
    if not cleaned:
        return None
    if cleaned.startswith("+"):
        return "+" + "".join(ch for ch in cleaned[1:] if ch.isdigit())
    digits = "".join(ch for ch in cleaned if ch.isdigit())
    return digits or None


def normalize_gender(value: str | None) -> str:
    cleaned = (normalize_spaces(value) or "").lower()
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


def parse_birth_date(value: str | None) -> date | None:
    cleaned = normalize_spaces(value)
    if not cleaned:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def canonical_row_keys(row: dict[str, str]) -> dict[str, str]:
    mapped: dict[str, str] = {}
    for key, value in row.items():
        normalized_key = normalize_spaces(key)
        if not normalized_key:
            continue
        canonical = CSV_HEADER_ALIASES.get(normalized_key.lower())
        if canonical:
            mapped[canonical] = value
    return mapped


def engagement_level(profile: dict) -> Literal["high", "medium", "low"]:
    if profile["active_workshops"] >= 2 or profile["workshops_total"] >= 4:
        return "high"
    if profile["workshops_total"] >= 1 or profile["communications_sent"] >= 2:
        return "medium"
    return "low"


def update_last_activity(profile: dict, value: datetime | None):
    if not value:
        return
    if not profile["last_activity"] or value > profile["last_activity"]:
        profile["last_activity"] = value


def serialize_profile(profile: dict, include_workshops: bool):
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


def build_profiles(db: Session) -> dict[UUID, dict]:
    participants = db.query(Participant).order_by(Participant.created_at.asc()).all()
    profiles: dict[UUID, dict] = {}

    for p in participants:
        age = calculate_age(p.birth_date)
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
        update_last_activity(profile, row.enrolled_at)

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
        update_last_activity(profile, created_at)

    for profile in profiles.values():
        profile["workshops_total"] = len(profile["workshops"])
        profile["engagement_level"] = engagement_level(profile)
        profile["population_segment"] = population_segment(profile)
    return profiles


def apply_profile_filters(
    profiles: dict[UUID, dict],
    q: str | None,
    workshop_id: UUID | None,
    enrollment_status: str,
    engagement: str | None,
    gender: str | None,
    age_min: int | None,
    age_max: int | None,
    population: str,
    active_days: int | None = None,
) -> list[dict]:
    term = (q or "").strip().lower()
    filtered = []
    
    cutoff: date | None = None
    if active_days is not None:
        cutoff = (datetime.now(UTC) - timedelta(days=active_days)).date()

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
            
        if cutoff:
            has_recent = False
            for w in profile["workshops"]:
                when = to_date(w.get("enrolled_at"))
                if when and when >= cutoff:
                    if enrollment_status == "all" or w["enrollment_status"] == enrollment_status:
                        has_recent = True
                        break
            if not has_recent:
                continue

        filtered.append(profile)

    filtered.sort(key=lambda p: (p["name"] or "").lower())
    return filtered


def build_overview(profiles: dict[UUID, dict]) -> dict:
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
        age_brackets[age_bracket(profile["age"])] += 1
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


def group_profiles_by_workshop(filtered_profiles: list[dict], workshop_id: UUID | None, enrollment_status: str) -> list[dict]:
    grouped: dict[UUID, dict] = {}
    for profile in filtered_profiles:
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


def export_participants_csv_text(db: Session) -> str:
    participants = db.query(Participant).order_by(Participant.created_at.asc()).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADERS)
    for p in participants:
        writer.writerow(
            [
                sanitize_csv_cell(p.name),
                sanitize_csv_cell(p.dni),
                sanitize_csv_cell(p.email),
                sanitize_csv_cell(p.phone),
                sanitize_csv_cell(p.birth_date.isoformat() if p.birth_date else ""),
                sanitize_csv_cell(p.gender or "undisclosed"),
            ]
        )
    return buffer.getvalue()


def import_participants_csv(content: str, db: Session) -> dict:
    if not content.strip():
        return {"error": "CSV vacío"}

    try:
        dialect = csv.Sniffer().sniff(content[:4096], delimiters=",;")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(content), dialect=dialect)
    if not reader.fieldnames:
        return {"error": "CSV sin encabezados"}

    total_rows = 0
    created = 0
    updated = 0
    skipped = 0
    errors: list[str] = []

    for index, raw in enumerate(reader, start=2):
        total_rows += 1
        row = canonical_row_keys(raw)

        name = normalize_spaces(row.get("name"))
        email = (normalize_spaces(row.get("email")) or "").lower()
        dni = "".join(ch for ch in (row.get("dni") or "") if ch.isdigit()) or None
        phone = normalize_phone(row.get("phone"))
        birth_date = parse_birth_date(row.get("birth_date"))
        gender = normalize_gender(row.get("gender"))

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
