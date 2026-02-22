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
    draw_dual_line_chart,
    draw_editorial_header,
    draw_highlighted_bar_chart,
    draw_insight_panel,
    draw_kpi_strip,
    draw_lollipop_rank_chart,
    draw_minimal_table,
    draw_narrative_callout,
    draw_page_footer,
    draw_section_divider,
    draw_stacked_composition_bar,
)


def _ensure_reportlab():
    if HexColor is None or A4 is None or canvas is None:
        raise RuntimeError("Falta dependencia reportlab para exportar PDF")


def _month_label(dt: datetime) -> str:
    names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    return f"{names[dt.month - 1]} {str(dt.year)[2:]}"


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


def _to_int(value: Any) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _to_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _delta_pct(values: list[int | float]) -> float:
    if not values:
        return 0.0
    cur = float(values[-1])
    prev = float(values[-2]) if len(values) > 1 else 0.0
    if prev == 0:
        return 100.0 if cur > 0 else 0.0
    return round(((cur - prev) / prev) * 100, 1)


def _series_metric(rows: list[dict[str, Any]], key: str) -> list[int]:
    return [_to_int(r.get(key, 0)) for r in rows]


def _comparison_delta(comparisons: list[dict[str, Any]], keywords: list[str]) -> float:
    for row in comparisons:
        label = str(row.get("label", "")).lower()
        if any(kw in label for kw in keywords):
            return round(_to_float(row.get("delta_pct", 0)), 1)
    return 0.0


def _largest_delta_row(comparisons: list[dict[str, Any]]) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    best_abs = -1.0
    for row in comparisons:
        delta = _to_float(row.get("delta_pct", 0))
        if abs(delta) > best_abs:
            best = row
            best_abs = abs(delta)
    return best


def _build_insights_narrative(
    kpis: dict[str, Any],
    comparisons: list[dict[str, Any]],
    enroll_series: list[dict[str, Any]],
    top_workshops: list[dict[str, Any]],
    alerts: list[dict[str, Any]],
) -> tuple[str, str]:
    enrollments_total = _to_int(kpis.get("enrollments_total", 0))
    communications_total = _to_int(kpis.get("communications_total", 0))
    enroll_values = _series_metric(enroll_series, "value")

    peak_idx = max(range(len(enroll_values)), key=lambda i: enroll_values[i]) if enroll_values else 0
    peak_label = str(enroll_series[peak_idx].get("label", "-")) if enroll_series else "-"
    peak_value = enroll_values[peak_idx] if enroll_values else 0

    biggest_delta = _largest_delta_row(comparisons)
    headline = "No se registró actividad relevante en el período seleccionado."
    if biggest_delta and abs(_to_float(biggest_delta.get("delta_pct", 0))) >= 8:
        metric = str(biggest_delta.get("label", "La métrica"))
        delta = round(_to_float(biggest_delta.get("delta_pct", 0)), 1)
        direction = "creció" if delta > 0 else "cayó" if delta < 0 else "se mantuvo estable"
        if direction == "se mantuvo estable":
            headline = f"{metric} se mantuvo estable frente al período anterior."
        else:
            headline = f"{metric} {direction} {abs(delta):.1f}% frente al período anterior."
    elif peak_value > 0:
        headline = f"La demanda alcanzó su pico en {peak_label} con {peak_value} inscripciones."

    support_parts = [
        f"Se consolidaron {enrollments_total} inscripciones y {communications_total} comunicaciones en el período.",
    ]
    comm_gap = enrollments_total - communications_total
    if comm_gap > 0:
        support_parts.append(f"Existe una brecha operativa de {comm_gap} comunicaciones frente a la demanda registrada.")
    elif enrollments_total > 0:
        support_parts.append("La cobertura operativa acompaña el volumen de inscripciones sin brecha aparente.")
    top_workshop = top_workshops[0] if top_workshops else None
    if top_workshop:
        support_parts.append(
            f"Taller líder: {top_workshop.get('workshop_name', '-')} con {top_workshop.get('enrollments_total', 0)} inscripciones."
        )
    if alerts:
        top_alert = alerts[0]
        support_parts.append(f"Alerta destacada: {top_alert.get('title', 'Sin título')}.")
    return headline, " ".join(support_parts)


def _build_dashboard_narrative(
    total_enrollments: int,
    total_communications: int,
    active: int,
    progress: float,
    drop_rate: float,
    comm_per_enrollment: float,
    peak_label: str,
    peak_value: int,
    enroll_values: list[int],
) -> tuple[str, str]:
    if total_enrollments == 0:
        return (
            "No hubo inscripciones en el período seleccionado.",
            "El sistema no presenta actividad de demanda para construir una narrativa comparativa.",
        )

    comm_gap = max(total_enrollments - total_communications, 0)
    enroll_delta = _delta_pct(enroll_values)
    if drop_rate > 15:
        headline = f"La tasa de bajas llegó a {drop_rate:.1f}% y requiere intervención prioritaria."
    elif comm_gap > max(2, total_enrollments // 5):
        headline = f"Quedaron {comm_gap} comunicaciones por debajo de la demanda del período."
    elif enroll_delta > 0:
        headline = f"La demanda creció {abs(enroll_delta):.1f}% en el tramo más reciente."
    elif enroll_delta < 0:
        headline = f"La demanda cayó {abs(enroll_delta):.1f}% en el tramo más reciente."
    else:
        headline = "La demanda se mantuvo estable en el cierre del período."

    support = (
        f"Pico de demanda en {peak_label} con {peak_value} inscripciones. "
        f"La trayectoria acumula {progress:.1f}% de finalización, {drop_rate:.1f}% de bajas y {active} casos activos. "
        f"La intensidad operativa fue de {comm_per_enrollment:.2f} comunicaciones por inscripción."
    )
    return headline, support


def build_insights_pdf_bytes(payload: dict[str, Any], period_label: str) -> bytes:
    _ensure_reportlab()
    kpis = payload.get("kpis", {})
    series = payload.get("series", []) or []
    top_workshops = payload.get("top_workshops_by_enrollments", [])
    top_participants = payload.get("top_participants_by_activity", [])
    alerts = payload.get("alerts", [])
    funnel = payload.get("funnel", [])
    comparisons = payload.get("comparisons", []) or []

    enroll_series = [
        {"label": str(r.get("period_label") or r.get("period_key") or r.get("label") or "-"), "value": _to_int(r.get("enrollments", 0))}
        for r in series
    ]
    comm_series = [
        {"label": str(r.get("period_label") or r.get("period_key") or r.get("label") or "-"), "value": _to_int(r.get("communications", 0))}
        for r in series
    ]
    enroll_values = _series_metric(enroll_series, "value")
    comm_values = _series_metric(comm_series, "value")
    peak_idx = max(range(len(enroll_values)), key=lambda i: enroll_values[i]) if enroll_values else -1

    narrative_headline, narrative_support = _build_insights_narrative(
        kpis=kpis,
        comparisons=comparisons,
        enroll_series=enroll_series,
        top_workshops=top_workshops,
        alerts=alerts,
    )

    comparisons_rows = []
    for row in comparisons[:8]:
        delta = round(_to_float(row.get("delta_pct", 0)), 1)
        sign = "+" if delta > 0 else ""
        comparisons_rows.append(
            [
                str(row.get("label", "-")),
                str(row.get("current", 0)),
                str(row.get("previous", 0)),
                f"{sign}{delta}%",
            ]
        )
    if not comparisons_rows:
        comparisons_rows.append(["Sin comparación", "0", "0", "0.0%"])

    workshops_rows = [
        {"label": str(w.get("workshop_name", "-")), "value": _to_int(w.get("enrollments_total", 0))}
        for w in top_workshops[:8]
    ]
    if not workshops_rows:
        workshops_rows = [{"label": "Sin talleres con datos", "value": 0}]

    participants_rows = []
    for p in top_participants[:8]:
        participants_rows.append(
            {
                "label": str(p.get("name", "-")),
                "value": _to_int(
                    p.get("workshops_total", p.get("activities_total", p.get("communications_total", 0)))
                ),
            }
        )
    if not participants_rows:
        participants_rows = [{"label": "Sin participantes con datos", "value": 0}]

    funnel_rows = []
    for item in funnel[:8]:
        funnel_rows.append(
            {
                "label": str(item.get("label") or item.get("status") or item.get("stage") or item.get("period_label") or "-"),
                "value": _to_int(item.get("total", item.get("value", 0))),
            }
        )
    if not funnel_rows:
        funnel_rows = [{"label": "Sin datos", "value": 0}]
    funnel_highlight = max(range(len(funnel_rows)), key=lambda i: funnel_rows[i]["value"]) if funnel_rows else -1

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
        "Resumen ejecutivo de insights",
        f"Período {period_label}",
        accent_hex="#4f46e5",
        margin_x=x,
    )
    y = draw_narrative_callout(
        c,
        x=x,
        y=y,
        width=content_w,
        headline=narrative_headline,
        supporting_text=narrative_support,
        accent_hex="#4f46e5",
    )

    insights_kpis = [
        {
            "label": "Inscripciones",
            "value": _to_int(kpis.get("enrollments_total", 0)),
            "delta_pct": _comparison_delta(comparisons, ["inscrip", "enroll"]),
            "sparkline": enroll_values,
        },
        {
            "label": "Comunicaciones",
            "value": _to_int(kpis.get("communications_total", 0)),
            "delta_pct": _comparison_delta(comparisons, ["comunic", "commun"]),
            "sparkline": comm_values,
        },
        {
            "label": "Equipo activo",
            "value": _to_int(kpis.get("active_team_members", 0)),
            "delta_pct": _comparison_delta(comparisons, ["equipo", "staff", "team"]),
            "sparkline": [_to_int(kpis.get("active_team_members", 0)) for _ in range(max(len(enroll_values), 6))],
        },
        {
            "label": "Participantes activos",
            "value": _to_int(kpis.get("active_participants_total", 0)),
            "delta_pct": _comparison_delta(comparisons, ["particip", "active participants"]),
            "sparkline": [_to_int(kpis.get("active_participants_total", 0)) for _ in range(max(len(enroll_values), 6))],
        },
    ]
    y = draw_kpi_strip(c, x, y, content_w, insights_kpis, accent_hex="#4f46e5")
    y = draw_section_divider(c, x, y, content_w)

    enroll_title = "La demanda se sostuvo con un pico claro en el período."
    if enroll_values:
        enroll_delta = _delta_pct(enroll_values)
        if enroll_delta > 0:
            enroll_title = "Las inscripciones crecieron en el tramo más reciente."
        elif enroll_delta < 0:
            enroll_title = "Las inscripciones cayeron en el tramo más reciente."
        else:
            enroll_title = "Las inscripciones se mantuvieron estables al cierre del período."
    y = draw_highlighted_bar_chart(
        c,
        x=x,
        y=y,
        width=content_w,
        title=enroll_title,
        subtitle="Evolución mensual de inscripciones",
        rows=enroll_series,
        value_key="value",
        label_key="label",
        highlight_idx=peak_idx,
        accent_hex="#4f46e5",
        label_col_w=42,
        value_col_w=28,
    )
    y = draw_highlighted_bar_chart(
        c,
        x=x,
        y=y,
        width=content_w,
        title="El embudo muestra dónde se concentra la trayectoria.",
        subtitle="Distribución por etapa del recorrido",
        rows=funnel_rows,
        value_key="value",
        label_key="label",
        highlight_idx=funnel_highlight,
        accent_hex="#4f46e5",
        label_col_w=56,
        value_col_w=30,
    )
    draw_page_footer(c, page_w, page_h, "Reporte Insights", 1, margin_x=x)

    c.showPage()
    y = draw_editorial_header(
        c,
        page_w,
        page_h,
        "Comparativas y rankings",
        "Lectura de variaciones por período y actores más activos",
        accent_hex="#4f46e5",
        margin_x=x,
    )
    y = draw_section_divider(c, x, y, content_w)
    y = draw_minimal_table(
        c,
        x=x,
        y=y,
        width=content_w,
        columns=["Métrica", "Actual", "Anterior", "Delta %"],
        rows=comparisons_rows,
        max_rows=8,
        col_ratios=[0.43, 0.16, 0.16, 0.25],
    )
    y -= 6
    gap = 14
    left_w = (content_w * 0.5) - (gap / 2)
    right_w = content_w - left_w - gap
    right_x = x + left_w + gap
    left_y = draw_lollipop_rank_chart(
        c,
        x=x,
        y=y,
        width=left_w,
        title="El ranking de talleres concentra la convocatoria.",
        rows=workshops_rows,
        label_key="label",
        value_key="value",
        accent_hex="#4f46e5",
        max_rows=8,
    )
    right_y = draw_lollipop_rank_chart(
        c,
        x=right_x,
        y=y,
        width=right_w,
        title="Participantes con mayor actividad registrada.",
        rows=participants_rows,
        label_key="label",
        value_key="value",
        accent_hex="#4f46e5",
        max_rows=8,
    )

    y = min(left_y, right_y) - 2
    if alerts:
        alert_lines = [f"{str(a.get('title', 'Alerta'))}: {str(a.get('message', ''))}" for a in alerts[:3]]
        y = draw_insight_panel(c, x, y, content_w, "Alertas del período", alert_lines, accent_hex="#b45309")
    draw_page_footer(c, page_w, page_h, "Reporte Insights", 2, margin_x=x)
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
    narrative_headline, narrative_support = _build_dashboard_narrative(
        total_enrollments=total_enrollments,
        total_communications=total_communications,
        active=active,
        progress=progress,
        drop_rate=drop_rate,
        comm_per_enrollment=comm_per_enrollment,
        peak_label=peak_label,
        peak_value=peak_value,
        enroll_values=enroll_values,
    )

    ranked_workshops = sorted(by_workshop.items(), key=lambda item: item[1], reverse=True)
    rank_rows = [{"label": workshop_names.get(wid, "Taller"), "value": total} for wid, total in ranked_workshops[:10]]
    year_rows = [{"label": yr, "value": total} for yr, total in sorted(workshops_by_year.items(), key=lambda item: item[0])]

    # Dynamic Titles for Data Storytelling
    top_workshop_name = rank_rows[0]["label"] if rank_rows else "Ningún taller"
    title_rank = f"{top_workshop_name} lidera la demanda."

    active_hex = "#e2e8f0"
    finished_hex = "#e2e8f0"
    dropped_hex = "#e2e8f0"

    majority_status = "activa"
    if finished >= active and finished >= dropped:
        majority_status = "finalizada"
        finished_hex = "#4f46e5"
        active_hex = "#94a3b8"
    elif dropped >= active and dropped >= finished:
        majority_status = "dada de baja"
        dropped_hex = "#4f46e5"
        active_hex = "#94a3b8"
    else:
        majority_status = "activa"
        active_hex = "#4f46e5"
        finished_hex = "#94a3b8"
        
    title_composition = f"La trayectoria está mayormente {majority_status}."

    top_year = max(workshops_by_year.items(), key=lambda x: x[1])[0] if workshops_by_year else "-"
    title_cohort = f"La cohorte {top_year} concentra los talleres."

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
        "Reporte de gestión",
        f"Rango {range_key} | Año {year or 'Todos'} | Estado {status or 'Todos'}",
        accent_hex="#4f46e5",
        margin_x=x,
    )
    y = draw_narrative_callout(
        c,
        x=x,
        y=y,
        width=content_w,
        headline=narrative_headline,
        supporting_text=narrative_support,
        accent_hex="#4f46e5",
    )
    y = draw_kpi_strip(c, x, y, content_w, kpis, accent_hex="#4f46e5")
    y = draw_section_divider(c, x, y, content_w)
    y = draw_dual_line_chart(
        c,
        x=x,
        y=y,
        width=content_w,
        height=180,
        labels=[str(r.get("label", "")) for r in enroll_series],
        primary=enroll_values,
        secondary=comm_values,
        primary_label="Inscripciones",
        secondary_label="Comunicaciones",
        accent_hex="#4f46e5",
    )
    draw_page_footer(c, page_w, page_h, "Reporte Global Dashboard", 1, margin_x=x)

    c.showPage()
    y = draw_editorial_header(
        c,
        page_w,
        page_h,
        "Análisis por composición y ranking",
        "Detalle de demanda por taller y distribución por cohorte",
        accent_hex="#4f46e5",
        margin_x=x,
    )
    y = draw_section_divider(c, x, y, content_w)
    gap = 22
    left_w = (content_w - gap) / 2
    right_w = left_w
    right_x = x + left_w + gap
    left_y = draw_lollipop_rank_chart(
        c,
        x=x,
        y=y,
        width=left_w,
        title=title_rank,
        rows=rank_rows,
        label_key="label",
        value_key="value",
        accent_hex="#4f46e5",
        max_rows=8,
    )
    right_y = draw_stacked_composition_bar(
        c,
        x=right_x,
        y=y,
        width=right_w,
        title=title_composition,
        segments=[
            ("Activos", active, active_hex),
            ("Finalizados", finished, finished_hex),
            ("Bajas", dropped, dropped_hex),
        ],
    )
    right_y = draw_highlighted_bar_chart(
        c,
        x=right_x,
        y=right_y - 8,
        width=right_w,
        title=title_cohort,
        subtitle="Distribución anual",
        rows=year_rows,
        value_key="value",
        label_key="label",
        highlight_idx=max(len(year_rows) - 1, 0),
        accent_hex="#4f46e5",
        label_col_w=42,
        value_col_w=24,
    )

    y = min(left_y, right_y) - 2
    y = draw_section_divider(c, x, y, content_w)
    y = draw_minimal_table(
        c,
        x=x,
        y=y,
        width=content_w,
        columns=["Taller", "Año", "Estado", "Insc/Part"],
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
        "Anexo",
        "Inventario completo de talleres ordenado por demanda",
        accent_hex="#4f46e5",
        margin_x=x,
    )
    y = draw_insight_panel(
        c,
        x,
        y,
        content_w,
        "Nota metodológica",
        [
            "Consolida talleres, participantes, inscripciones y comunicaciones en una sola lectura.",
            "Prioriza comparabilidad temporal, composición y ranking para decisiones de gestión.",
            "El anexo preserva el detalle operativo para auditoría y seguimiento.",
        ],
        accent_hex="#4f46e5",
    )
    draw_minimal_table(
        c,
        x=x,
        y=y,
        width=content_w,
        columns=["Taller", "Año", "Estado", "Insc/Part"],
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
