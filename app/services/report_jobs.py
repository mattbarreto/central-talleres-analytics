from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Callable
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.report_job import ReportJobRecord

logger = logging.getLogger("app.services.report_jobs")


@dataclass
class ReportJob:
    id: str
    status: str
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None
    content: bytes | None
    filename: str | None
    media_type: str | None


class ReportJobStore:
    def __init__(self, session_factory: sessionmaker[Session], ttl_seconds: int = 3600, max_jobs: int = 300):
        self._session_factory = session_factory
        self._ttl_seconds = ttl_seconds
        self._max_jobs = max_jobs
        self._schema_lock = Lock()
        self._schema_checked = False

    def _now(self) -> datetime:
        return datetime.now(UTC)

    def _expires_at(self, from_dt: datetime | None = None) -> datetime:
        return (from_dt or self._now()) + timedelta(seconds=self._ttl_seconds)

    @staticmethod
    def _to_public(row: ReportJobRecord) -> ReportJob:
        return ReportJob(
            id=row.id,
            status=row.status,
            created_at=row.created_at,
            updated_at=row.updated_at,
            started_at=row.started_at,
            finished_at=row.finished_at,
            error=row.error,
            content=row.content,
            filename=row.filename,
            media_type=row.media_type,
        )

    def _ensure_schema(self, db: Session):
        if self._schema_checked:
            return
        with self._schema_lock:
            if self._schema_checked:
                return
            ReportJobRecord.__table__.create(bind=db.bind, checkfirst=True)
            self._schema_checked = True

    def _prune_expired_locked(self, db: Session) -> int:
        now = self._now()
        deleted = (
            db.query(ReportJobRecord)
            .filter(ReportJobRecord.expires_at < now)
            .delete(synchronize_session=False)
        )
        return int(deleted or 0)

    def _enforce_max_locked(self, db: Session) -> int:
        total = int(db.query(func.count(ReportJobRecord.id)).scalar() or 0)
        overflow = total - self._max_jobs
        if overflow <= 0:
            return 0
        oldest_ids_stmt = select(ReportJobRecord.id).order_by(ReportJobRecord.updated_at.asc()).limit(overflow)
        ids_to_drop = [row[0] for row in db.execute(oldest_ids_stmt).all()]
        if not ids_to_drop:
            return 0
        deleted = (
            db.query(ReportJobRecord)
            .filter(ReportJobRecord.id.in_(ids_to_drop))
            .delete(synchronize_session=False)
        )
        return int(deleted or 0)

    def create(self) -> ReportJob:
        now = self._now()
        row = ReportJobRecord(
            id=str(uuid4()),
            status="pending",
            created_at=now,
            updated_at=now,
            expires_at=self._expires_at(now),
        )
        with self._session_factory() as db:
            self._ensure_schema(db)
            self._prune_expired_locked(db)
            db.add(row)
            self._enforce_max_locked(db)
            db.commit()
            db.refresh(row)
            return self._to_public(row)

    def get(self, job_id: str) -> ReportJob | None:
        with self._session_factory() as db:
            self._ensure_schema(db)
            self._prune_expired_locked(db)
            row = db.query(ReportJobRecord).filter(ReportJobRecord.id == job_id).first()
            db.commit()
            if not row:
                return None
            return self._to_public(row)

    def run(self, job_id: str, builder: Callable[[], tuple[bytes, str, str]]):
        now = self._now()
        with self._session_factory() as db:
            self._ensure_schema(db)
            row = db.query(ReportJobRecord).filter(ReportJobRecord.id == job_id).first()
            if not row:
                return
            row.status = "running"
            row.started_at = now
            row.updated_at = now
            row.expires_at = self._expires_at(now)
            db.commit()

        try:
            content, filename, media_type = builder()
            finish = self._now()
            with self._session_factory() as db:
                self._ensure_schema(db)
                row = db.query(ReportJobRecord).filter(ReportJobRecord.id == job_id).first()
                if not row:
                    return
                row.status = "completed"
                row.content = content
                row.filename = filename
                row.media_type = media_type
                row.finished_at = finish
                row.updated_at = finish
                row.expires_at = self._expires_at(finish)
                row.error = None
                self._prune_expired_locked(db)
                self._enforce_max_locked(db)
                db.commit()
        except Exception:  # pragma: no cover - defensive path
            finish = self._now()
            logger.exception("report_job_builder_failed", extra={"job_id": job_id})
            with self._session_factory() as db:
                self._ensure_schema(db)
                row = db.query(ReportJobRecord).filter(ReportJobRecord.id == job_id).first()
                if not row:
                    return
                row.status = "failed"
                row.error = "No se pudo generar el reporte"
                row.finished_at = finish
                row.updated_at = finish
                row.expires_at = self._expires_at(finish)
                self._prune_expired_locked(db)
                self._enforce_max_locked(db)
                db.commit()

    def cleanup(self, older_than_hours: int = 24) -> int:
        threshold = self._now() - timedelta(hours=max(1, older_than_hours))
        with self._session_factory() as db:
            self._ensure_schema(db)
            self._prune_expired_locked(db)
            deleted = (
                db.query(ReportJobRecord)
                .filter(ReportJobRecord.status.in_(["completed", "failed"]))
                .filter(ReportJobRecord.finished_at.is_not(None))
                .filter(ReportJobRecord.finished_at < threshold)
                .delete(synchronize_session=False)
            )
            self._enforce_max_locked(db)
            db.commit()
            return int(deleted or 0)

    def metrics(self) -> dict:
        now = self._now()
        since_24h = now - timedelta(hours=24)
        with self._session_factory() as db:
            self._ensure_schema(db)
            self._prune_expired_locked(db)

            status_rows = (
                db.query(ReportJobRecord.status, func.count(ReportJobRecord.id))
                .group_by(ReportJobRecord.status)
                .all()
            )
            by_status = {status: int(total or 0) for status, total in status_rows}
            total_jobs = int(sum(by_status.values()))

            recent_rows = (
                db.query(ReportJobRecord.started_at, ReportJobRecord.finished_at)
                .filter(ReportJobRecord.status == "completed")
                .filter(ReportJobRecord.finished_at.is_not(None))
                .filter(ReportJobRecord.finished_at >= since_24h)
                .all()
            )
            durations_ms = [
                (finish - start).total_seconds() * 1000
                for start, finish in recent_rows
                if start and finish and finish >= start
            ]
            avg_duration_ms_24h = round(sum(durations_ms) / len(durations_ms), 2) if durations_ms else 0.0

            oldest_pending = (
                db.query(ReportJobRecord.created_at)
                .filter(ReportJobRecord.status.in_(["pending", "running"]))
                .order_by(ReportJobRecord.created_at.asc())
                .first()
            )
            oldest_pending_age_s = 0.0
            if oldest_pending and oldest_pending[0]:
                oldest_pending_age_s = max(0.0, (now - oldest_pending[0]).total_seconds())

            db.commit()
            return {
                "total_jobs": total_jobs,
                "status_counts": {
                    "pending": by_status.get("pending", 0),
                    "running": by_status.get("running", 0),
                    "completed": by_status.get("completed", 0),
                    "failed": by_status.get("failed", 0),
                },
                "avg_duration_ms_24h": avg_duration_ms_24h,
                "oldest_pending_age_s": round(oldest_pending_age_s, 2),
                "ttl_seconds": self._ttl_seconds,
                "max_jobs": self._max_jobs,
            }


report_job_store = ReportJobStore(
    session_factory=SessionLocal,
    ttl_seconds=settings.report_jobs_ttl_seconds,
    max_jobs=settings.report_jobs_max_jobs,
)
