from fastapi import APIRouter

from app.api.routes import admins, auth, certificates, communications, enrollments, insights, metrics, participants, report_jobs, team_members, workshops


api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(admins.router)
api_router.include_router(workshops.router)
api_router.include_router(participants.router)
api_router.include_router(team_members.router)
api_router.include_router(enrollments.router)
api_router.include_router(communications.router)
api_router.include_router(metrics.router)
api_router.include_router(insights.router)
api_router.include_router(certificates.router)
api_router.include_router(report_jobs.router)
