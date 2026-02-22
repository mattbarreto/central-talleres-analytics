import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.api.deps import get_current_admin
from app.services.report_jobs import report_job_store


router = APIRouter(prefix="/report-jobs", tags=["report-jobs"])
logger = logging.getLogger("app.api.report_jobs")


@router.get("/metrics")
def report_jobs_metrics(_: str = Depends(get_current_admin)):
    try:
        return report_job_store.metrics()
    except Exception as exc:
        logger.exception("report_jobs_metrics_unavailable")
        raise HTTPException(status_code=503, detail="Sistema de reportes temporalmente no disponible") from exc


@router.delete("/cleanup")
def report_jobs_cleanup(older_than_hours: int = 24, _: str = Depends(get_current_admin)):
    try:
        deleted = report_job_store.cleanup(older_than_hours=older_than_hours)
    except Exception as exc:
        logger.exception("report_jobs_cleanup_unavailable")
        raise HTTPException(status_code=503, detail="Sistema de reportes temporalmente no disponible") from exc
    return {"deleted": deleted}


@router.get("/{job_id}")
def report_job_status(job_id: str, _: str = Depends(get_current_admin)):
    try:
        job = report_job_store.get(job_id)
    except Exception as exc:
        logger.exception("report_job_status_unavailable", extra={"job_id": job_id})
        raise HTTPException(status_code=503, detail="Sistema de reportes temporalmente no disponible") from exc
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    duration_ms = None
    if job.started_at and job.finished_at:
        duration_ms = round((job.finished_at - job.started_at).total_seconds() * 1000, 2)
    return {
        "job_id": job.id,
        "status": job.status,
        "error": job.error,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "duration_ms": duration_ms,
        "ready": job.status == "completed",
    }


@router.get("/{job_id}/download")
def report_job_download(job_id: str, _: str = Depends(get_current_admin)):
    try:
        job = report_job_store.get(job_id)
    except Exception as exc:
        logger.exception("report_job_download_unavailable", extra={"job_id": job_id})
        raise HTTPException(status_code=503, detail="Sistema de reportes temporalmente no disponible") from exc
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    if job.status != "completed" or not job.content or not job.filename or not job.media_type:
        raise HTTPException(status_code=409, detail=f"Job no disponible para descarga (estado: {job.status})")
    return Response(
        content=job.content,
        media_type=job.media_type,
        headers={"Content-Disposition": f'attachment; filename="{job.filename}"'},
    )
