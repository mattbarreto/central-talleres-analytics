from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.schemas.interest_inference import (
    InferenceRebuildIn,
    InterestTermCreate,
    InterestTermOut,
    ParticipantInterestInferenceOut,
    WorkshopInterestLinkIn,
    WorkshopInterestLinkOut,
)
from app.services import interest_inference_service

router = APIRouter(prefix="/interests", tags=["interests"])


@router.get("/terms", response_model=list[InterestTermOut])
def list_interest_terms(
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    return interest_inference_service.list_interest_terms(db, admin_email)


@router.post("/terms", response_model=InterestTermOut)
def create_interest_term(
    payload: InterestTermCreate,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    return interest_inference_service.create_interest_term(db, payload.name, admin_email)


@router.get("/workshops/{workshop_id}/links", response_model=list[WorkshopInterestLinkOut])
def get_workshop_interest_links(
    workshop_id: UUID,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    rows = interest_inference_service.get_workshop_interest_links(db, workshop_id, admin_email)
    return [
        WorkshopInterestLinkOut(
            workshop_id=link.workshop_id,
            interest_term_id=link.interest_term_id,
            interest_name=term.name,
            weight=link.weight,
        )
        for link, term in rows
    ]


@router.put("/workshops/{workshop_id}/links", response_model=list[WorkshopInterestLinkOut])
def replace_workshop_interest_links(
    workshop_id: UUID,
    payload: list[WorkshopInterestLinkIn],
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    rows = interest_inference_service.replace_workshop_interest_links(db, workshop_id, payload, admin_email)
    return [
        WorkshopInterestLinkOut(
            workshop_id=link.workshop_id,
            interest_term_id=link.interest_term_id,
            interest_name=term.name,
            weight=link.weight,
        )
        for link, term in rows
    ]


@router.post("/inference/rebuild")
def rebuild_interest_inference(
    payload: InferenceRebuildIn,
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    return interest_inference_service.rebuild_inference(
        db,
        admin_email,
        snapshot_date=payload.snapshot_date,
        participant_id=payload.participant_id,
    )


@router.get("/participants/{participant_id}/inferred", response_model=ParticipantInterestInferenceOut)
def get_participant_inferred_interests(
    participant_id: UUID,
    window_type: str = Query(default="rolling_12m", pattern="^(rolling_12m|all_time)$"),
    db: Session = Depends(get_db),
    admin_email: str = Depends(get_current_admin),
):
    payload = interest_inference_service.get_latest_participant_inference(db, admin_email, participant_id, window_type)
    return ParticipantInterestInferenceOut(**payload)
