from __future__ import annotations

from datetime import UTC, datetime, timedelta
from io import BytesIO
from typing import Any

try:
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
except Exception:  # pragma: no cover
    HexColor = None
    A4 = None
    canvas = None

from app.core.pdf_utils import draw_bar_list, draw_kpi_grid, draw_pdf_header, draw_story_box, draw_table


def _ensure_reportlab():
    if HexColor is None or A4 is None or canvas is None:
        raise RuntimeError("Falta dependencia reportlab para exportar PDF")


def _month_label(dt: datetime) -> str:
    names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    return f"{names[dt.month - 1]} {str(dt.year)[2:]}"


def _series_6m(rows: list[datetime]):
    now = datetime.now(UTC)
    keys = []
    for i in range(5, -1, -1):
        d = datetime(now.year, now.month, 1, tzinfo=UTC) - timedelta(days=30 * i)
        keys.append((d.year, d.month))
    agg = {(y, m): 0 for y, m in keys}
    for dt in rows:
        if not dt:
            continue
        key = (dt.year, dt.month)
        if key in agg:
            agg[key] += 1
    out = []
    for y, m in keys:
        out.append({"label": _month_label(datetime(y, m, 1, tzinfo=UTC)), "value": agg[(y, m)]})
    return out


def build_insights_pdf_bytes(payload: dict[str, Any], period_label: str) -> bytes:
    _ensure_reportlab()
    kpis = payload.get("kpis", {})
    series = payload.get("series", [])
    top_workshops = payload.get("top_workshops_by_enrollments", [])
    top_staff = payload.get("top_staff_by_activity", [])
    top_participants = payload.get("top_participants_by_activity", [])
    alerts = payload.get("alerts", [])
    funnel = payload.get("funnel", [])

    top_workshop = top_workshops[0] if top_workshops else None
    top_staff_row = top_staff[0] if top_staff else None
    story = [
        f"Se registran {kpis.get('enrollments_total', 0)} inscripciones y {kpis.get('communications_total', 0)} comunicaciones.",
        (f"Taller destacado: {top_workshop.get('workshop_name')} con {top_workshop.get('enrollments_total', 0)} inscripciones." if top_workshop else "No hay taller destacado para el filtro actual."),
        (f"Perfil mas activo: {top_staff_row.get('name')} ({top_staff_row.get('role')}) con {top_staff_row.get('workshops_count', 0)} talleres." if top_staff_row else "No hay actividad de equipo para el filtro actual."),
    ]

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4
    content_w = page_w - 52

    draw_pdf_header(c, page_w, page_h, "Reporte ejecutivo con narrativa - Insights", f"Periodo {period_label}")
    y = page_h - 66
    c.setFillColor(HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(26, y, "Senales clave")
    y -= 8
    y = draw_kpi_grid(
        c,
        26,
        y,
        content_w,
        [
            ("Inscripciones", int(kpis.get("enrollments_total", 0) or 0), "blue"),
            ("Activos", int(kpis.get("active_enrollments_total", 0) or 0), "green"),
            ("Finalizados", int(kpis.get("finished_enrollments_total", 0) or 0), "amber"),
            ("Comunicaciones", int(kpis.get("communications_total", 0) or 0), "brand"),
            ("Equipo activo", int(kpis.get("active_team_members", 0) or 0), "blue"),
            ("Participantes activos", int(kpis.get("active_participants_total", 0) or 0), "green"),
        ],
    )
    y = draw_story_box(c, 26, y, content_w, story, bullet="*")
    y = draw_bar_list(c, series, 26, y, content_w, "Inscripciones por periodo", "enrollments", "#60a5fa")
    y = draw_bar_list(c, series, 26, y, content_w, "Comunicaciones por periodo", "communications", "#34d399")
    y = draw_bar_list(c, funnel, 26, y, content_w, "Embudo de trayectoria", "total", "#8b5cf6")

    c.showPage()
    draw_pdf_header(c, page_w, page_h, "Detalle analitico", "Comparativas y rankings")
    y = page_h - 72
    c.setFillColor(HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(26, y, "Comparacion con periodo anterior")
    y -= 14
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(26, y, "Metrica")
    c.drawString(230, y, "Actual")
    c.drawString(290, y, "Anterior")
    c.drawString(360, y, "Delta %")
    y -= 8
    c.setStrokeColor(HexColor("#d6deea"))
    c.line(26, y, page_w - 26, y)
    y -= 10
    c.setFont("Helvetica", 8.5)
    for row in (payload.get("comparisons", []) or [])[:8]:
        c.drawString(26, y, str(row.get("label", "-"))[:34])
        c.drawString(230, y, str(row.get("current", 0)))
        c.drawString(290, y, str(row.get("previous", 0)))
        c.drawString(360, y, f"{row.get('delta_pct', 0)}%")
        y -= 10

    y -= 10
    c.setFont("Helvetica-Bold", 10)
    c.drawString(26, y, "Top talleres por convocatoria")
    y -= 12
    c.setFont("Helvetica", 8.5)
    for w in top_workshops[:8]:
        c.drawString(26, y, f"{w.get('workshop_name', '-')[:36]} ({w.get('cohort_year', '-')})")
        c.drawRightString(page_w - 26, y, f"{w.get('enrollments_total', 0)} inscripciones")
        y -= 10

    y -= 6
    c.setFont("Helvetica-Bold", 10)
    c.drawString(26, y, "Top personas por actividad")
    y -= 12
    c.setFont("Helvetica", 8.5)
    for p in top_participants[:8]:
        c.drawString(26, y, f"{p.get('name', '-')[:36]}")
        c.drawRightString(page_w - 26, y, f"{p.get('workshops_total', 0)} talleres")
        y -= 10

    if alerts:
        y -= 6
        c.setFont("Helvetica-Bold", 10)
        c.drawString(26, y, "Alertas")
        y -= 12
        c.setFont("Helvetica", 8.5)
        for a in alerts[:4]:
            c.drawString(26, y, f"- {str(a.get('title', 'Info'))}: {str(a.get('message', ''))[:92]}")
            y -= 10

    c.showPage()
    c.save()
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


def build_dashboard_pdf_bytes(
    workshops: list[Any],
    enrollments: list[Any],
    communications: list[Any],
    range_key: str,
    year: str | None,
    status: str | None,
) -> bytes:
    _ensure_reportlab()
    participant_ids = {e.participant_id for e in enrollments}
    active = sum(1 for e in enrollments if e.status == "active")
    finished = sum(1 for e in enrollments if e.status == "finished")
    dropped = sum(1 for e in enrollments if e.status == "dropped")
    progress = round((finished / len(enrollments)) * 100) if enrollments else 0

    by_workshop: dict[str, int] = {}
    for e in enrollments:
        wk = str(e.workshop_id)
        by_workshop[wk] = by_workshop.get(wk, 0) + 1
    top = None
    if by_workshop:
        top_id = max(by_workshop.items(), key=lambda x: x[1])[0]
        top = next((w for w in workshops if str(w.id) == top_id), None)

    story = [
        f"El panel concentra {len(workshops)} talleres y {len(participant_ids)} participantes unicos.",
        (f"Convocatoria lider: {top.name} con {by_workshop.get(str(top.id), 0)} inscripciones." if top else "No hay un taller dominante en este recorte."),
        f"Resultado de trayectoria: {progress}% finalizados, {active} activos y {dropped} bajas.",
    ]

    enroll_series = _series_6m([e.created_at for e in enrollments if e.created_at])
    comm_series = _series_6m([c.created_at for c in communications if c.created_at])

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4
    content_w = page_w - 52

    draw_pdf_header(c, page_w, page_h, "Reporte ejecutivo del panel", f"Rango {range_key} | Ano {year or 'Todos'} | Estado {status or 'Todos'}", bg_hex="#0f172a")
    y = page_h - 66
    c.setFillColor(HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(26, y, "Senales clave")
    y -= 8
    y = draw_kpi_grid(
        c,
        26,
        y,
        content_w,
        [
            ("Talleres", len(workshops), "brand"),
            ("Participantes unicos", len(participant_ids), "blue"),
            ("Inscripciones", len(enrollments), "green"),
            ("Activos", active, "blue"),
            ("Finalizados", finished, "green"),
            ("Comunicaciones", len(communications), "amber"),
        ],
    )
    y = draw_story_box(c, 26, y, content_w, story, bullet="*")
    y = draw_bar_list(c, enroll_series, 26, y, content_w, "Inscripciones por mes (ultimos 6 meses)", "value", "#60a5fa")
    y = draw_bar_list(c, comm_series, 26, y, content_w, "Comunicaciones por mes (ultimos 6 meses)", "value", "#34d399")

    c.showPage()
    draw_pdf_header(c, page_w, page_h, "Detalle operativo", "Talleres recientes y estado", bg_hex="#0f172a")
    y = page_h - 70
    rows: list[list[str]] = []
    for w in workshops:
        rows.append(
            [
                w.name,
                str(w.cohort_year or "-"),
                str(w.status or "-"),
                w.created_at.strftime("%d/%m/%Y") if w.created_at else "-",
            ]
        )
    draw_table(c, 26, y, content_w, ["Taller", "Ano", "Estado", "Creado"], rows, max_rows=34)
    c.showPage()
    c.save()

    out = buffer.getvalue()
    buffer.close()
    return out
