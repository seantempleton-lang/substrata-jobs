from __future__ import annotations

import math
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "substrata-jobs-daily-workflow.pdf"

PAGE_W, PAGE_H = landscape(A3)
INK = colors.HexColor("#162B3A")
MUTED = colors.HexColor("#566570")
LINE = colors.HexColor("#788791")
BORDER = colors.HexColor("#B7C1C8")
PAPER = colors.white
ACCENT = colors.HexColor("#D9414A")

PALETTE = {
    "office": (colors.HexColor("#E9F0F7"), colors.HexColor("#285778")),
    "jobs": (colors.HexColor("#E7F4F1"), colors.HexColor("#267466")),
    "field": (colors.HexColor("#F0ECF8"), colors.HexColor("#70599C")),
    "service": (colors.HexColor("#FFF3DE"), colors.HexColor("#A36A13")),
    "external": (colors.HexColor("#F0F2F4"), colors.HexColor("#69747C")),
    "decision": (colors.HexColor("#FBEAEC"), colors.HexColor("#B43640")),
}


def cy(top: float) -> float:
    return PAGE_H - top


def paragraph_for_box(title: str, lines: list[str], width: float, height: float) -> tuple[Paragraph, float]:
    paragraph = None
    paragraph_h = 0
    for body_size in (7.8, 7.4, 7.0, 6.6):
        title_size = body_size + 1.6
        leading = body_size + 2.0
        body = "<br/>".join(escape(line) for line in lines)
        html = (
            f'<font name="Helvetica-Bold" size="{title_size}" color="#162B3A">'
            f'{escape(title)}</font><br/>'
            f'<font name="Helvetica" size="{body_size}" color="#566570">{body}</font>'
        )
        style = ParagraphStyle(
            "workflow-node",
            fontName="Helvetica",
            fontSize=body_size,
            leading=leading,
            textColor=INK,
            alignment=TA_LEFT,
            spaceBefore=0,
            spaceAfter=0,
        )
        candidate = Paragraph(html, style)
        _, candidate_h = candidate.wrap(width, height)
        paragraph = candidate
        paragraph_h = candidate_h
        if candidate_h <= height:
            break
    return paragraph, paragraph_h


def draw_box(c: canvas.Canvas, x: float, top: float, w: float, h: float, kind: str, title: str, lines: list[str]) -> None:
    y = cy(top + h)
    fill, stroke = PALETTE[kind]
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1.1)
    c.roundRect(x, y, w, h, 7, fill=1, stroke=1)
    paragraph, paragraph_h = paragraph_for_box(title, lines, w - 14, h - 12)
    paragraph.drawOn(c, x + 7, y + h - 6 - paragraph_h)


def draw_decision(c: canvas.Canvas, x: float, top: float, w: float, h: float, title: str, lines: list[str]) -> None:
    y_top = cy(top)
    y_bottom = cy(top + h)
    mid_x = x + w / 2
    mid_y = (y_top + y_bottom) / 2
    fill, stroke = PALETTE["decision"]
    path = c.beginPath()
    path.moveTo(mid_x, y_top)
    path.lineTo(x + w, mid_y)
    path.lineTo(mid_x, y_bottom)
    path.lineTo(x, mid_y)
    path.close()
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1.1)
    c.drawPath(path, fill=1, stroke=1)

    paragraph, paragraph_h = paragraph_for_box(title, lines, w * 0.68, h * 0.58)
    paragraph.drawOn(c, mid_x - w * 0.34, mid_y - paragraph_h / 2)


def arrowhead(c: canvas.Canvas, start: tuple[float, float], end: tuple[float, float]) -> None:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    size = 5.7
    wing = 3.0
    base_x = end[0] - ux * size
    base_y = end[1] - uy * size
    path = c.beginPath()
    path.moveTo(end[0], end[1])
    path.lineTo(base_x + px * wing, base_y + py * wing)
    path.lineTo(base_x - px * wing, base_y - py * wing)
    path.close()
    c.setFillColor(LINE)
    c.drawPath(path, fill=1, stroke=0)


def draw_arrow(
    c: canvas.Canvas,
    points: list[tuple[float, float]],
    label: str | None = None,
    label_at: tuple[float, float] | None = None,
    dashed: bool = False,
    both: bool = False,
) -> None:
    converted = [(x, cy(top)) for x, top in points]
    c.saveState()
    c.setStrokeColor(LINE)
    c.setLineWidth(1.0)
    if dashed:
        c.setDash(4, 3)
    path = c.beginPath()
    path.moveTo(*converted[0])
    for point in converted[1:]:
        path.lineTo(*point)
    c.drawPath(path, fill=0, stroke=1)
    c.setDash()
    arrowhead(c, converted[-2], converted[-1])
    if both:
        arrowhead(c, converted[1], converted[0])

    if label and label_at:
        lx, ly = label_at[0], cy(label_at[1])
        c.setFont("Helvetica", 6.8)
        text_w = stringWidth(label, "Helvetica", 6.8)
        c.setFillColor(PAPER)
        c.roundRect(lx - text_w / 2 - 3, ly - 4, text_w + 6, 10, 2, fill=1, stroke=0)
        c.setFillColor(MUTED)
        c.drawCentredString(lx, ly - 1.5, label)
    c.restoreState()


def draw_phase(c: canvas.Canvas, x: float, w: float, label: str, number: str) -> None:
    top = 76
    h = 27
    c.setFillColor(INK)
    c.setStrokeColor(INK)
    c.roundRect(x, cy(top + h), w, h, 5, fill=1, stroke=0)
    c.setFillColor(PAPER)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(x + 9, cy(top + 18), f"{number}  {label}")


def draw_legend(c: canvas.Canvas) -> None:
    entries = [
        ("office", "Ops Manager / authority"),
        ("jobs", "Jobs field action"),
        ("field", "Field / CORE-GS"),
        ("service", "Platform / offline service"),
        ("external", "Client interaction"),
        ("decision", "Decision / validation"),
    ]
    x = 31
    y = 31
    for key, label in entries:
        fill, stroke = PALETTE[key]
        c.setFillColor(fill)
        c.setStrokeColor(stroke)
        c.roundRect(x, y - 3, 8, 8, 2, fill=1, stroke=1)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 6.6)
        c.drawString(x + 12, y - 1.2, label)
        x += 12 + stringWidth(label, "Helvetica", 6.6) + 22


def draw_header(c: canvas.Canvas) -> None:
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(30, PAGE_H - 31, "Substrata Jobs - Detailed Daily Workflow")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawRightString(PAGE_W - 30, PAGE_H - 29, "Rig shift and ancillary-only paths | Offline-first MVP")
    c.setStrokeColor(ACCENT)
    c.setLineWidth(2)
    c.line(30, PAGE_H - 54, PAGE_W - 30, PAGE_H - 54)

    c.setStrokeColor(BORDER)
    c.setLineWidth(0.6)
    c.line(30, 45, PAGE_W - 30, 45)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.2)
    c.drawString(30, 17, "Current agreed design | 20 July 2026 | New Zealand time")
    c.drawRightString(PAGE_W - 30, 17, "A3 landscape | One-page workflow")


def generate() -> Path:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=landscape(A3), pageCompression=1)
    c.setTitle("Substrata Jobs Detailed Daily Workflow")
    c.setAuthor("McMillan Drilling")
    c.setSubject("Detailed one-page workflow for Substrata Jobs")
    draw_header(c)

    phases = [
        (30, 150, "PREPARE", "1"),
        (190, 155, "SET UP LOG", "2"),
        (355, 260, "RECORD WORK", "3"),
        (625, 140, "CLOSE SHIFT", "4"),
        (775, 150, "SUBMIT", "5"),
        (935, 225, "REVIEW", "6"),
    ]
    for phase in phases:
        draw_phase(c, *phase)

    # Phase 1 - prepare
    draw_box(c, 35, 120, 140, 70, "jobs", "Open Jobs PWA", ["Authenticate or resume", "cached session"])
    draw_box(c, 35, 210, 140, 90, "office", "Load assignments", ["My assignments only on", "Others selectable", "Cache relevant work"])
    draw_decision(c, 45, 325, 120, 80, "Record type?", ["Rig shift or", "ancillary-only"])
    draw_box(c, 35, 430, 140, 85, "jobs", "Rig shift", ["Job and rig required", "Client workflow enabled"])
    draw_box(c, 35, 535, 140, 100, "jobs", "Ancillary day", ["Individual or group", "No job or rig required", "Payroll coding only"])
    draw_box(c, 35, 665, 140, 80, "service", "Offline is allowed", ["Use cached assignment", "Every edit saves locally"])

    # Phase 2 - set up
    draw_box(c, 195, 120, 145, 125, "jobs", "Verify record context", ["Rig: job, rig and driller", "Ancillary: individual or group", "Planned crew", "Point optional at start"])
    draw_decision(c, 205, 275, 125, 85, "Continue work?", ["Previous log", "available"])
    draw_box(c, 195, 385, 145, 105, "jobs", "Carry forward only", ["New UUID", "Job, rig and point", "Finishing depth", "Setup details and link"])
    draw_box(c, 195, 525, 145, 85, "jobs", "Confirm actual crew", ["Defaults to shift time", "Add or remove deviations"])
    draw_box(c, 195, 650, 145, 85, "jobs", "Start shift - Now", ["Editable timestamp", "Creates first activity"])

    # Phase 3 - record work
    draw_box(c, 365, 120, 240, 115, "jobs", "Continuous activity timeline", ["One primary activity at all times", "Start next - Now closes previous", "Job number or ancillary allocation", "Point optional for general work"])
    draw_box(c, 365, 265, 240, 80, "jobs", "Start next activity - Now", ["Finish current and start next", "Same timestamp - no gap"])
    draw_box(c, 365, 375, 112, 105, "field", "Change point", ["Prompt finishing depth", "Set point status", "Select next point"])
    draw_box(c, 488, 375, 117, 105, "jobs", "Crew change", ["Joined / Left - Now", "Editable attendance", "Multiple periods allowed"])
    draw_box(c, 365, 510, 112, 105, "jobs", "Site data", ["Materials and units", "Services / subcontractors", "Measurements"])
    draw_box(c, 488, 510, 117, 105, "field", "Technical module", ["Pass job, point, log UUID", "Geology, testing, install", "Photos stay in Field"])
    draw_box(c, 365, 645, 240, 100, "service", "Local-first save and sync", ["Draft survives restart and no coverage", "Outbox retries with stable UUID and revision", "Pending - Synced - Failed is always visible"])

    # Phase 4 - close
    draw_box(c, 630, 160, 130, 80, "jobs", "End shift - Now", ["Closes active activity", "Sets shift finish"])
    draw_box(c, 630, 275, 130, 90, "field", "Close active point", ["Finishing depth", "Continued / Completed", "or Abandoned"])
    draw_decision(c, 630, 405, 130, 125, "Validation gate", ["No gaps / overlaps", "No unfinished activity", "Crew times valid", "Required data present"])
    draw_box(c, 630, 565, 130, 70, "decision", "Validation failed", ["Open exact issue", "Correct and recheck"])
    draw_box(c, 630, 665, 130, 80, "jobs", "Handover option", ["Next driller starts", "a new carried-forward log"])

    # Phase 5 - submit
    draw_box(c, 780, 120, 140, 130, "external", "Client acknowledgement", ["Rig shift only", "Drawn signature or reason", "Name, role and timestamp", "Optional client email"])
    draw_box(c, 780, 290, 140, 110, "jobs", "Submit revision", ["Immutable snapshot", "Workflow becomes Submitted", "Ancillary record skips client"])
    draw_box(c, 780, 435, 140, 100, "service", "Generate draft PDF", ["Draft watermark", "Client view excludes payroll", "and internal review data"])
    draw_box(c, 780, 570, 140, 80, "external", "Send to client", ["Deliberate action only", "Recipient and revision audited"])
    draw_box(c, 780, 680, 140, 65, "service", "Sync state", ["Retry failures", "No duplicate records"])

    # Phase 6 - review
    draw_box(c, 945, 120, 205, 100, "office", "Ops Manager review inbox", ["Supervisor opens submitted revision", "Views timeline, crew, points, quantities", "and client acknowledgement"])
    draw_decision(c, 970, 255, 155, 100, "Review outcome", ["Approve, return", "or correct"])
    draw_box(c, 945, 390, 95, 80, "office", "Approve", ["No material change", "Lock revision"])
    draw_box(c, 1050, 390, 100, 80, "office", "Return", ["Reason required", "Driller corrects"])
    draw_box(c, 945, 500, 95, 105, "office", "Admin edit", ["Spelling / format", "Audit logged", "No confirmation"])
    draw_box(c, 1050, 500, 100, 125, "office", "Material edit", ["Time, quantity, crew", "point, code or work", "Driller confirms", "or rejects"])
    draw_box(c, 945, 665, 205, 80, "office", "Approved and locked", ["Final PDF available", "Reopen requires authority and reason"])

    # Main flow
    draw_arrow(c, [(105,190),(105,210)])
    draw_arrow(c, [(105,300),(105,325)])
    draw_arrow(c, [(105,405),(105,430)], label="rig", label_at=(83,418))
    draw_arrow(c, [(45,365),(23,365),(23,585),(35,585)], label="ancillary", label_at=(23,480))
    draw_arrow(c, [(175,472),(185,472),(185,180),(195,180)])
    draw_arrow(c, [(175,585),(185,585),(185,210),(195,210)])
    draw_arrow(c, [(267,245),(267,275)])
    draw_arrow(c, [(267,360),(267,385)], label="yes", label_at=(287,374))
    draw_arrow(c, [(330,317),(345,317),(345,567),(340,567)], label="no", label_at=(344,450))
    draw_arrow(c, [(267,490),(267,525)])
    draw_arrow(c, [(267,610),(267,650)])
    draw_arrow(c, [(340,692),(355,692),(355,178),(365,178)], label="first activity", label_at=(357,425))

    # Activity loop and supporting actions
    draw_arrow(c, [(485,235),(485,265)])
    draw_arrow(c, [(605,305),(615,305),(615,150),(605,150)], label="repeat", label_at=(615,228))
    draw_arrow(c, [(425,345),(425,375)], label="point changes", label_at=(455,360))
    draw_arrow(c, [(545,345),(545,375)], label="crew changes", label_at=(575,360))
    draw_arrow(c, [(425,480),(425,510)], label="any time", label_at=(455,495))
    draw_arrow(c, [(545,480),(545,510)], label="as needed", label_at=(575,495))
    draw_arrow(c, [(421,375),(421,350),(460,350),(460,235)], dashed=True)
    draw_arrow(c, [(546,375),(546,350),(510,350),(510,235)], dashed=True)
    draw_arrow(c, [(421,510),(421,495),(475,495),(475,235)], dashed=True)
    draw_arrow(c, [(546,510),(546,495),(525,495),(525,235)], dashed=True)
    draw_arrow(c, [(485,615),(485,645)])
    draw_arrow(c, [(605,178),(625,178),(625,200),(630,200)], label="end work", label_at=(617,160))

    # Close and validation
    draw_arrow(c, [(695,240),(695,275)])
    draw_arrow(c, [(695,365),(695,405)])
    draw_arrow(c, [(695,530),(695,565)], label="fail", label_at=(718,548))
    draw_arrow(c, [(630,600),(620,600),(620,305),(605,305)], label="correct issue", label_at=(620,455))
    draw_arrow(c, [(760,467),(770,467),(770,185),(780,185)], label="pass - rig shift", label_at=(770,325))
    draw_arrow(c, [(760,500),(770,500),(770,345),(780,345)], label="pass - ancillary", label_at=(770,430))
    draw_arrow(c, [(695,635),(695,665)], label="handover if needed", label_at=(735,650))
    draw_arrow(c, [(630,705),(615,705),(615,445),(340,445)], label="new log with carry-forward", label_at=(490,430), dashed=True)

    # Submit and client path
    draw_arrow(c, [(850,250),(850,290)])
    draw_arrow(c, [(850,400),(850,435)])
    draw_arrow(c, [(850,535),(850,570)], label="optional", label_at=(878,552))
    draw_arrow(c, [(850,650),(850,680)])
    draw_arrow(c, [(920,345),(930,345),(930,170),(945,170)], label="submitted + synced", label_at=(932,275))

    # Supervisor outcomes
    draw_arrow(c, [(1048,220),(1048,255)])
    draw_arrow(c, [(1008,355),(992,390)], label="approve", label_at=(980,372))
    draw_arrow(c, [(1088,355),(1100,390)], label="return", label_at=(1122,372))
    draw_arrow(c, [(1025,355),(935,355),(935,552),(945,552)], label="admin", label_at=(935,455))
    draw_arrow(c, [(1072,355),(1160,355),(1160,562),(1150,562)], label="material", label_at=(1160,455))
    draw_arrow(c, [(1040,430),(1160,430),(1160,705),(1150,705)], label="lock", label_at=(1160,570))
    draw_arrow(c, [(992,605),(992,665)], label="approve", label_at=(1018,635))
    draw_arrow(c, [(1100,470),(930,470),(930,345),(920,345)], label="correct + resubmit", label_at=(990,455))
    draw_arrow(c, [(1100,625),(930,625),(930,365),(920,365)], label="confirm + new revision", label_at=(990,610))

    draw_legend(c)
    c.showPage()
    c.save()
    return OUTPUT


if __name__ == "__main__":
    print(generate())
