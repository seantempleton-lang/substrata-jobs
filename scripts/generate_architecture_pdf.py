from __future__ import annotations

import math
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "substrata-jobs-architecture.pdf"

PAGE_W, PAGE_H = landscape(A4)
DIAGRAM_LEFT = 30
DIAGRAM_RIGHT = PAGE_W - 30
DIAGRAM_TOP = PAGE_H - 76
DIAGRAM_BOTTOM = 46
DIAGRAM_W = DIAGRAM_RIGHT - DIAGRAM_LEFT
DIAGRAM_H = DIAGRAM_TOP - DIAGRAM_BOTTOM

INK = colors.HexColor("#162B3A")
MUTED = colors.HexColor("#5B6871")
LINE = colors.HexColor("#7B8790")
BORDER = colors.HexColor("#BAC4CB")
PAPER = colors.white
ACCENT = colors.HexColor("#D9414A")

PALETTE = {
    "office": (colors.HexColor("#E9F0F7"), colors.HexColor("#285778")),
    "jobs": (colors.HexColor("#E7F4F1"), colors.HexColor("#267466")),
    "field": (colors.HexColor("#F0ECF8"), colors.HexColor("#70599C")),
    "service": (colors.HexColor("#FFF3DE"), colors.HexColor("#A36A13")),
    "external": (colors.HexColor("#F0F2F4"), colors.HexColor("#69747C")),
}


def page_header(c: canvas.Canvas, page_title: str, page_number: int) -> None:
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(30, PAGE_H - 31, "Substrata Jobs - Architecture")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawRightString(PAGE_W - 30, PAGE_H - 29, "Current agreed MVP design | 20 July 2026")

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(30, PAGE_H - 53, page_title)

    c.setStrokeColor(ACCENT)
    c.setLineWidth(2)
    c.line(30, PAGE_H - 62, PAGE_W - 30, PAGE_H - 62)

    c.setStrokeColor(BORDER)
    c.setLineWidth(0.6)
    c.line(30, 32, PAGE_W - 30, 32)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(30, 19, "Substrata Jobs architecture baseline")
    c.drawRightString(PAGE_W - 30, 19, f"Page {page_number} of 4")


def mapper(view_height: float):
    sx = DIAGRAM_W / 1000.0
    sy = DIAGRAM_H / view_height

    def point(x: float, y: float) -> tuple[float, float]:
        return DIAGRAM_LEFT + x * sx, DIAGRAM_TOP - y * sy

    return point, sx, sy


def draw_node(
    c: canvas.Canvas,
    point,
    sx: float,
    sy: float,
    node: dict,
) -> None:
    x, top = point(node["x"], node["y"])
    width = node["w"] * sx
    height = node["h"] * sy
    y = top - height
    fill, stroke = PALETTE[node["type"]]

    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1)
    c.roundRect(x, y, width, height, 7, fill=1, stroke=1)

    available_w = width - 16
    available_h = height - 12
    paragraph = None
    paragraph_h = 0
    for body_size in (8.3, 7.9, 7.5, 7.1):
        title_size = body_size + 1.6
        leading = body_size + 2.1
        lines = "<br/>".join(escape(line) for line in node["lines"])
        html = (
            f'<font name="Helvetica-Bold" size="{title_size}" color="#162B3A">'
            f'{escape(node["title"])}</font><br/>'
            f'<font name="Helvetica" size="{body_size}" color="#5B6871">{lines}</font>'
        )
        style = ParagraphStyle(
            "node",
            fontName="Helvetica",
            fontSize=body_size,
            leading=leading,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=0,
            spaceBefore=0,
        )
        candidate = Paragraph(html, style)
        _, candidate_h = candidate.wrap(available_w, available_h)
        paragraph = candidate
        paragraph_h = candidate_h
        if candidate_h <= available_h:
            break

    paragraph.drawOn(c, x + 8, y + height - 7 - paragraph_h)


def draw_arrowhead(c: canvas.Canvas, start: tuple[float, float], end: tuple[float, float]) -> None:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return
    ux, uy = dx / length, dy / length
    size = 5.3
    wing = 2.8
    base_x = end[0] - ux * size
    base_y = end[1] - uy * size
    px, py = -uy, ux
    path = c.beginPath()
    path.moveTo(end[0], end[1])
    path.lineTo(base_x + px * wing, base_y + py * wing)
    path.lineTo(base_x - px * wing, base_y - py * wing)
    path.close()
    c.setFillColor(LINE)
    c.drawPath(path, fill=1, stroke=0)


def draw_edge(c: canvas.Canvas, point, edge: dict) -> None:
    points = [point(x, y) for x, y in edge["points"]]
    c.saveState()
    c.setStrokeColor(LINE)
    c.setFillColor(LINE)
    c.setLineWidth(1.1)
    if edge.get("dashed"):
        c.setDash(4, 3)
    path = c.beginPath()
    path.moveTo(*points[0])
    for p in points[1:]:
        path.lineTo(*p)
    c.drawPath(path, fill=0, stroke=1)
    c.setDash()
    draw_arrowhead(c, points[-2], points[-1])
    if edge.get("both"):
        draw_arrowhead(c, points[1], points[0])

    if edge.get("label"):
        lx, ly = point(*edge["label_at"])
        label = edge["label"]
        c.setFont("Helvetica", 6.8)
        text_w = stringWidth(label, "Helvetica", 6.8)
        c.setFillColor(PAPER)
        c.roundRect(lx - text_w / 2 - 3, ly - 4, text_w + 6, 10, 2, fill=1, stroke=0)
        c.setFillColor(MUTED)
        c.drawCentredString(lx, ly - 1.4, label)
    c.restoreState()


def draw_legend(c: canvas.Canvas) -> None:
    entries = [
        ("office", "Operational source"),
        ("jobs", "Daily operations"),
        ("field", "Technical records"),
        ("service", "Platform service"),
        ("external", "External recipient"),
    ]
    x = 34
    y = 39
    for key, label in entries:
        fill, stroke = PALETTE[key]
        c.setFillColor(fill)
        c.setStrokeColor(stroke)
        c.roundRect(x, y - 3, 8, 8, 2, fill=1, stroke=1)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 6.6)
        c.drawString(x + 12, y - 1.2, label)
        x += 12 + stringWidth(label, "Helvetica", 6.6) + 22


def draw_page(c: canvas.Canvas, title: str, page_number: int, view_height: int, nodes: list, edges: list) -> None:
    page_header(c, title, page_number)
    point, sx, sy = mapper(view_height)
    for edge in edges:
        draw_edge(c, point, edge)
    for node in nodes:
        draw_node(c, point, sx, sy, node)
    draw_legend(c)
    c.showPage()


def system_landscape(c: canvas.Canvas) -> None:
    nodes = [
        {"x":45,"y":50,"w":240,"h":105,"type":"office","title":"Substrata Ops Manager","lines":["Users and authentication","Jobs, rigs, people","Planner assignments"]},
        {"x":45,"y":220,"w":240,"h":85,"type":"office","title":"Supervisor review","lines":["Return, correct, approve","Reopen with reason"]},
        {"x":380,"y":85,"w":240,"h":110,"type":"service","title":"Shared platform API","lines":["Authorization and audit","Revisioned writes","No direct database access"]},
        {"x":715,"y":50,"w":240,"h":105,"type":"service","title":"Postgres","lines":["Operational master data","Daily logs and revisions","PDF and email history"]},
        {"x":715,"y":220,"w":240,"h":85,"type":"service","title":"PDF and email service","lines":["Draft and final PDFs","Deliberate send only"]},
        {"x":380,"y":235,"w":240,"h":70,"type":"external","title":"Client representative","lines":["On-device signature or PDF"]},
        {"x":45,"y":410,"w":240,"h":110,"type":"jobs","title":"Substrata Jobs PWA","lines":["Rig and ancillary logs","Activities, crew, quantities","Client acknowledgement"]},
        {"x":380,"y":410,"w":240,"h":110,"type":"service","title":"IndexedDB on device","lines":["Offline assignments","Local-first drafts","Pending sync queue"]},
        {"x":715,"y":390,"w":240,"h":95,"type":"field","title":"Substrata Field","lines":["Points and technical modules","Photos remain here"]},
        {"x":715,"y":520,"w":240,"h":55,"type":"field","title":"CORE-GS","lines":["Technical source of truth"]},
    ]
    edges = [
        {"points":[(285,103),(380,140)],"label":"master data","label_at":(334,98)},
        {"points":[(620,140),(715,103)],"label":"read / write","label_at":(668,97),"both":True},
        {"points":[(165,220),(165,155)],"label":"review","label_at":(205,188),"both":True},
        {"points":[(620,175),(670,175),(670,262),(715,262)],"label":"render","label_at":(669,211)},
        {"points":[(715,272),(620,272)],"label":"deliberate send","label_at":(668,253)},
        {"points":[(165,410),(165,350),(405,195)],"label":"authenticated API","label_at":(274,326),"both":True},
        {"points":[(285,465),(380,465)],"label":"local first","label_at":(332,445),"both":True},
        {"points":[(285,505),(500,560),(680,520),(715,450)],"label":"job + point + log context","label_at":(500,548)},
        {"points":[(835,485),(835,520)],"label":"validated records","label_at":(900,504),"both":True},
    ]
    draw_page(c, "1. System landscape", 1, 600, nodes, edges)


def data_ownership(c: canvas.Canvas) -> None:
    nodes = [
        {"x":35,"y":55,"w":285,"h":240,"type":"office","title":"Ops Manager owns","lines":["Users and authority","Clients and contacts","Jobs and shared job number","Rigs, equipment, personnel","Planner assignments","Supervisor approval"]},
        {"x":358,"y":55,"w":285,"h":285,"type":"jobs","title":"Substrata Jobs owns","lines":["Rig and ancillary records","Shift start and finish","Continuous activities","Actual crew attendance","Point work segments","Materials and measurements","Signatures and PDFs","Revisions and audit"]},
        {"x":680,"y":55,"w":285,"h":240,"type":"field","title":"Field and CORE-GS own","lines":["Projects and points","Geology and testing","Core and water","Installations and backfill","Technical lookups","Photos"]},
        {"x":205,"y":410,"w":590,"h":120,"type":"service","title":"Shared platform services support","lines":["Authentication and authorization","Offline queue and idempotent sync","PDF rendering and deliberate email","Integration mapping - never a second source of truth"]},
    ]
    edges = [
        {"points":[(320,175),(358,175)]},
        {"points":[(643,175),(680,175)],"both":True},
        {"points":[(177,295),(177,365),(330,410)],"label":"shared identity","label_at":(250,360)},
        {"points":[(500,340),(500,410)],"label":"persist + sync","label_at":(561,377),"both":True},
        {"points":[(823,295),(823,365),(670,410)],"label":"API bridge","label_at":(750,360)},
    ]
    draw_page(c, "2. Data ownership", 2, 570, nodes, edges)


def log_lifecycle(c: canvas.Canvas) -> None:
    nodes = [
        {"x":30,"y":30,"w":190,"h":85,"type":"office","title":"1. Assignment","lines":["My assignments on","Others selectable"]},
        {"x":280,"y":30,"w":190,"h":85,"type":"jobs","title":"2. Start log","lines":["Rig or ancillary","Start shift - Now"]},
        {"x":530,"y":30,"w":210,"h":100,"type":"jobs","title":"3. Continuous work","lines":["Start next - Now","Job or ancillary code","No gaps or overlaps"]},
        {"x":790,"y":30,"w":180,"h":100,"type":"field","title":"Point change","lines":["Depth and status","Field handoff"]},
        {"x":530,"y":180,"w":210,"h":85,"type":"jobs","title":"4. End shift","lines":["End shift - Now","Validate timeline"]},
        {"x":280,"y":180,"w":190,"h":100,"type":"external","title":"5. Client status","lines":["Drawn signature","or absence reason","Optional email"]},
        {"x":30,"y":180,"w":190,"h":100,"type":"jobs","title":"6. Submit revision","lines":["Immutable snapshot","Draft PDF","Send is deliberate"]},
        {"x":390,"y":330,"w":220,"h":85,"type":"office","title":"7. Supervisor review","lines":["Approve, return","or correct"]},
        {"x":60,"y":475,"w":220,"h":90,"type":"jobs","title":"Returned","lines":["Driller corrects","New revision"]},
        {"x":390,"y":475,"w":220,"h":100,"type":"jobs","title":"Material correction","lines":["Time, quantity, crew","point, code or work","Driller confirms"]},
        {"x":720,"y":475,"w":220,"h":100,"type":"office","title":"Approved","lines":["Locked revision","Reopen with reason"]},
    ]
    edges = [
        {"points":[(220,72),(280,72)]},
        {"points":[(470,72),(530,72)]},
        {"points":[(740,80),(790,80)],"label":"as needed","label_at":(765,59),"both":True},
        {"points":[(635,130),(635,180)]},
        {"points":[(530,222),(470,230)]},
        {"points":[(280,230),(220,230)]},
        {"points":[(125,280),(125,300),(390,372)],"label":"submitted revision","label_at":(250,318)},
        {"points":[(450,415),(450,445),(170,445),(170,475)],"label":"return","label_at":(300,430)},
        {"points":[(500,415),(500,475)],"label":"edit / confirm","label_at":(555,449),"both":True},
        {"points":[(550,415),(550,445),(830,445),(830,475)],"label":"approve","label_at":(700,430)},
        {"points":[(60,520),(12,520),(12,230),(30,230)],"label":"resubmit","label_at":(42,377)},
    ]
    draw_page(c, "3. Daily log lifecycle", 3, 600, nodes, edges)


def offline_sync(c: canvas.Canvas) -> None:
    nodes = [
        {"x":35,"y":55,"w":225,"h":100,"type":"office","title":"Ops master data","lines":["Assignments","Users, rigs, catalogues"]},
        {"x":388,"y":55,"w":225,"h":100,"type":"service","title":"Shared API","lines":["Authenticated pull","Scoped to relevant work"]},
        {"x":740,"y":55,"w":225,"h":100,"type":"service","title":"IndexedDB cache","lines":["Current work window","14-day local retention"]},
        {"x":740,"y":240,"w":225,"h":110,"type":"jobs","title":"Local-first edit","lines":["Save before upload","Survives restart","Works without coverage"]},
        {"x":388,"y":240,"w":225,"h":110,"type":"service","title":"Pending outbox","lines":["Stable UUID","Revision and idempotency key","Retry without duplicates"]},
        {"x":35,"y":240,"w":225,"h":110,"type":"service","title":"Postgres record","lines":["Authoritative revision","Audit and conflict state","Never silent overwrite"]},
        {"x":388,"y":430,"w":225,"h":85,"type":"jobs","title":"Visible sync state","lines":["Pending - Synced - Failed","Explicit Sync action"]},
        {"x":740,"y":430,"w":225,"h":85,"type":"field","title":"Field sync path","lines":["Context handoff","Technical writes to CORE-GS"]},
    ]
    edges = [
        {"points":[(260,105),(388,105)],"label":"assignments + catalogues","label_at":(324,84)},
        {"points":[(613,105),(740,105)],"label":"cache","label_at":(676,84)},
        {"points":[(853,155),(853,240)],"label":"open offline","label_at":(910,202)},
        {"points":[(740,295),(613,295)],"label":"queue locally","label_at":(676,274)},
        {"points":[(388,295),(260,295)],"label":"sync when online","label_at":(324,274)},
        {"points":[(147,240),(147,200),(470,200),(500,155)],"label":"server response","label_at":(325,184)},
        {"points":[(500,350),(500,430)],"label":"state","label_at":(535,392)},
        {"points":[(853,350),(853,430)],"label":"technical module","label_at":(916,392)},
        {"points":[(740,472),(613,472)],"label":"linked by log UUID","label_at":(676,451),"dashed":True},
    ]
    draw_page(c, "4. Offline and synchronization", 4, 560, nodes, edges)


def generate() -> Path:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=landscape(A4), pageCompression=1)
    c.setTitle("Substrata Jobs Architecture")
    c.setAuthor("McMillan Drilling")
    c.setSubject("Current agreed Substrata Jobs MVP architecture")
    system_landscape(c)
    data_ownership(c)
    log_lifecycle(c)
    offline_sync(c)
    c.save()
    return OUTPUT


if __name__ == "__main__":
    print(generate())
