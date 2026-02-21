from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import Lock
from typing import Callable
from uuid import uuid4


@dataclass
class ReportJob:
    id: str
    status: str = "pending"
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None
    content: bytes | None = None
    filename: str | None = None
    media_type: str | None = None


class ReportJobStore:
    def __init__(self, ttl_seconds: int = 3600, max_jobs: int = 300):
        self._jobs: dict[str, ReportJob] = {}
        self._lock = Lock()
        self._ttl_seconds = ttl_seconds
        self._max_jobs = max_jobs

    def _prune_locked(self):
        now = datetime.now(UTC)
        to_delete = []
        for job_id, job in self._jobs.items():
            age = (now - job.created_at).total_seconds()
            if age > self._ttl_seconds:
                to_delete.append(job_id)
        for job_id in to_delete:
            self._jobs.pop(job_id, None)

        if len(self._jobs) <= self._max_jobs:
            return
        # Keep most recently updated jobs when cap is exceeded.
        ordered = sorted(self._jobs.values(), key=lambda j: j.updated_at, reverse=True)
        keep = {job.id for job in ordered[: self._max_jobs]}
        for job_id in list(self._jobs.keys()):
            if job_id not in keep:
                self._jobs.pop(job_id, None)

    def create(self) -> ReportJob:
        job = ReportJob(id=str(uuid4()))
        with self._lock:
            self._prune_locked()
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> ReportJob | None:
        with self._lock:
            self._prune_locked()
            return self._jobs.get(job_id)

    def run(self, job_id: str, builder: Callable[[], tuple[bytes, str, str]]):
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.status = "running"
            job.started_at = datetime.now(UTC)
            job.updated_at = datetime.now(UTC)
        try:
            content, filename, media_type = builder()
            with self._lock:
                job = self._jobs.get(job_id)
                if not job:
                    return
                job.status = "completed"
                job.content = content
                job.filename = filename
                job.media_type = media_type
                job.finished_at = datetime.now(UTC)
                job.updated_at = datetime.now(UTC)
        except Exception as exc:  # pragma: no cover - defensive path
            with self._lock:
                job = self._jobs.get(job_id)
                if not job:
                    return
                job.status = "failed"
                job.error = str(exc)
                job.finished_at = datetime.now(UTC)
                job.updated_at = datetime.now(UTC)


report_job_store = ReportJobStore()
