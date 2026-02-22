from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

try:
    from reportlab.lib.colors import HexColor
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
except Exception:  # pragma: no cover
    HexColor = None
    pdfmetrics = None
    TTFont = None


_FONTS_READY = False


def _ensure_reportlab():
    if HexColor is None:
        raise RuntimeError("Falta dependencia reportlab para exportar PDF")


def _register_editorial_fonts():
    global _FONTS_READY
    if _FONTS_READY or pdfmetrics is None or TTFont is None:
        return
    root = Path(__file__).resolve().parents[2]
    fonts_dir = root / ".agents" / "skills" / "canvas-design" / "canvas-fonts"
    candidates = {
        "EditorialSans": "WorkSans-Regular.ttf",
        "EditorialSans-Bold": "WorkSans-Bold.ttf",
        "EditorialMono": "GeistMono-Regular.ttf",
    }
    for alias, filename in candidates.items():
        path = fonts_dir / filename
        if path.exists():
            try:
                pdfmetrics.registerFont(TTFont(alias, str(path)))
            except Exception:
                pass
    _FONTS_READY = True


def _font(sans_bold: bool = False, mono: bool = False) -> str:
    _register_editorial_fonts()
    if mono:
        return "EditorialMono" if pdfmetrics and "EditorialMono" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
    if sans_bold:
        return "EditorialSans-Bold" if pdfmetrics and "EditorialSans-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"
    return "EditorialSans" if pdfmetrics and "EditorialSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica"


def _wrap_text(c, text: str, max_width: float, font_name: str, font_size: float, max_lines: int = 3) -> list[str]:
    if not text:
        return []
    words = str(text).split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if c.stringWidth(trial, font_name, font_size) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
            if len(lines) >= max_lines - 1:
                break
    if len(lines) < max_lines:
        lines.append(current)
    return lines[:max_lines]


def draw_pdf_header(c, page_w: float, page_h: float, title: str, subtitle: str, bg_hex: str = "#111827"):
    _ensure_reportlab()
    c.setFillColor(HexColor(bg_hex))
    c.rect(0, page_h - 44, page_w, 44, stroke=0, fill=1)
    c.setFillColor(HexColor("#f8fafc"))
    c.setFont("Helvetica-Bold", 15)
    c.drawString(26, page_h - 28, title)
    c.setFont("Helvetica", 9)
    c.drawString(26, page_h - 40, subtitle)
    c.drawRightString(page_w - 26, page_h - 28, datetime.now(UTC).strftime("%d/%m/%Y %H:%M UTC"))


def draw_kpi_grid(c, x: float, y: float, width: float, cards: list[tuple[str, int, str]]):
    _ensure_reportlab()
    cols = 3
    gap = 10
    card_w = (width - gap * (cols - 1)) / cols
    card_h = 48
    for i, (label, value, tone) in enumerate(cards):
        col = i % cols
        row = i // cols
        cx = x + col * (card_w + gap)
        cy = y - row * (card_h + 8)
        border = HexColor("#60a5fa") if tone == "blue" else HexColor("#34d399") if tone == "green" else HexColor("#f59e0b") if tone == "amber" else HexColor("#8b5cf6")
        c.setFillColor(HexColor("#f8fafc"))
        c.setStrokeColor(border)
        c.roundRect(cx, cy - card_h, card_w, card_h, 8, stroke=1, fill=1)
        c.setFillColor(HexColor("#475569"))
        c.setFont("Helvetica", 8)
        c.drawString(cx + 8, cy - 14, label)
        c.setFillColor(HexColor("#0f172a"))
        c.setFont("Helvetica-Bold", 15)
        c.drawRightString(cx + card_w - 8, cy - 16, str(value))
    return y - 2 * (card_h + 8)


def draw_story_box(c, x: float, y: float, width: float, lines: list[str], bullet: str = "*"):
    _ensure_reportlab()
    c.setFillColor(HexColor("#f8fafc"))
    c.setStrokeColor(HexColor("#d6deea"))
    box_h = 64
    c.roundRect(x, y - box_h, width, box_h, 8, stroke=1, fill=1)
    c.setFillColor(HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 8, y - 14, "Historia con datos")
    c.setFont("Helvetica", 9)
    ly = y - 28
    for line in lines[:3]:
        c.drawString(x + 10, ly, f"{bullet} {line[:112]}")
        ly -= 12
    return y - box_h - 10


def draw_narrative_callout(
    c,
    x: float,
    y: float,
    width: float,
    headline: str,
    supporting_text: str,
    accent_hex: str = "#4f46e5",
):
    _ensure_reportlab()
    title_font = _font(sans_bold=True)
    title_size = 15.5
    max_title_width = max(width - 24, 80)
    headline_lines = _wrap_text(c, headline, max_title_width, title_font, title_size, max_lines=2)

    body_font = _font()
    body_size = 9.2
    support_lines = _wrap_text(c, supporting_text, max(width - 24, 80), body_font, body_size, max_lines=4)
    if not support_lines:
        support_lines = [""]

    # Dynamic height: padding + headline lines + gap + support lines + padding
    box_h = 20 + len(headline_lines) * 17 + 4 + len(support_lines) * 12 + 12
    box_h = max(box_h, 72)

    c.setFillColor(HexColor("#f8fafc"))
    c.setStrokeColor(HexColor("#e2e8f0"))
    c.roundRect(x, y - box_h, width, box_h, 7, stroke=1, fill=1)
    c.setFillColor(HexColor(accent_hex))
    c.rect(x, y - box_h, 4, box_h, stroke=0, fill=1)

    c.setFillColor(HexColor("#0f172a"))
    c.setFont(title_font, title_size)
    line_y = y - 20
    for line in headline_lines:
        c.drawString(x + 12, line_y, line)
        line_y -= 17

    c.setFillColor(HexColor("#475569"))
    c.setFont(body_font, body_size)
    line_y -= 2
    for line in support_lines:
        c.drawString(x + 12, line_y, line)
        line_y -= 12
    return y - box_h - 14


def draw_bar_list(
    c,
    rows: list[dict],
    x: float,
    y: float,
    width: float,
    title: str,
    value_key: str,
    color_hex: str,
):
    _ensure_reportlab()
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(HexColor("#0f172a"))
    c.drawString(x, y, title)
    y -= 14
    values = [int(r.get(value_key, 0) or 0) for r in rows]
    max_value = max(values) if values else 0
    max_value = max(max_value, 1)
    bar_w = max(width - 110, 80)
    c.setFont("Helvetica", 8)
    for row in rows[:8]:
        label = str(row.get("period_label") or row.get("period_key") or row.get("label") or "-")
        value = int(row.get(value_key, 0) or 0)
        c.setFillColor(HexColor("#475569"))
        c.drawString(x, y, label[:14])
        c.setFillColor(HexColor("#e2e8f0"))
        c.rect(x + 54, y - 3, bar_w, 7, stroke=0, fill=1)
        fill_w = 0 if value <= 0 else (value / max_value) * bar_w
        c.setFillColor(HexColor(color_hex))
        if fill_w > 0:
            c.rect(x + 54, y - 3, fill_w, 7, stroke=0, fill=1)
        c.setFillColor(HexColor("#0f172a"))
        c.drawRightString(x + 54 + bar_w + 48, y, str(value))
        y -= 12
    return y - 4


def draw_table(
    c,
    x: float,
    y: float,
    width: float,
    columns: list[str],
    rows: list[list[str]],
    max_rows: int = 24,
    col_ratios: list[float] | None = None,
):
    _ensure_reportlab()
    ratios = col_ratios or [0.5, 0.12, 0.18, 0.2]
    col_w = [width * r for r in ratios]
    c.setFillColor(HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 9)
    cx = x
    for i, col in enumerate(columns):
        c.drawString(cx + 2, y, col)
        cx += col_w[i]
    y -= 8
    c.setStrokeColor(HexColor("#d6deea"))
    c.line(x, y, x + width, y)
    y -= 10
    c.setFont("Helvetica", 8.5)
    for idx, row in enumerate(rows[:max_rows]):
        if idx % 2 == 0:
            c.setFillColor(HexColor("#f8fafc"))
            c.rect(x, y - 8, width, 10, stroke=0, fill=1)
        c.setFillColor(HexColor("#0f172a"))
        cx = x
        for i, value in enumerate(row):
            c.drawString(cx + 2, y, str(value)[:44] if i == 0 else str(value)[:18])
            cx += col_w[i]
        y -= 10
        if y < 36:
            break


def draw_editorial_header(
    c,
    page_w: float,
    page_h: float,
    title: str,
    subtitle: str,
    accent_hex: str = "#4f46e5",
    margin_x: float = 28,
):
    _ensure_reportlab()
    x = margin_x
    y = page_h - 40
    c.setFillColor(HexColor("#ffffff"))
    c.rect(0, page_h - 96, page_w, 96, stroke=0, fill=1)
    c.setFillColor(HexColor("#0f172a"))
    c.setFont(_font(sans_bold=True), 26)
    c.drawString(x, y, title)
    c.setStrokeColor(HexColor(accent_hex))
    c.setLineWidth(1.1)
    c.line(x, y - 9, page_w - margin_x, y - 9)
    c.setFillColor(HexColor("#475569"))
    c.setFont(_font(), 9.7)
    c.drawString(x, y - 22, subtitle)
    c.setFont(_font(mono=True), 8.6)
    c.drawRightString(page_w - margin_x, y - 22, datetime.now(UTC).strftime("%d/%m/%Y %H:%M UTC"))
    return y - 35


def _sparkline(c, x: float, y: float, w: float, h: float, values: list[float], stroke_hex: str = "#4f46e5"):
    _ensure_reportlab()
    if not values:
        return
    vmax = max(values)
    vmin = min(values)
    spread = max(vmax - vmin, 1)
    # Subtle baseline so the sparkline has a clear visual anchor.
    c.setStrokeColor(HexColor("#e2e8f0"))
    c.setLineWidth(0.6)
    c.line(x, y, x + w, y)
    points = []
    for i, v in enumerate(values):
        px = x + (i / max(len(values) - 1, 1)) * w
        py = y + ((v - vmin) / spread) * h
        points.append((px, py))
    c.setStrokeColor(HexColor(stroke_hex))
    c.setLineWidth(1)
    for i in range(1, len(points)):
        c.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
    c.setFillColor(HexColor(stroke_hex))
    c.circle(points[-1][0], points[-1][1], 1.8, stroke=0, fill=1)


def draw_kpi_strip(
    c,
    x: float,
    y: float,
    width: float,
    cards: list[dict[str, Any]],
    accent_hex: str = "#4f46e5",
):
    _ensure_reportlab()
    cols = len(cards)
    gap = 12
    card_w = (width - gap * (cols - 1)) / max(cols, 1)
    card_h = 70

    def _fit_font(text: str, font_name: str, start_size: float, min_size: float, available_w: float) -> float:
        size = start_size
        while size > min_size and c.stringWidth(text, font_name, size) > available_w:
            size -= 0.5
        return max(size, min_size)

    def _trend_arrow(delta: float) -> str:
        if delta > 0:
            return "▲"
        if delta < 0:
            return "▼"
        return "•"

    for i, card in enumerate(cards):
        cx = x + i * (card_w + gap)
        text_zone_w = max(card_w * 0.70 - 12, 28)
        spark_w = min(max(card_w * 0.22, 48), max(card_w * 0.30 - 8, 48))
        spark_x = cx + card_w - spark_w - 8
        text_right = cx + text_zone_w
        c.setFillColor(HexColor("#ffffff"))
        c.setStrokeColor(HexColor("#dbe3ef"))
        c.roundRect(cx, y - card_h, card_w, card_h, 6, stroke=1, fill=1)
        c.setFillColor(HexColor("#64748b"))
        label_font = _font(mono=True)
        c.setFont(label_font, 7.8)
        label = str(card.get("label", "")).upper()
        label_lines = _wrap_text(c, label, text_zone_w - 4, label_font, 7.8, max_lines=2)
        c.drawString(cx + 8, y - 11, label_lines[0] if label_lines else "")
        if len(label_lines) > 1:
            c.drawString(cx + 8, y - 19, label_lines[1])
        c.setFillColor(HexColor("#0f172a"))
        value_font = _font(sans_bold=True)
        value_txt = str(card.get("value", 0))
        value_size = _fit_font(value_txt, value_font, start_size=24, min_size=14, available_w=text_zone_w - 4)
        c.setFont(value_font, value_size)
        c.drawRightString(text_right, y - 31, value_txt)
        delta = float(card.get("delta_pct", 0) or 0)
        delta_hex = "#059669" if delta > 0 else "#b91c1c" if delta < 0 else "#64748b"
        delta_txt = f"{_trend_arrow(delta)} {'+' if delta > 0 else ''}{round(delta, 1)}% vs prev."
        c.setFillColor(HexColor(delta_hex))
        delta_font = _font()
        delta_size = _fit_font(delta_txt, delta_font, start_size=8.2, min_size=7.0, available_w=text_zone_w - 4)
        c.setFont(delta_font, delta_size)
        c.drawRightString(text_right, y - 48, delta_txt)
        _sparkline(
            c,
            x=spark_x,
            y=y - 55,
            w=spark_w,
            h=15,
            values=[float(v) for v in (card.get("sparkline") or [])],
            stroke_hex=accent_hex,
        )
    return y - card_h - 12


def draw_insight_panel(c, x: float, y: float, width: float, title: str, bullets: list[str], accent_hex: str = "#4f46e5"):
    _ensure_reportlab()
    box_h = 74
    
    # Cleaner editorial look: no background, just the accent bar
    c.setFillColor(HexColor(accent_hex))
    c.rect(x, y - box_h, 3, box_h, stroke=0, fill=1)
    
    c.setFillColor(HexColor("#0f172a"))
    c.setFont(_font(sans_bold=True), 11.1)
    c.drawString(x + 10, y - 15, title)
    c.setFont(_font(), 9.2)
    ly = y - 32
    for bullet in bullets[:3]:
        c.setFillColor(HexColor("#334155"))
        c.drawString(x + 12, ly, f"- {str(bullet)[:118]}")
        ly -= 15
    return y - box_h - 12


def draw_highlighted_bar_chart(
    c,
    x: float,
    y: float,
    width: float,
    title: str,
    subtitle: str,
    rows: list[dict[str, Any]],
    value_key: str = "value",
    label_key: str = "label",
    highlight_idx: int = -1,
    accent_hex: str = "#4f46e5",
    label_col_w: float = 28,
    value_col_w: float = 30,
):
    _ensure_reportlab()
    c.setFillColor(HexColor("#0f172a"))
    c.setFont(_font(sans_bold=True), 11.2)
    c.drawString(x, y, title)
    c.setFillColor(HexColor("#64748b"))
    c.setFont(_font(), 8.6)
    c.drawString(x, y - 11.5, subtitle)
    y -= 25.5
    max_v = max([float(r.get(value_key, 0) or 0) for r in rows] or [1])
    label_col_w = max(label_col_w, 35)
    bar_area_w = max(width - label_col_w - value_col_w - 10, 80)
    bar_h = 7.0
    label_font = 8.2
    value_font = 8.2
    value_pad = 7.0
    for idx, r in enumerate(rows[:8]):
        label = str(r.get(label_key, "-"))
        value = float(r.get(value_key, 0) or 0)
        fill = (value / max_v) * bar_area_w if max_v else 0
        c.setFillColor(HexColor("#64748b"))
        c.setFont(_font(mono=True), label_font)
        bar_y = y - 3.2
        # Align text baseline to bar center.
        label_y = bar_y + (bar_h / 2.0) - 3
        c.drawString(x, label_y, label[:14])
        c.setFillColor(HexColor("#e2e8f0"))
        bar_x = x + label_col_w
        c.rect(bar_x, bar_y, bar_area_w, bar_h, stroke=0, fill=1)
        c.setFillColor(HexColor(accent_hex if idx == highlight_idx else "#cbd5e1"))
        if fill > 0:
            c.rect(bar_x, bar_y, fill, bar_h, stroke=0, fill=1)
        # Keep values outside bars so they never collide with fill color/width.
        c.setFillColor(HexColor("#0f172a"))
        c.setFont(_font(), value_font)
        value_y = bar_y + (bar_h / 2.0) - 3
        value_x = min(bar_x + fill + 6, x + width - value_col_w)
        c.drawString(value_x, value_y, str(int(value)))
        y -= 12.5
    return y - 8


def draw_minimal_table(
    c,
    x: float,
    y: float,
    width: float,
    columns: list[str],
    rows: list[list[str]],
    max_rows: int = 12,
    col_ratios: list[float] | None = None,
):
    _ensure_reportlab()
    ratios = col_ratios or [0.45, 0.15, 0.20, 0.20]
    col_w = [width * r for r in ratios]
    
    # Table Header Background
    c.setFillColor(HexColor("#f8fafc"))
    c.rect(x - 4, y - 10, width + 8, 22, stroke=0, fill=1)
    
    c.setFillColor(HexColor("#0f172a"))
    c.setFont(_font(sans_bold=True), 10.5)
    cx = x
    for i, col in enumerate(columns):
        c.drawString(cx + 2, y, col)
        cx += col_w[i]
    y -= 10
    c.setStrokeColor(HexColor("#cbd5e1"))
    c.setLineWidth(1.2)
    c.line(x, y, x + width, y)
    y -= 14
    c.setFont(_font(), 9.2)
    for row in rows[:max_rows]:
        cx = x
        c.setFillColor(HexColor("#334155"))
        for i, value in enumerate(row):
            trunc = 46 if i == 0 else 18
            c.drawString(cx + 2, y, str(value)[:trunc])
            cx += col_w[i]
        y -= 14
        c.setStrokeColor(HexColor("#e2e8f0"))
        c.setLineWidth(0.5)
        c.line(x, y + 4, x + width, y + 4)
        if y < 40:
            break
    return y


def draw_section_heading(
    c,
    x: float,
    y: float,
    width: float,
    title: str,
    subtitle: str | None = None,
    accent_hex: str = "#4f46e5",
):
    _ensure_reportlab()
    c.setStrokeColor(HexColor("#e2e8f0"))
    c.setLineWidth(0.6)
    c.line(x, y - 2, x + width, y - 2)
    c.setFillColor(HexColor(accent_hex))
    c.setFont(_font(sans_bold=True), 11)
    c.drawString(x, y + 4, title)
    if subtitle:
        c.setFillColor(HexColor("#64748b"))
        c.setFont(_font(), 8.4)
        c.drawString(x, y - 10, subtitle[:96])
        return y - 20
    return y - 12


def draw_section_divider(
    c,
    x: float,
    y: float,
    width: float,
    line_hex: str = "#e2e8f0",
):
    _ensure_reportlab()
    c.setStrokeColor(HexColor(line_hex))
    c.setLineWidth(0.6)
    c.line(x, y - 4, x + width, y - 4)
    return y - 14


def draw_dual_line_chart(
    c,
    x: float,
    y: float,
    width: float,
    height: float,
    labels: list[str],
    primary: list[float],
    secondary: list[float],
    primary_label: str = "Serie A",
    secondary_label: str = "Serie B",
    accent_hex: str = "#4f46e5",
):
    _ensure_reportlab()
    plot_x = x + 8
    plot_y = y - height
    plot_w = max(width - 16, 80)
    plot_h = max(height - 22, 48)
    left_pad = 18
    right_pad = 8
    bottom_pad = 14
    top_pad = 8
    gx = plot_x + left_pad
    gy = plot_y + bottom_pad
    gw = max(plot_w - left_pad - right_pad, 10)
    gh = max(plot_h - top_pad - bottom_pad, 10)

    c.setFillColor(HexColor("#ffffff"))
    c.setStrokeColor(HexColor("#e2e8f0"))
    c.roundRect(plot_x, plot_y, plot_w, plot_h, 6, stroke=1, fill=1)

    c.setStrokeColor(HexColor("#e2e8f0"))
    c.setLineWidth(0.5)
    for i in range(5):
        yy = gy + (gh / 4.0) * i
        c.line(gx, yy, gx + gw, yy)

    n = max(len(labels), len(primary), len(secondary), 2)
    p_vals = [float(primary[i]) if i < len(primary) else 0.0 for i in range(n)]
    s_vals = [float(secondary[i]) if i < len(secondary) else 0.0 for i in range(n)]
    vmax = max(max(p_vals or [0.0]), max(s_vals or [0.0]), 1.0)

    def _px(i: int) -> float:
        return gx + (i / max(n - 1, 1)) * gw

    def _py(v: float) -> float:
        return gy + (v / vmax) * gh

    c.setStrokeColor(HexColor("#94a3b8"))
    c.setLineWidth(1.4)
    for i in range(1, n):
        c.line(_px(i - 1), _py(s_vals[i - 1]), _px(i), _py(s_vals[i]))
    c.setFillColor(HexColor("#94a3b8"))
    for i in range(n):
        c.circle(_px(i), _py(s_vals[i]), 1.8, stroke=0, fill=1)

    c.setStrokeColor(HexColor(accent_hex))
    c.setLineWidth(2.2)
    for i in range(1, n):
        c.line(_px(i - 1), _py(p_vals[i - 1]), _px(i), _py(p_vals[i]))
    c.setFillColor(HexColor(accent_hex))
    for i in range(n):
        c.circle(_px(i), _py(p_vals[i]), 2.8, stroke=0, fill=1)

    c.setFillColor(HexColor("#0f172a"))
    c.setFont(_font(), 7.6)
    if labels:
        c.drawString(gx, plot_y + 3, str(labels[0])[:8])
        c.drawCentredString(gx + (gw / 2), plot_y + 3, str(labels[len(labels) // 2])[:8])
        c.drawRightString(gx + gw, plot_y + 3, str(labels[-1])[:8])

    c.setFillColor(HexColor(accent_hex))
    c.setFont(_font(sans_bold=True), 7.8)
    c.drawString(plot_x + 8, plot_y + plot_h - 10, primary_label[:26])
    c.setFillColor(HexColor("#64748b"))
    c.setFont(_font(), 7.8)
    c.drawString(plot_x + 92, plot_y + plot_h - 10, secondary_label[:26])

    c.setFillColor(HexColor("#0f172a"))
    c.setFont(_font(mono=True), 7.8)
    c.drawRightString(plot_x + plot_w - 8, plot_y + plot_h - 10, f"{int(p_vals[-1])} / {int(s_vals[-1])}")
    return plot_y - 10


def draw_stacked_composition_bar(
    c,
    x: float,
    y: float,
    width: float,
    title: str,
    segments: list[tuple[str, float, str]],
):
    _ensure_reportlab()
    c.setFillColor(HexColor("#0f172a"))
    c.setFont(_font(sans_bold=True), 10)
    c.drawString(x, y, title)
    y -= 14
    bar_h = 10
    total = sum(max(float(v), 0.0) for _, v, _ in segments) or 1.0
    c.setFillColor(HexColor("#f1f5f9"))
    c.roundRect(x, y - bar_h + 2, width, bar_h, 4, stroke=0, fill=1)
    cursor = x
    for _, value, color in segments:
        w = (max(float(value), 0.0) / total) * width
        if w <= 0:
            continue
        c.setFillColor(HexColor(color))
        c.rect(cursor, y - bar_h + 2, w, bar_h, stroke=0, fill=1)
        cursor += w
    y -= 14
    c.setFont(_font(), 8.1)
    for label, value, color in segments:
        pct = (max(float(value), 0.0) / total) * 100
        c.setFillColor(HexColor(color))
        c.rect(x, y - 6, 6, 6, stroke=0, fill=1)
        c.setFillColor(HexColor("#334155"))
        c.drawString(x + 10, y - 6, f"{label}: {int(value)} ({pct:.1f}%)")
        y -= 11
    return y - 12


def draw_lollipop_rank_chart(
    c,
    x: float,
    y: float,
    width: float,
    title: str,
    rows: list[dict[str, Any]],
    label_key: str = "label",
    value_key: str = "value",
    accent_hex: str = "#4f46e5",
    max_rows: int = 8,
):
    _ensure_reportlab()
    c.setFillColor(HexColor("#0f172a"))
    c.setFont(_font(sans_bold=True), 11.5)
    c.drawString(x, y, title)
    y -= 20
    label_w = max(width * 0.46, 96)
    axis_x = x + label_w
    chart_w = max(width - label_w - 22, 40)
    vals = [float(r.get(value_key, 0) or 0) for r in rows[:max_rows]]
    vmax = max(vals or [1.0])
    c.setStrokeColor(HexColor("#e2e8f0"))
    c.setLineWidth(1.8)
    c.line(axis_x, y + 4, axis_x + chart_w, y + 4)
    for r in rows[:max_rows]:
        label = str(r.get(label_key, "-"))
        val = float(r.get(value_key, 0) or 0)
        dot_x = axis_x + (val / vmax) * chart_w if vmax else axis_x
        c.setFillColor(HexColor("#475569"))
        c.setFont(_font(), 9.0)
        c.drawString(x, y, label[:28])
        c.setStrokeColor(HexColor("#cbd5e1"))
        c.setLineWidth(1.5)
        c.line(axis_x, y + 3, dot_x, y + 3)
        c.setFillColor(HexColor(accent_hex))
        c.circle(dot_x, y + 3, 2.5, stroke=0, fill=1)
        c.setFillColor(HexColor("#0f172a"))
        c.setFont(_font(mono=True), 8.5)
        c.drawString(dot_x + 6, y, str(int(val)))
        y -= 15
    return y - 8


def draw_page_footer(c, page_w: float, page_h: float, label: str, page_no: int, margin_x: float = 28):
    _ensure_reportlab()
    c.setStrokeColor(HexColor("#e2e8f0"))
    c.setLineWidth(0.6)
    c.line(margin_x, 24, page_w - margin_x, 24)
    c.setFillColor(HexColor("#94a3b8"))
    c.setFont(_font(mono=True), 7.4)
    c.drawString(margin_x, 14, label)
    c.drawRightString(page_w - margin_x, 14, f"Pág. {page_no}")
