import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.models.communication import Communication
from app.models.communication_recipient import CommunicationRecipient
from app.models.enrollment import Enrollment
from app.models.participant import Participant
from app.schemas.communication import CommunicationCreate, CommunicationOut
from app.schemas.communication_recipient import CommunicationRecipientsSummaryOut, ResendFailedResultOut


router = APIRouter(prefix="/communications", tags=["communications"])


@router.get("/", response_model=list[CommunicationOut])
def list_communications(db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    return db.query(Communication).order_by(Communication.created_at.desc()).all()


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
def list_emails(workshop_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    wid = uuid.UUID(workshop_id)
    rows = (
        db.query(Participant.email)
        .join(Enrollment, Enrollment.participant_id == Participant.id)
        .filter(Enrollment.workshop_id == wid)
        .all()
    )
    return [r[0] for r in rows]


@router.post("/workshops/{workshop_id}/emails", response_model=CommunicationOut)
def send_email_to_workshop(
    workshop_id: str, payload: CommunicationCreate, db: Session = Depends(get_db), admin=Depends(get_current_admin)
):
    if str(payload.workshop_id) != workshop_id:
        raise HTTPException(status_code=400, detail="Workshop ID mismatch")

    wid = uuid.UUID(workshop_id)
    participants = (
        db.query(Participant)
        .join(Enrollment, Enrollment.participant_id == Participant.id)
        .filter(Enrollment.workshop_id == wid)
        .all()
    )
    if not participants:
        raise HTTPException(status_code=404, detail="No participants for this workshop")

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
        db.add(
            CommunicationRecipient(
                communication_id=communication.id,
                participant_id=participant.id,
                email_snapshot=participant.email,
                status="sent",
            )
        )

    db.commit()
    db.refresh(communication)
    return communication


@router.post("/{communication_id}/resend-failed", response_model=ResendFailedResultOut)
def resend_failed(communication_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_admin)):
    cid = uuid.UUID(communication_id)
    communication = db.query(Communication).filter(Communication.id == cid).first()
    if not communication:
        raise HTTPException(status_code=404, detail="Communication not found")

    failed_recipients = (
        db.query(CommunicationRecipient)
        .filter(CommunicationRecipient.communication_id == cid, CommunicationRecipient.status == "failed")
        .all()
    )

    resent = 0
    for recipient in failed_recipients:
        recipient.status = "sent"
        recipient.error_message = None
        resent += 1

    if resent > 0:
        communication.sent_at = datetime.now(timezone.utc)

    remaining_failed = (
        db.query(func.count(CommunicationRecipient.id))
        .filter(CommunicationRecipient.communication_id == cid, CommunicationRecipient.status == "failed")
        .scalar()
        or 0
    )

    db.commit()
    return ResendFailedResultOut(communication_id=cid, resent=resent, remaining_failed=remaining_failed)
