from __future__ import annotations

from datetime import UTC, datetime

try:
    from reportlab.lib.colors import HexColor
except Exception:  # pragma: no cover
    HexColor = None


def _ensure_reportlab():
    if HexColor is None:
        raise RuntimeError("Falta dependencia reportlab para exportar PDF")


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
