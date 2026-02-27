from datetime import date, time
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, or_, not_, select
from sqlalchemy.orm import Session

from app.models.team_member import TeamMember
from app.models.workshop import Workshop
from app.models.workshop_session import WorkshopSession
from app.schemas.workshop_session import WorkshopSessionCreate, WorkshopSessionUpdate


def check_facilitator_overlap(db: Session, facilitator_id: UUID, session_date: date, start: time, end: time, exclude_session_id: Optional[UUID] = None):
    """
    Ensure the facilitator does not have overlapping sessions on the same date.
    Overlapping logic: not (end_A <= start_B or start_A >= end_B)
    """
    if not facilitator_id:
        return
        
    query = select(WorkshopSession).where(
        WorkshopSession.facilitator_id == facilitator_id,
        WorkshopSession.date == session_date,
        not_(
            or_(
                WorkshopSession.end_time <= start,
                WorkshopSession.start_time >= end
            )
        )
    )
    if exclude_session_id:
        query = query.where(WorkshopSession.id != exclude_session_id)
        
    overlap = db.execute(query).scalars().first()
    if overlap:
        raise HTTPException(
            status_code=409,
            detail=f"El docente ya tiene una clase superpuesta ({overlap.start_time.strftime('%H:%M')} a {overlap.end_time.strftime('%H:%M')})"
        )


def validate_session_dates(workshop: Workshop, session_date: date):
    if workshop.start_date and session_date < workshop.start_date:
        raise HTTPException(status_code=400, detail="La fecha del encuentro no puede ser anterior al inicio del taller.")
    if workshop.end_date and session_date > workshop.end_date:
        raise HTTPException(status_code=400, detail="La fecha del encuentro no puede ser posterior al fin del taller.")


def get_sessions(db: Session, workshop_id: UUID) -> List[WorkshopSession]:
    return db.execute(
        select(WorkshopSession)
        .where(WorkshopSession.workshop_id == workshop_id)
        .order_by(WorkshopSession.date, WorkshopSession.start_time)
    ).scalars().all()


def get_session_for_workshop(db: Session, workshop_id: UUID, session_id: UUID) -> WorkshopSession:
    db_session = db.execute(
        select(WorkshopSession).where(
            WorkshopSession.id == session_id,
            WorkshopSession.workshop_id == workshop_id,
        )
    ).scalars().first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Encuentro no encontrado para este taller")
    return db_session


def create_session(db: Session, workshop_id: UUID, payload: WorkshopSessionCreate) -> WorkshopSession:
    workshop = db.get(Workshop, workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Taller no encontrado")

    validate_session_dates(workshop, payload.date)

    if payload.facilitator_id:
        fac = db.get(TeamMember, payload.facilitator_id)
        if not fac:
            raise HTTPException(status_code=400, detail="Docente no encontrado")
        check_facilitator_overlap(db, payload.facilitator_id, payload.date, payload.start_time, payload.end_time)

    new_session = WorkshopSession(workshop_id=workshop_id, **payload.model_dump())
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


def bulk_create_sessions(db: Session, workshop_id: UUID, payloads: List[WorkshopSessionCreate]) -> List[WorkshopSession]:
    workshop = db.get(Workshop, workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Taller no encontrado")

    new_sessions = []
    for payload in payloads:
        validate_session_dates(workshop, payload.date)
        if payload.facilitator_id:
            fac = db.get(TeamMember, payload.facilitator_id)
            if not fac:
                # To fail the whole transaction cleanly
                raise HTTPException(status_code=400, detail=f"Docente no encontrado para encuentro del {payload.date}")
            # The check_facilitator_overlap looks AT THE DB. Since we haven't committed the in-memory ones,
            # we also need to check against the ones we are adding *right now* in the same bulk payload!
            # DB check:
            check_facilitator_overlap(db, payload.facilitator_id, payload.date, payload.start_time, payload.end_time)
            
            # In-memory check within the payload itself to prevent overlapping in the *same* request:
            for created_sess in new_sessions:
                if created_sess.facilitator_id == payload.facilitator_id and created_sess.date == payload.date:
                    if not (created_sess.end_time <= payload.start_time or created_sess.start_time >= payload.end_time):
                        raise HTTPException(
                            status_code=409,
                            detail=f"Conflicto interno en la generación: solapamiento del docente el {payload.date} ({payload.start_time.strftime('%H:%M')})"
                        )

        new_sess = WorkshopSession(workshop_id=workshop_id, **payload.model_dump())
        db.add(new_sess)
        new_sessions.append(new_sess)

    db.commit()
    for s in new_sessions:
        db.refresh(s)
    return new_sessions


def update_session(db: Session, workshop_id: UUID, session_id: UUID, payload: WorkshopSessionUpdate) -> WorkshopSession:
    db_session = get_session_for_workshop(db, workshop_id, session_id)

    update_data = payload.model_dump(exclude_unset=True)

    # Re-validate dates if date changes
    if "date" in update_data:
        validate_session_dates(db_session.workshop, update_data["date"])

    # Re-validate overlap if time, date or facilitator changes
    if any(k in update_data for k in ("date", "start_time", "end_time", "facilitator_id")):
        check_date = update_data.get("date", db_session.date)
        check_start = update_data.get("start_time", db_session.start_time)
        check_end = update_data.get("end_time", db_session.end_time)
        check_fac = update_data.get("facilitator_id", db_session.facilitator_id)
        if check_fac:
            check_facilitator_overlap(db, check_fac, check_date, check_start, check_end, exclude_session_id=session_id)

    for key, value in update_data.items():
        setattr(db_session, key, value)

    db.commit()
    db.refresh(db_session)
    return db_session


def delete_session(db: Session, workshop_id: UUID, session_id: UUID) -> None:
    db_session = get_session_for_workshop(db, workshop_id, session_id)
    db.delete(db_session)
    db.commit()


def bulk_delete_sessions(db: Session, workshop_id: UUID, session_ids: List[UUID]) -> None:
    # Validate the sessions belong to the workshop before deleting
    sessions = db.execute(
        select(WorkshopSession).where(
            WorkshopSession.id.in_(session_ids),
            WorkshopSession.workshop_id == workshop_id
        )
    ).scalars().all()
    
    if len(sessions) != len(session_ids):
        raise HTTPException(
            status_code=400, 
            detail="Algunos encuentros no existen o no pertenecen a este taller."
        )
        
    for s in sessions:
        db.delete(s)
        
    db.commit()
