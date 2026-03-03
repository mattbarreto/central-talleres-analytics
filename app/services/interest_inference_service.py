from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.admin import Admin
from app.models.enrollment import Enrollment
from app.models.interest_term import InterestTerm
from app.models.participant_interest_inference_snapshot import ParticipantInterestInferenceSnapshot
from app.models.workshop import Workshop
from app.models.workshop_interest_link import WorkshopInterestLink
from app.schemas.interest_inference import WorkshopInterestLinkIn
from app.services.resource_terms_service import normalize_term_key

STATUS_WEIGHT = {
    "enrolled": 1.0,
    "active": 2.0,
    "finished": 3.0,
    "dropped": 0.5,
}


def _get_admin(db: Session, email: str) -> Admin:
    admin = db.query(Admin).filter(Admin.email == email.lower()).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin no autenticado")
    return admin


def create_interest_term(db: Session, name: str, actor_email: str) -> InterestTerm:
    _ = _get_admin(db, actor_email)
    normalized_key = normalize_term_key(name)
    if not normalized_key:
        raise HTTPException(status_code=400, detail="Interes invalido")

    existing = db.query(InterestTerm).filter(InterestTerm.normalized_key == normalized_key).first()
    if existing:
        return existing

    term = InterestTerm(name=name.strip(), normalized_key=normalized_key, active=True)
    db.add(term)
    db.commit()
    db.refresh(term)
    return term


def list_interest_terms(db: Session, actor_email: str) -> list[InterestTerm]:
    _ = _get_admin(db, actor_email)
    return db.query(InterestTerm).filter(InterestTerm.active.is_(True)).order_by(InterestTerm.name.asc()).all()


def replace_workshop_interest_links(
    db: Session,
    workshop_id,
    payload: list[WorkshopInterestLinkIn],
    actor_email: str,
) -> list[tuple[WorkshopInterestLink, InterestTerm]]:
    _ = _get_admin(db, actor_email)
    workshop = db.query(Workshop).filter(Workshop.id == workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Taller no encontrado")

    term_ids = [row.interest_term_id for row in payload]
    if len(term_ids) != len(set(term_ids)):
        raise HTTPException(status_code=409, detail="No se puede repetir un interes para el mismo taller")

    terms = db.query(InterestTerm).filter(InterestTerm.id.in_(term_ids), InterestTerm.active.is_(True)).all() if term_ids else []
    if len(terms) != len(term_ids):
        raise HTTPException(status_code=400, detail="Hay intereses invalidos o inactivos")

    existing = db.query(WorkshopInterestLink).filter(WorkshopInterestLink.workshop_id == workshop_id).all()
    existing_map = {row.interest_term_id: row for row in existing}

    keep = set()
    for row in payload:
        keep.add(row.interest_term_id)
        current = existing_map.get(row.interest_term_id)
        if current:
            current.weight = float(row.weight)
            continue
        db.add(
            WorkshopInterestLink(
                workshop_id=workshop_id,
                interest_term_id=row.interest_term_id,
                weight=float(row.weight),
            )
        )

    for stale in existing:
        if stale.interest_term_id not in keep:
            db.delete(stale)

    db.commit()
    return get_workshop_interest_links(db, workshop_id, actor_email)


def get_workshop_interest_links(db: Session, workshop_id, actor_email: str) -> list[tuple[WorkshopInterestLink, InterestTerm]]:
    _ = _get_admin(db, actor_email)
    return (
        db.query(WorkshopInterestLink, InterestTerm)
        .join(InterestTerm, InterestTerm.id == WorkshopInterestLink.interest_term_id)
        .filter(WorkshopInterestLink.workshop_id == workshop_id)
        .order_by(InterestTerm.name.asc())
        .all()
    )


def _recency_factor(created_at: datetime | None, snapshot_date: date) -> float:
    if not created_at:
        return 0.4
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=UTC)
    snapshot_dt = datetime.combine(snapshot_date, datetime.min.time(), tzinfo=UTC)
    days = (snapshot_dt - created_at.astimezone(UTC)).days
    if days <= 90:
        return 1.0
    if days <= 365:
        return 0.7
    return 0.4


def _confidence_level(valid_enrollments: int, evidence_points: float, top_share: float, workshops_count: int) -> str:
    if valid_enrollments < 2 or evidence_points < 2.0:
        return "insufficient"
    if evidence_points < 4.0:
        return "low"
    if evidence_points >= 8.0 and top_share >= 0.60 and workshops_count >= 3:
        return "high"
    if evidence_points >= 4.0 and top_share >= 0.45:
        return "medium"
    return "low"


def _compute_scores(
    enrollments: list[Enrollment],
    links_by_workshop: dict,
    snapshot_date: date,
    rolling: bool,
) -> tuple[dict, float, int, int]:
    term_scores: dict = {}
    evidence_points = 0.0
    workshops_seen = set()
    valid_enrollments = 0

    for enrollment in enrollments:
        if rolling and enrollment.created_at:
            created = enrollment.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            snapshot_dt = datetime.combine(snapshot_date, datetime.min.time(), tzinfo=UTC)
            age_days = (snapshot_dt - created.astimezone(UTC)).days
            if age_days > 365:
                continue

        links = links_by_workshop.get(enrollment.workshop_id, [])
        if not links:
            continue

        status_weight = STATUS_WEIGHT.get((enrollment.status or "").lower(), 0.0)
        if status_weight <= 0:
            continue

        valid_enrollments += 1
        workshops_seen.add(enrollment.workshop_id)
        recency = _recency_factor(enrollment.created_at, snapshot_date)

        for interest_term_id, weight in links:
            points = status_weight * recency * float(weight)
            evidence_points += points
            term_scores[interest_term_id] = term_scores.get(interest_term_id, 0.0) + points

    return term_scores, evidence_points, len(workshops_seen), valid_enrollments


def rebuild_inference(
    db: Session,
    actor_email: str,
    snapshot_date: date | None = None,
    participant_id=None,
) -> dict:
    _ = _get_admin(db, actor_email)
    snapshot_date = snapshot_date or date.today()

    participant_query = db.query(Enrollment.participant_id).distinct()
    if participant_id:
        participant_query = participant_query.filter(Enrollment.participant_id == participant_id)
    participant_ids = [row[0] for row in participant_query.all() if row[0]]

    links_rows = db.query(WorkshopInterestLink.workshop_id, WorkshopInterestLink.interest_term_id, WorkshopInterestLink.weight).all()
    links_by_workshop: dict = {}
    for workshop_id, term_id, weight in links_rows:
        links_by_workshop.setdefault(workshop_id, []).append((term_id, float(weight or 1.0)))

    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.participant_id.in_(participant_ids))
        .order_by(Enrollment.created_at.asc())
        .all()
        if participant_ids
        else []
    )
    enrollments_by_participant: dict = {}
    for enrollment in enrollments:
        enrollments_by_participant.setdefault(enrollment.participant_id, []).append(enrollment)

    rows_created = 0
    for pid in participant_ids:
        source_enrollments = enrollments_by_participant.get(pid, [])
        for window_type, rolling in (("rolling_12m", True), ("all_time", False)):
            term_scores, evidence_points, workshops_count, valid_enrollments = _compute_scores(
                source_enrollments,
                links_by_workshop,
                snapshot_date,
                rolling,
            )
            total_score = sum(term_scores.values())
            top_share = (max(term_scores.values()) / total_score) if total_score > 0 else 0.0
            confidence = _confidence_level(valid_enrollments, evidence_points, top_share, workshops_count)

            db.query(ParticipantInterestInferenceSnapshot).filter(
                ParticipantInterestInferenceSnapshot.participant_id == pid,
                ParticipantInterestInferenceSnapshot.window_type == window_type,
                ParticipantInterestInferenceSnapshot.snapshot_date == snapshot_date,
            ).delete(synchronize_session=False)

            for term_id, score in term_scores.items():
                share = (score / total_score) if total_score > 0 else 0.0
                db.add(
                    ParticipantInterestInferenceSnapshot(
                        participant_id=pid,
                        interest_term_id=term_id,
                        window_type=window_type,
                        snapshot_date=snapshot_date,
                        score=float(score),
                        share=float(share),
                        confidence_level=confidence,
                        evidence_points=float(evidence_points),
                        evidence_workshops_count=workshops_count,
                        methodology_version="v1",
                    )
                )
                rows_created += 1

    db.commit()
    return {
        "snapshot_date": snapshot_date,
        "participants_processed": len(participant_ids),
        "rows_created": rows_created,
    }


def get_latest_participant_inference(db: Session, actor_email: str, participant_id, window_type: str) -> dict:
    _ = _get_admin(db, actor_email)
    latest = (
        db.query(ParticipantInterestInferenceSnapshot.snapshot_date)
        .filter(
            ParticipantInterestInferenceSnapshot.participant_id == participant_id,
            ParticipantInterestInferenceSnapshot.window_type == window_type,
        )
        .order_by(ParticipantInterestInferenceSnapshot.snapshot_date.desc())
        .first()
    )
    if not latest:
        return {
            "participant_id": participant_id,
            "window_type": window_type,
            "snapshot_date": None,
            "confidence_level": "insufficient",
            "primary_interest_term_id": None,
            "rows": [],
        }

    snapshot_date = latest[0]
    rows = (
        db.query(ParticipantInterestInferenceSnapshot, InterestTerm.name)
        .join(InterestTerm, InterestTerm.id == ParticipantInterestInferenceSnapshot.interest_term_id)
        .filter(
            ParticipantInterestInferenceSnapshot.participant_id == participant_id,
            ParticipantInterestInferenceSnapshot.window_type == window_type,
            ParticipantInterestInferenceSnapshot.snapshot_date == snapshot_date,
        )
        .order_by(ParticipantInterestInferenceSnapshot.score.desc())
        .all()
    )

    out_rows = []
    for row, interest_name in rows:
        out_rows.append(
            {
                "interest_term_id": row.interest_term_id,
                "interest_name": interest_name,
                "score": round(float(row.score), 4),
                "share": round(float(row.share), 4),
                "confidence_level": row.confidence_level,
                "evidence_points": round(float(row.evidence_points), 4),
                "evidence_workshops_count": int(row.evidence_workshops_count or 0),
                "methodology_version": row.methodology_version,
            }
        )

    confidence = out_rows[0]["confidence_level"] if out_rows else "insufficient"
    primary_interest_term_id = None
    if confidence in {"medium", "high"} and out_rows and out_rows[0]["share"] >= 0.45:
        primary_interest_term_id = out_rows[0]["interest_term_id"]

    return {
        "participant_id": participant_id,
        "window_type": window_type,
        "snapshot_date": snapshot_date,
        "confidence_level": confidence,
        "primary_interest_term_id": primary_interest_term_id,
        "rows": out_rows,
    }
