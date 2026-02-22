from __future__ import annotations

import base64
import time
from datetime import date
from io import BytesIO
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status

from app.core.config import settings

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


ROOT_DIR = Path(__file__).resolve().parents[2]
GENERATED_CERTS_DIR = ROOT_DIR / "generated" / "certificates"
GENERATED_CERTS_DIR.mkdir(parents=True, exist_ok=True)


def parse_data_url_image(data_url: str | None):
    if not data_url or not data_url.startswith("data:image/"):
        return None
    try:
        _, encoded = data_url.split(",", 1)
        raw = base64.b64decode(encoded)
        return ImageReader(BytesIO(raw))
    except Exception:
        return None


def draw_wrapped_text(c: canvas.Canvas, text: str, x: float, y: float, max_width: float, line_height: float = 18):
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


def cleanup_generated_pdfs() -> int:
    retention_days = max(1, int(settings.certificates_retention_days))
    threshold = time.time() - (retention_days * 24 * 60 * 60)
    removed = 0
    for file_path in GENERATED_CERTS_DIR.glob("*.pdf"):
        try:
            if file_path.stat().st_mtime < threshold:
                file_path.unlink(missing_ok=True)
                removed += 1
        except Exception:
            continue
    return removed


def build_pdf(
    issue_id: UUID,
    center,
    template,
    participant,
    workshop,
    issue_date: date,
    course_name: str,
    course_description: str | None,
    verification_code: str,
    signers: list,
) -> Path:
    if canvas is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falta dependencia reportlab. Instalá: pip install reportlab",
        )

    cleanup_generated_pdfs()

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

    logo = parse_data_url_image(center.logo_data_url)
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
    y = draw_wrapped_text(c, rendered_body, width / 2, y, width - 180, 20)

    description = course_description or template.default_description or ""
    if description:
        c.setFont("Helvetica", 12)
        y -= 10
        y = draw_wrapped_text(c, description, width / 2, y, width - 220, 18)

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
            signature = parse_data_url_image(signer.signature_data_url)
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
