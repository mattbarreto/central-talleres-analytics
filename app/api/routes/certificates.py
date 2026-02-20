import base64
import json
import secrets
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_admin, get_db
from app.models.certificate_center import CertificateCenter
from app.models.certificate_issue import CertificateIssue
from app.models.certificate_signer import CertificateSigner
from app.models.certificate_template import CertificateTemplate
from app.models.enrollment import Enrollment
from app.models.participant import Participant
from app.models.workshop import Workshop
from app.schemas.certificates import (
    CertificateCenterCreate,
    CertificateCenterOut,
    CertificateCenterUpdate,
    CertificateIssueCreate,
    CertificateIssueListOut,
    CertificateIssueOut,
    CertificatePendingOut,
    CertificateSignerIn,
    CertificateTemplateCreate,
    CertificateTemplateOut,
    CertificateTemplateUpdate,
    CertificateVerifyOut,
)

try:
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas
except Exception:  # pragma: no cover
    HexColor = None
    A4 = None
    landscape = None
    ImageReader = None
    canvas = None


router = APIRouter(prefix="/certificates", tags=["certificates"])

ROOT_DIR = Path(__file__).resolve().parents[3]
GENERATED_CERTS_DIR = ROOT_DIR / "generated" / "certificates"
GENERATED_CERTS_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_certificate_tables():
    # Schema must be provisioned via Alembic migrations.
    return


def _to_issue_out(issue: CertificateIssue) -> CertificateIssueOut:
    return CertificateIssueOut(
        id=issue.id,
        verification_code=issue.verification_code,
        participant_id=issue.participant_id,
        workshop_id=issue.workshop_id,
        center_id=issue.center_id,
        template_id=issue.template_id,
        issue_date=issue.issue_date,
        course_name=issue.course_name,
        course_description=issue.course_description,
        download_url=f"/api/v1/certificates/{issue.id}/pdf",
        verify_url=f"/api/v1/certificates/verify/{issue.verification_code}",
        created_at=issue.created_at,
    )


def _parse_data_url_image(data_url: str | None):
    if not data_url or not data_url.startswith("data:image/"):
        return None
    try:
        _, encoded = data_url.split(",", 1)
        raw = base64.b64decode(encoded)
        return ImageReader(BytesIO(raw))
    except Exception:
        return None


def _draw_wrapped_text(c: canvas.Canvas, text: str, x: float, y: float, max_width: float, line_height: float = 18):
    words = (text or "").split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if c.stringWidth(test, "Helvetica", 12) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    for line in lines:
        c.drawCentredString(x, y, line)
        y -= line_height
    return y


def _build_pdf(
    issue_id: UUID,
    center: CertificateCenter,
    template: CertificateTemplate,
    participant: Participant,
    workshop: Workshop,
    issue_date: date,
    course_name: str,
    course_description: str | None,
    verification_code: str,
    signers: list[CertificateSignerIn],
) -> Path:
    if canvas is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falta dependencia reportlab. Instalá: pip install reportlab",
        )

    pdf_path = GENERATED_CERTS_DIR / f"{issue_id}.pdf"
    width, height = landscape(A4)
    c = canvas.Canvas(str(pdf_path), pagesize=(width, height))

    primary = HexColor(center.primary_color or "#2D5BFF")
    secondary = HexColor(center.secondary_color or "#0F172A")

    c.setFillColor(primary)
    c.rect(0, height - 18, width, 18, stroke=0, fill=1)
    c.setFillColor(secondary)
    c.rect(0, 0, width, 12, stroke=0, fill=1)

    wm_text = center.watermark_text or "Certificado"
    if wm_text:
        c.saveState()
        try:
            c.setFillAlpha(max(0.02, min(center.watermark_opacity or 0.08, 0.25)))
        except Exception:
            pass
        c.setFillColor(primary)
        c.setFont("Helvetica-Bold", 72)
        c.translate(width / 2, height / 2)
        c.rotate(33)
        c.drawCentredString(0, 0, wm_text)
        c.restoreState()

    logo = _parse_data_url_image(center.logo_data_url)
    if logo:
        c.drawImage(logo, 42, height - 92, width=62, height=62, preserveAspectRatio=True, mask="auto")

    c.setFillColor(secondary)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(120, height - 52, center.name)
    c.setFont("Helvetica", 10)
    c.drawString(120, height - 68, center.legal_name or "")

    c.setFont("Helvetica-Bold", 34)
    c.drawCentredString(width / 2, height - 130, template.title_text or "Certificado")
    if template.subtitle_text:
        c.setFont("Helvetica", 14)
        c.drawCentredString(width / 2, height - 152, template.subtitle_text)

    participant_name = participant.name
    rendered_body = (template.body_template or "").format(
        participant_name=participant_name,
        workshop_name=workshop.name,
        course_name=course_name,
    )
    c.setFont("Helvetica", 13)
    y = height - 198
    y = _draw_wrapped_text(c, rendered_body, width / 2, y, width - 180, 20)

    description = course_description or template.default_description or ""
    if description:
        c.setFont("Helvetica", 12)
        y -= 10
        y = _draw_wrapped_text(c, description, width / 2, y, width - 220, 18)

    c.setFont("Helvetica-Bold", 15)
    y -= 14
    c.drawCentredString(width / 2, y, f"Curso/Taller: {course_name}")

    c.setFont("Helvetica", 11)
    y -= 26
    c.drawCentredString(width / 2, y, f"Emitido el {issue_date.strftime('%d/%m/%Y')}")

    signers_safe = signers[:4] if signers else []
    signer_base_y = 92
    if signers_safe:
        slot_width = (width - 120) / len(signers_safe)
        for idx, signer in enumerate(signers_safe):
            left = 60 + (slot_width * idx)
            center_x = left + (slot_width / 2)
            c.setStrokeColor(secondary)
            c.line(left + 20, signer_base_y, left + slot_width - 20, signer_base_y)
            signature = _parse_data_url_image(signer.signature_data_url)
            if signature:
                c.drawImage(signature, center_x - 56, signer_base_y + 6, width=112, height=40, preserveAspectRatio=True, mask="auto")
            c.setFont("Helvetica-Bold", 10)
            c.setFillColor(secondary)
            c.drawCentredString(center_x, signer_base_y - 13, signer.name)
            c.setFont("Helvetica", 9)
            c.drawCentredString(center_x, signer_base_y - 26, signer.role_title)

    c.setFont("Helvetica", 8)
    c.setFillColor(secondary)
    c.drawString(42, 26, f"Código de verificación: {verification_code}")
    if center.footer_text:
        c.drawRightString(width - 42, 26, center.footer_text[:140])

    c.showPage()
    c.save()
    return pdf_path


def _coalesce(obj, key: str, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


@router.get("/centers", response_model=list[CertificateCenterOut])
def list_centers(db: Session = Depends(get_db), _admin=Depends(get_current_admin)):
    _ensure_certificate_tables()
    return db.query(CertificateCenter).order_by(CertificateCenter.created_at.asc()).all()


@router.post("/centers", response_model=CertificateCenterOut)
def create_center(payload: CertificateCenterCreate, db: Session = Depends(get_db), _admin=Depends(get_current_admin)):
    _ensure_certificate_tables()
    center = CertificateCenter(**payload.model_dump())
    db.add(center)
    db.commit()
    db.refresh(center)
    return center


@router.put("/centers/{center_id}", response_model=CertificateCenterOut)
def update_center(center_id: UUID, payload: CertificateCenterUpdate, db: Session = Depends(get_db), _admin=Depends(get_current_admin)):
    _ensure_certificate_tables()
    center = db.query(CertificateCenter).filter(CertificateCenter.id == center_id).first()
    if not center:
        raise HTTPException(status_code=404, detail="Centro no encontrado")
    for key, value in payload.model_dump().items():
        setattr(center, key, value)
    db.commit()
    db.refresh(center)
    return center


@router.get("/templates", response_model=list[CertificateTemplateOut])
def list_templates(center_id: UUID | None = None, db: Session = Depends(get_db), _admin=Depends(get_current_admin)):
    _ensure_certificate_tables()
    q = db.query(CertificateTemplate).order_by(CertificateTemplate.created_at.asc())
    if center_id:
        q = q.filter(CertificateTemplate.center_id == center_id)
    return q.all()


@router.post("/templates", response_model=CertificateTemplateOut)
def create_template(payload: CertificateTemplateCreate, db: Session = Depends(get_db), _admin=Depends(get_current_admin)):
    _ensure_certificate_tables()
    center = db.query(CertificateCenter).filter(CertificateCenter.id == payload.center_id).first()
    if not center:
        raise HTTPException(status_code=404, detail="Centro no encontrado")
    template_data = payload.model_dump(exclude={"signers"})
    template = CertificateTemplate(**template_data)
    db.add(template)
    db.flush()
    for signer in payload.signers:
        db.add(CertificateSigner(template_id=template.id, **signer.model_dump()))
    db.commit()
    db.refresh(template)
    return template


@router.put("/templates/{template_id}", response_model=CertificateTemplateOut)
def update_template(template_id: UUID, payload: CertificateTemplateUpdate, db: Session = Depends(get_db), _admin=Depends(get_current_admin)):
    _ensure_certificate_tables()
    template = db.query(CertificateTemplate).filter(CertificateTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    data = payload.model_dump(exclude={"signers"})
    for key, value in data.items():
        setattr(template, key, value)
    db.query(CertificateSigner).filter(CertificateSigner.template_id == template.id).delete()
    for signer in payload.signers:
        db.add(CertificateSigner(template_id=template.id, **signer.model_dump()))
    db.commit()
    db.refresh(template)
    return template


@router.post("/issue", response_model=CertificateIssueOut)
def issue_certificate(payload: CertificateIssueCreate, db: Session = Depends(get_db), _admin=Depends(get_current_admin)):
    _ensure_certificate_tables()
    participant = db.query(Participant).filter(Participant.id == payload.participant_id).first()
    workshop = db.query(Workshop).filter(Workshop.id == payload.workshop_id).first()
    center = db.query(CertificateCenter).filter(CertificateCenter.id == payload.center_id).first()
    template = db.query(CertificateTemplate).filter(CertificateTemplate.id == payload.template_id).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participante no encontrado")
    if not workshop:
        raise HTTPException(status_code=404, detail="Taller no encontrado")
    if not center:
        raise HTTPException(status_code=404, detail="Centro no encontrado")
    if not template:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")

    signers_data = payload.signers or [
        CertificateSignerIn(
            name=s.name,
            role_title=s.role_title,
            signature_data_url=s.signature_data_url,
            sort_order=s.sort_order,
        )
        for s in sorted(template.signers, key=lambda x: x.sort_order)
    ]
    center_overrides = payload.center_overrides or {}
    template_overrides = payload.template_overrides or {}
    effective_center = SimpleNamespace(
        name=_coalesce(center_overrides, "name", center.name),
        legal_name=_coalesce(center_overrides, "legal_name", center.legal_name),
        logo_data_url=_coalesce(center_overrides, "logo_data_url", center.logo_data_url),
        primary_color=_coalesce(center_overrides, "primary_color", center.primary_color),
        secondary_color=_coalesce(center_overrides, "secondary_color", center.secondary_color),
        watermark_text=_coalesce(center_overrides, "watermark_text", center.watermark_text),
        watermark_opacity=float(_coalesce(center_overrides, "watermark_opacity", center.watermark_opacity) or 0.08),
        footer_text=_coalesce(center_overrides, "footer_text", center.footer_text),
    )
    effective_template = SimpleNamespace(
        name=_coalesce(template_overrides, "name", template.name),
        title_text=_coalesce(template_overrides, "title_text", template.title_text),
        subtitle_text=_coalesce(template_overrides, "subtitle_text", template.subtitle_text),
        body_template=_coalesce(template_overrides, "body_template", template.body_template),
        default_description=_coalesce(template_overrides, "default_description", template.default_description),
        orientation=_coalesce(template_overrides, "orientation", template.orientation),
        paper_size=_coalesce(template_overrides, "paper_size", template.paper_size),
    )
    verification_code = secrets.token_hex(6).upper()
    issue = CertificateIssue(
        verification_code=verification_code,
        participant_id=participant.id,
        workshop_id=workshop.id,
        center_id=center.id,
        template_id=template.id,
        issue_date=payload.issue_date,
        course_name=payload.course_name,
        course_description=payload.course_description,
        issued_payload_json=json.dumps(
            {
                "participant_name": participant.name,
                "workshop_name": workshop.name,
                "center_name": effective_center.name,
                "template_name": effective_template.name,
                "center_overrides": center_overrides,
                "template_overrides": template_overrides,
                "signers": [s.model_dump() for s in signers_data],
            },
            ensure_ascii=False,
        ),
        pdf_path="",
    )
    db.add(issue)
    db.flush()

    pdf_path = _build_pdf(
        issue_id=issue.id,
        center=effective_center,
        template=effective_template,
        participant=participant,
        workshop=workshop,
        issue_date=payload.issue_date,
        course_name=payload.course_name,
        course_description=payload.course_description,
        verification_code=verification_code,
        signers=signers_data,
    )
    issue.pdf_path = str(pdf_path)
    db.commit()
    db.refresh(issue)
    return _to_issue_out(issue)


@router.get("/pending", response_model=list[CertificatePendingOut])
def list_pending_certificates(
    q: str | None = None,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    _ensure_certificate_tables()
    term = (q or "").strip().lower()
    rows = (
        db.query(
            Enrollment.participant_id,
            Participant.name.label("participant_name"),
            Enrollment.workshop_id,
            Workshop.name.label("workshop_name"),
            Workshop.cohort_year,
            Enrollment.updated_at.label("finished_at"),
        )
        .join(Participant, Participant.id == Enrollment.participant_id)
        .join(Workshop, Workshop.id == Enrollment.workshop_id)
        .filter(Enrollment.status == "finished")
        .all()
    )
    issued_pairs = {
        (str(i.participant_id), str(i.workshop_id))
        for i in db.query(CertificateIssue.participant_id, CertificateIssue.workshop_id).all()
    }
    out: list[CertificatePendingOut] = []
    for r in rows:
        if (str(r.participant_id), str(r.workshop_id)) in issued_pairs:
            continue
        if term and term not in (f"{r.participant_name} {r.workshop_name}").lower():
            continue
        out.append(
            CertificatePendingOut(
                participant_id=r.participant_id,
                participant_name=r.participant_name,
                workshop_id=r.workshop_id,
                workshop_name=r.workshop_name,
                cohort_year=r.cohort_year,
                finished_at=r.finished_at,
            )
        )
    out.sort(key=lambda x: (x.finished_at or datetime.min), reverse=True)
    return out


@router.get("/issues", response_model=list[CertificateIssueListOut])
def list_issues(
    q: str | None = None,
    center_id: UUID | None = None,
    template_id: UUID | None = None,
    participant_id: UUID | None = None,
    workshop_id: UUID | None = None,
    db: Session = Depends(get_db),
    _admin=Depends(get_current_admin),
):
    _ensure_certificate_tables()
    term = (q or "").strip().lower()
    query = (
        db.query(CertificateIssue, Participant.name.label("participant_name"), Workshop.name.label("workshop_name"), CertificateCenter.name.label("center_name"), CertificateTemplate.name.label("template_name"))
        .join(Participant, Participant.id == CertificateIssue.participant_id)
        .join(Workshop, Workshop.id == CertificateIssue.workshop_id)
        .join(CertificateCenter, CertificateCenter.id == CertificateIssue.center_id)
        .join(CertificateTemplate, CertificateTemplate.id == CertificateIssue.template_id)
    )
    if center_id:
        query = query.filter(CertificateIssue.center_id == center_id)
    if template_id:
        query = query.filter(CertificateIssue.template_id == template_id)
    if participant_id:
        query = query.filter(CertificateIssue.participant_id == participant_id)
    if workshop_id:
        query = query.filter(CertificateIssue.workshop_id == workshop_id)
    rows = query.order_by(CertificateIssue.created_at.desc()).all()
    out: list[CertificateIssueListOut] = []
    for issue, participant_name, workshop_name, center_name, template_name in rows:
        if term and term not in f"{participant_name} {workshop_name} {issue.verification_code}".lower():
            continue
        out.append(
            CertificateIssueListOut(
                id=issue.id,
                verification_code=issue.verification_code,
                participant_id=issue.participant_id,
                participant_name=participant_name,
                workshop_id=issue.workshop_id,
                workshop_name=workshop_name,
                center_id=issue.center_id,
                center_name=center_name,
                template_id=issue.template_id,
                template_name=template_name,
                issue_date=issue.issue_date,
                course_name=issue.course_name,
                created_at=issue.created_at,
            )
        )
    return out


@router.get("/{issue_id}/pdf")
def download_issue_pdf(issue_id: UUID, db: Session = Depends(get_db), _admin=Depends(get_current_admin)):
    _ensure_certificate_tables()
    issue = db.query(CertificateIssue).filter(CertificateIssue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=404, detail="Certificado no encontrado")
    file_path = Path(issue.pdf_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo PDF no encontrado")
    return FileResponse(str(file_path), media_type="application/pdf", filename=f"certificado_{issue.verification_code}.pdf")


@router.get("/verify/{verification_code}", response_model=CertificateVerifyOut)
def verify_certificate(verification_code: str, db: Session = Depends(get_db)):
    _ensure_certificate_tables()
    issue = (
        db.query(CertificateIssue)
        .filter(CertificateIssue.verification_code == verification_code.upper())
        .first()
    )
    if not issue:
        raise HTTPException(status_code=404, detail="Código inválido")
    participant = db.query(Participant).filter(Participant.id == issue.participant_id).first()
    workshop = db.query(Workshop).filter(Workshop.id == issue.workshop_id).first()
    center = db.query(CertificateCenter).filter(CertificateCenter.id == issue.center_id).first()
    if not participant or not workshop or not center:
        raise HTTPException(status_code=404, detail="Certificado incompleto")
    return CertificateVerifyOut(
        verification_code=issue.verification_code,
        issued_at=issue.created_at,
        issue_date=issue.issue_date,
        participant_name=participant.name,
        workshop_name=workshop.name,
        center_name=center.name,
        course_name=issue.course_name,
        valid=True,
    )


@router.post("/bootstrap", response_model=dict)
def bootstrap_defaults(db: Session = Depends(get_db), _admin=Depends(get_current_admin)):
    _ensure_certificate_tables()
    center = db.query(CertificateCenter).first()
    if not center:
        center = CertificateCenter(
            name="Centro de Talleres",
            legal_name="Centro de Talleres Comunitarios",
            watermark_text="CENTRO DE TALLERES",
            footer_text="Documento generado por Central de Talleres",
        )
        db.add(center)
        db.flush()
    template = db.query(CertificateTemplate).filter(CertificateTemplate.center_id == center.id).first()
    if not template:
        template = CertificateTemplate(
            center_id=center.id,
            name="Plantilla institucional",
            title_text="Certificado de participación",
            subtitle_text="Programa de formación",
            body_template="Se certifica que {participant_name} participó del curso/taller {course_name}.",
            default_description="Este certificado acredita participación y/o aprobación según registros institucionales.",
        )
        db.add(template)
        db.flush()
        db.add_all(
            [
                CertificateSigner(template_id=template.id, name="Coordinación Académica", role_title="Coordinador/a", sort_order=1),
                CertificateSigner(template_id=template.id, name="Dirección del Centro", role_title="Director/a", sort_order=2),
            ]
        )
    db.commit()
    return {"ok": True, "center_id": str(center.id), "template_id": str(template.id)}
