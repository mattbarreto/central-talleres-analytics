from __future__ import annotations

from datetime import UTC, datetime
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

from app.core.pdf_utils import (
    draw_bar_list,
    draw_dual_line_chart,
    draw_editorial_header,
    draw_highlighted_bar_chart,
    draw_insight_panel,
    draw_kpi_grid,
    draw_kpi_strip,
    draw_lollipop_rank_chart,
    draw_minimal_table,
    draw_page_footer,
    draw_pdf_header,
    draw_section_heading,
    draw_stacked_composition_bar,
    draw_story_box,
    draw_table,
)


def _ensure_reportlab():
    if HexColor is None or A4 is None or canvas is None:
        raise RuntimeError("Falta dependencia reportlab para exportar PDF")


def _month_label(dt: datetime) -> str:
    names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    return f"{names[dt.month - 1]} {str(dt.year)[2:]}"


def _series_6m(rows: list[datetime]):
    return _series_months(rows, months=6)


def _series_months(rows: list[datetime], months: int = 12):
    now = datetime.now(UTC)
    y = now.year
    m = now.month
    keys: list[tuple[int, int]] = []
    for _ in range(months):
        keys.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    keys.reverse()

    agg = {(yy, mm): 0 for yy, mm in keys}
    for dt in rows:
        if not dt:
            continue
        key = (dt.year, dt.month)
        if key in agg:
            agg[key] += 1
    out = []
    for yy, mm in keys:
        out.append({"label": _month_label(datetime(yy, mm, 1, tzinfo=UTC)), "value": agg[(yy, mm)]})
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
    total_enrollments = len(enrollments)
    total_communications = len(communications)
    active = sum(1 for e in enrollments if e.status == "active")
    finished = sum(1 for e in enrollments if e.status == "finished")
    dropped = sum(1 for e in enrollments if e.status == "dropped")
    progress = round((finished / total_enrollments) * 100, 1) if total_enrollments else 0.0
    drop_rate = round((dropped / total_enrollments) * 100, 1) if total_enrollments else 0.0

    by_workshop: dict[str, int] = {}
    participants_by_workshop: dict[str, set[str]] = {}
    for e in enrollments:
        wk = str(e.workshop_id)
        by_workshop[wk] = by_workshop.get(wk, 0) + 1
        participants_by_workshop.setdefault(wk, set()).add(str(e.participant_id))

    workshop_names = {str(w.id): str(w.name) for w in workshops}
    workshop_year = {str(w.id): str(w.cohort_year or "-") for w in workshops}
    workshop_status = {str(w.id): str(w.status or "-") for w in workshops}

    workshops_by_year: dict[str, int] = {}
    workshops_by_status: dict[str, int] = {}
    for w in workshops:
        yk = str(w.cohort_year or "-")
        sk = str(w.status or "-")
        workshops_by_year[yk] = workshops_by_year.get(yk, 0) + 1
        workshops_by_status[sk] = workshops_by_status.get(sk, 0) + 1

    active_workshops = workshops_by_status.get("active", 0)
    comm_per_enrollment = round((total_communications / total_enrollments), 2) if total_enrollments else 0.0

    enroll_series = _series_months([e.created_at for e in enrollments if e.created_at], months=12)
    comm_series = _series_months([c.created_at for c in communications if c.created_at], months=12)
    enroll_values = [int(r.get("value", 0) or 0) for r in enroll_series]
    comm_values = [int(r.get("value", 0) or 0) for r in comm_series]

    def _delta_pct(values: list[int]) -> float:
        if not values:
            return 0.0
        cur = values[-1]
        prev = values[-2] if len(values) > 1 else 0
        if prev == 0:
            return 100.0 if cur > 0 else 0.0
        return round(((cur - prev) / prev) * 100, 1)

    kpis = [
        {"label": "Inscripciones", "value": total_enrollments, "delta_pct": _delta_pct(enroll_values), "sparkline": enroll_values},
        {"label": "Participantes", "value": len(participant_ids), "delta_pct": _delta_pct([len(participant_ids)] + enroll_values[-5:]), "sparkline": enroll_values},
        {"label": "Talleres activos", "value": active_workshops, "delta_pct": _delta_pct(list(workshops_by_status.values())[-2:]), "sparkline": list(workshops_by_status.values())[-6:]},
        {"label": "Comunicaciones", "value": total_communications, "delta_pct": _delta_pct(comm_values), "sparkline": comm_values},
    ]

    peak_idx = 0
    if enroll_values:
        peak_idx = max(range(len(enroll_values)), key=lambda i: enroll_values[i])
    peak_label = enroll_series[peak_idx]["label"] if enroll_series else "-"
    peak_value = enroll_values[peak_idx] if enroll_values else 0
    comm_gap = max(total_enrollments - total_communications, 0)
    insight_lines = [
        f"Pico de demanda en {peak_label}: {peak_value} inscripciones.",
        f"Trayectoria general: {progress}% finalizacion, {drop_rate}% bajas y {active} activos.",
        f"Intensidad operativa: {total_communications} comunicaciones ({comm_per_enrollment} por inscripcion).",
    ]
    if comm_gap > max(2, total_enrollments // 4):
        insight_lines[2] = f"Brecha operativa: faltan al menos {comm_gap} comunicaciones para cubrir la demanda reciente."

    ranked_workshops = sorted(by_workshop.items(), key=lambda item: item[1], reverse=True)
    rank_rows = [{"label": workshop_names.get(wid, "Taller"), "value": total} for wid, total in ranked_workshops[:10]]
    year_rows = [{"label": yr, "value": total} for yr, total in sorted(workshops_by_year.items(), key=lambda item: item[0])]

    rows_full: list[list[str]] = []
    for wid, total in ranked_workshops:
        participant_total = len(participants_by_workshop.get(wid, set()))
        rows_full.append(
            [
                workshop_names.get(wid, "Taller"),
                workshop_year.get(wid, "-"),
                workshop_status.get(wid, "-"),
                f"{total} / {participant_total}",
            ]
        )
    if not rows_full:
        rows_full.append(["Sin datos", "-", "-", "0 / 0"])

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    page_w, page_h = A4
    margin_x = 34
    content_w = page_w - (margin_x * 2)
    x = margin_x

    y = draw_editorial_header(
        c,
        page_w,
        page_h,
        "Reporte Global del Dashboard",
        f"Rango {range_key} | Ano {year or 'Todos'} | Estado {status or 'Todos'}",
        accent_hex="#4f46e5",
        margin_x=x,
    )
    y = draw_kpi_strip(c, x, y, content_w, kpis, accent_hex="#4f46e5")
    y = draw_insight_panel(c, x, y, content_w, "Narrativa ejecutiva", insight_lines, accent_hex="#4f46e5")
    y = draw_section_heading(c, x, y, content_w, "Pulso temporal", "Demanda vs traccion operativa en los ultimos 12 meses.")

    gap = 14
    left_w = (content_w * 0.64) - (gap / 2)
    right_w = content_w - left_w - gap
    right_x = x + left_w + gap

    left_y_end = draw_dual_line_chart(
        c,
        x=x,
        y=y,
        width=left_w,
        height=166,
        labels=[str(r.get("label", "")) for r in enroll_series],
        primary=enroll_values,
        secondary=comm_values,
        primary_label="Inscripciones",
        secondary_label="Comunicaciones",
        accent_hex="#4f46e5",
    )
    right_y = draw_stacked_composition_bar(
        c,
        x=right_x,
        y=y,
        width=right_w,
        title="Composicion de trayectoria",
        segments=[
            ("Activos", active, "#64748b"),
            ("Finalizados", finished, "#4f46e5"),
            ("Bajas", dropped, "#94a3b8"),
        ],
    )
    right_y = draw_lollipop_rank_chart(
        c,
        x=right_x,
        y=right_y + 2,
        width=right_w,
        title="Top talleres por demanda",
        rows=rank_rows[:5],
        label_key="label",
        value_key="value",
        accent_hex="#4f46e5",
        max_rows=5,
    )
    draw_page_footer(c, page_w, page_h, "Reporte Global Dashboard", 1, margin_x=x)

    c.showPage()
    y = draw_editorial_header(
        c,
        page_w,
        page_h,
        "Cobertura y capacidad operativa",
        "Profundizacion por talleres, cohortes y estructura del sistema",
        accent_hex="#4f46e5",
        margin_x=x,
    )
    y = draw_section_heading(c, x, y, content_w, "Comparativas estructurales", "Ranking por demanda y distribucion por cohorte.")

    left_w = (content_w * 0.58) - (gap / 2)
    right_w = content_w - left_w - gap
    right_x = x + left_w + gap
    left_y = draw_lollipop_rank_chart(
        c,
        x=x,
        y=y,
        width=left_w,
        title="Ranking de talleres",
        rows=rank_rows,
        label_key="label",
        value_key="value",
        accent_hex="#4f46e5",
        max_rows=8,
    )
    right_y = draw_highlighted_bar_chart(
        c,
        x=right_x,
        y=y,
        width=right_w,
        title="Talleres por cohorte",
        subtitle="Distribucion anual",
        rows=year_rows,
        value_key="value",
        label_key="label",
        highlight_idx=max(len(year_rows) - 1, 0),
        accent_hex="#4f46e5",
        label_col_w=42,
        value_col_w=24,
    )
    right_y = draw_highlighted_bar_chart(
        c,
        x=right_x,
        y=right_y + 4,
        width=right_w,
        title="Comunicaciones mensuales",
        subtitle="Seguimiento operativo por mes",
        rows=comm_series[-8:],
        value_key="value",
        label_key="label",
        highlight_idx=7,
        accent_hex="#4f46e5",
        label_col_w=40,
        value_col_w=24,
    )

    y = min(left_y, right_y) - 2
    y = draw_section_heading(c, x, y, content_w, "Detalle de talleres", "Inscripciones y participantes unicos por taller.")
    y = draw_minimal_table(
        c,
        x=x,
        y=y,
        width=content_w,
        columns=["Taller", "Ano", "Estado", "Insc/Part"],
        rows=rows_full,
        max_rows=10,
        col_ratios=[0.45, 0.15, 0.20, 0.20],
    )
    draw_page_footer(c, page_w, page_h, "Reporte Global Dashboard", 2, margin_x=x)

    c.showPage()
    y = draw_editorial_header(
        c,
        page_w,
        page_h,
        "Anexo global",
        "Inventario completo de talleres ordenado por demanda",
        accent_hex="#4f46e5",
        margin_x=x,
    )
    y = draw_insight_panel(
        c,
        x,
        y,
        content_w,
        "Lectura metodologica",
        [
            "Consolida talleres, participantes, inscripciones y comunicaciones en una sola lectura.",
            "Prioriza comparabilidad temporal, composicion y ranking para decisiones de gestion.",
            "El anexo preserva el detalle operativo para auditoria y seguimiento.",
        ],
        accent_hex="#4f46e5",
    )
    draw_minimal_table(
        c,
        x=x,
        y=y,
        width=content_w,
        columns=["Taller", "Ano", "Estado", "Insc/Part"],
        rows=rows_full,
        max_rows=34,
        col_ratios=[0.45, 0.15, 0.20, 0.20],
    )
    draw_page_footer(c, page_w, page_h, "Reporte Global Dashboard", 3, margin_x=x)
    c.showPage()
    c.save()

    out = buffer.getvalue()
    buffer.close()
    return out
