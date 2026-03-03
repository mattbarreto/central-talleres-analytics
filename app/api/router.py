from fastapi import APIRouter

from app.api.routes import (
    admins,
    auth,
    certificates,
    communications,
    dashboard,
    enrollments,
    executive_snapshots,
    insights,
    interests,
    metrics,
    operations,
    participants,
    report_jobs,
    resource_terms,
    session_resources,
    sessions,
    team_members,
    work_items,
    workshops,
)


api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(admins.router)
api_router.include_router(workshops.router)
api_router.include_router(participants.router)
api_router.include_router(team_members.router)
api_router.include_router(enrollments.router)
api_router.include_router(communications.router)
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(metrics.router)
api_router.include_router(insights.router)
api_router.include_router(operations.router)
api_router.include_router(certificates.router)
api_router.include_router(report_jobs.router)
api_router.include_router(sessions.router)
api_router.include_router(work_items.router)
api_router.include_router(resource_terms.router)
api_router.include_router(session_resources.router)
api_router.include_router(interests.router)
api_router.include_router(executive_snapshots.router)
