from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
from app.models.certificate_center import CertificateCenter
from app.models.certificate_issue import CertificateIssue
from app.models.certificate_signer import CertificateSigner
from app.models.certificate_template import CertificateTemplate


app = FastAPI(title=settings.app_name)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(
        bind=engine,
        tables=[
            CertificateCenter.__table__,
            CertificateTemplate.__table__,
            CertificateSigner.__table__,
            CertificateIssue.__table__,
        ],
    )

# Serve frontend
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return FileResponse(str(FRONTEND_DIR / "index.html"))
