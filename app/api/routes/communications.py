from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.models.communication import Communication
from app.models.communication_recipient import CommunicationRecipient
from app.models.admin import Admin
from app.models.enrollment import Enrollment
from app.models.participant import Participant
from app.services.email_service import send_email
from app.schemas.communication import CommunicationCreate, CommunicationOut
from app.schemas.communication_recipient import CommunicationRecipientsSummaryOut, ResendFailedResultOut


router = APIRouter(prefix="/communications", tags=["communications"])


@router.get("/", response_model=list[CommunicationOut])
def list_communications(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: str = Depends(get_current_admin),
):
    return db.query(Communication).order_by(Communication.created_at.desc()).offset(skip).limit(limit).all()


@router.get("/summary", response_model=list[CommunicationRecipientsSummaryOut])
def list_communications_summary(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    rows = (
        db.query(
            CommunicationRecipient.communication_id.label("communication_id"),
            func.count(CommunicationRecipient.id).label("total"),
            func.sum(case((CommunicationRecipient.status == "sent", 1), else_=0)).label("sent"),
            func.sum(case((CommunicationRecipient.status == "failed", 1), else_=0)).label("failed"),
        )
        .group_by(CommunicationRecipient.communication_id)
        .all()
    )
    return [
        CommunicationRecipientsSummaryOut(
            communication_id=row.communication_id,
            total=row.total or 0,
            sent=row.sent or 0,
            failed=row.failed or 0,
        )
        for row in rows
    ]


@router.get("/workshops/{workshop_id}/emails", response_model=list[str])
def list_emails(workshop_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    rows = (
        db.query(Participant.email)
        .join(Enrollment, Enrollment.participant_id == Participant.id)
        .filter(Enrollment.workshop_id == workshop_id)
        .all()
    )
    return [r[0] for r in rows]


@router.post("/workshops/{workshop_id}/emails", response_model=CommunicationOut)
def send_email_to_workshop(
    workshop_id: UUID, payload: CommunicationCreate, db: Session = Depends(get_db), admin_email: str = Depends(get_current_admin)
):
    if payload.workshop_id != workshop_id:
        raise HTTPException(status_code=400, detail="Workshop ID mismatch")

    participants = (
        db.query(Participant)
        .join(Enrollment, Enrollment.participant_id == Participant.id)
        .filter(Enrollment.workshop_id == workshop_id)
        .all()
    )
    if not participants:
        raise HTTPException(status_code=404, detail="No participants for this workshop")

    admin = db.query(Admin).filter(Admin.email == admin_email).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

    communication = Communication(
        workshop_id=payload.workshop_id,
        subject=payload.subject,
        body=payload.body,
        sent_at=datetime.now(timezone.utc),
        sent_by_admin_id=admin.id,
    )
    db.add(communication)
    db.flush()

    for participant in participants:
        success, error_message = send_email(payload.subject, payload.body, participant.email)
        db.add(
            CommunicationRecipient(
                communication_id=communication.id,
                participant_id=participant.id,
                email_snapshot=participant.email,
                status="sent" if success else "failed",
                error_message=error_message,
            )
        )

    db.commit()
    db.refresh(communication)
    return communication


@router.post("/{communication_id}/resend-failed", response_model=ResendFailedResultOut)
def resend_failed(communication_id: UUID, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    communication = db.query(Communication).filter(Communication.id == communication_id).first()
    if not communication:
        raise HTTPException(status_code=404, detail="Communication not found")

    failed_recipients = (
        db.query(CommunicationRecipient)
        .filter(CommunicationRecipient.communication_id == communication_id, CommunicationRecipient.status == "failed")
        .all()
    )

    resent = 0
    for recipient in failed_recipients:
        success, error_message = send_email(communication.subject, communication.body, recipient.email_snapshot)
        if success:
            recipient.status = "sent"
            recipient.error_message = None
            resent += 1
        else:
            recipient.status = "failed"
            recipient.error_message = error_message

    if resent > 0:
        communication.sent_at = datetime.now(timezone.utc)

    remaining_failed = (
        db.query(func.count(CommunicationRecipient.id))
        .filter(CommunicationRecipient.communication_id == communication_id, CommunicationRecipient.status == "failed")
        .scalar()
        or 0
    )

    db.commit()
    return ResendFailedResultOut(communication_id=communication_id, resent=resent, remaining_failed=remaining_failed)
