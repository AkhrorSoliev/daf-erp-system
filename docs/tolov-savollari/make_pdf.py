# -*- coding: utf-8 -*-
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import q2 as Q

T = f"{HERE}/ttf"
pdfmetrics.registerFont(TTFont("NR",  f"{T}/Newsreader-400-normal.ttf"))
pdfmetrics.registerFont(TTFont("NRM", f"{T}/Newsreader-500-normal.ttf"))
pdfmetrics.registerFont(TTFont("NRL", f"{T}/Newsreader-300-normal.ttf"))
pdfmetrics.registerFont(TTFont("DS",  f"{T}/DMSans-400-normal.ttf"))
pdfmetrics.registerFont(TTFont("DSM", f"{T}/DMSans-500-normal.ttf"))

W, H = A4
ML, MR, MT, MB = 24*mm, 24*mm, 22*mm, 20*mm
CW = W - ML - MR

PAPER = HexColor("#FAF9F5")
INK   = HexColor("#1A1915")
SOFT  = HexColor("#6B6862")
FAINT = HexColor("#B8B4AC")
CLAY  = HexColor("#B4532F")
RULE  = HexColor("#DDD9D0")

class Doc:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle("To'lov tizimi - qaror savollari")
        self.c.setAuthor("DaF Sprachzentrum")
        self.page = 0
        self.fields = 0
        self.newpage()

    def newpage(self):
        if self.page: self.foot(); self.c.showPage()
        self.page += 1
        self.c.setFillColor(PAPER); self.c.rect(0, 0, W, H, stroke=0, fill=1)
        self.c.setFillColor(INK)
        self.y = H - MT

    def foot(self):
        if self.page == 1: return
        self.c.setFont("DS", 7.5); self.c.setFillColor(FAINT)
        self.c.drawRightString(W - MR, MB - 10, str(self.page))
        self.c.setFillColor(INK)

    def wrap(self, text, font, size, width):
        out, line = [], ""
        for w in text.split():
            t = (line + " " + w).strip()
            if pdfmetrics.stringWidth(t, font, size) <= width: line = t
            else:
                if line: out.append(line)
                line = w
        if line: out.append(line)
        return out

    def need(self, h):
        if self.y - h < MB: self.newpage()

    def text(self, s, font="DS", size=9.6, color=INK, lead=None, x=0, width=None, gap=0):
        lead = lead or size * 1.55
        width = width or (CW - x)
        for ln in self.wrap(s, font, size, width):
            self.need(lead)
            self.c.setFont(font, size); self.c.setFillColor(color)
            self.y -= lead
            self.c.drawString(ML + x, self.y, ln)
        self.y -= gap
        self.c.setFillColor(INK)

    def field(self, name, h=15*mm, label=None):
        self.need(h + 14)
        if label:
            self.c.setFont("DS", 7.4); self.c.setFillColor(FAINT)
            self.y -= 10; self.c.drawString(ML, self.y, label)
        self.y -= h + 3
        self.c.acroForm.textfield(
            name=name, tooltip=label or name, x=ML, y=self.y, width=CW, height=h,
            borderColor=RULE, fillColor=white, textColor=INK,
            fontName="Helvetica", fontSize=10, borderWidth=0.6,
            forceBorder=True, fieldFlags="multiline")
        self.fields += 1
        self.c.setFillColor(INK)

d = Doc(sys.argv[1]); c = d.c

# ── Muqova ──────────────────────────────────────────────────────────────
d.y = H - 84*mm
c.setFillColor(CLAY); c.rect(ML, d.y + 26*mm, 34, 2.2, stroke=0, fill=1)
c.setFillColor(INK); c.setFont("NRL", 34)
c.drawString(ML, d.y, "To'lov tizimi")
d.y -= 13*mm
c.setFont("NRL", 34); c.setFillColor(SOFT)
c.drawString(ML, d.y, "qaror savollari")
d.y -= 20*mm
c.setFillColor(INK)
for ln in Q.LEAD:
    d.text(ln, "DS", 10.4, SOFT, lead=17, gap=5)
d.y -= 8*mm
c.setFillColor(FAINT); c.setFont("DS", 9)
c.drawString(ML, d.y, "DaF Sprachzentrum")

# ── 1-bo'lim: narxlar ───────────────────────────────────────────────────
d.newpage()
c.setFont("DSM", 9); c.setFillColor(CLAY)
d.y -= 4; c.drawString(ML, d.y, "1")
d.y -= 11*mm
c.setFont("NRL", 25); c.setFillColor(INK)
c.drawString(ML, d.y, "Kurs narxlari")
d.y -= 9*mm
d.text("Savollardagi misollar shu narxlarga tayanadi.", "DS", 9.6, SOFT, gap=8*mm)

rows = Q.PRICES
cx = [0, CW*0.60, CW*0.82]
for i, r in enumerate(rows):
    d.need(16)
    d.y -= 15
    if i == 0:
        c.setFont("DSM", 8.2); c.setFillColor(FAINT)
        c.drawString(ML, d.y, r[0])
        c.drawRightString(ML + cx[1] + 24*mm, d.y, r[1])
        c.drawRightString(ML + cx[2] + 26*mm, d.y, r[2])
        d.y -= 4
        c.setStrokeColor(RULE); c.setLineWidth(0.6)
        c.line(ML, d.y, ML + CW, d.y)
    else:
        c.setFont("DS", 10); c.setFillColor(INK)
        c.drawString(ML, d.y, r[0])
        c.setFont("DSM", 10)
        c.drawRightString(ML + cx[1] + 24*mm, d.y, r[1])
        c.setFont("DS", 10); c.setFillColor(SOFT)
        c.drawRightString(ML + cx[2] + 26*mm, d.y, r[2])
        c.setFillColor(INK)
d.y -= 12*mm

for f in Q.FACTS:
    d.need(40)
    ytop = d.y
    d.text(f, "DS", 9.6, SOFT, x=8, gap=6)
    c.setFillColor(CLAY); c.rect(ML, d.y + 3, 1.6, ytop - d.y - 6, stroke=0, fill=1)
    c.setFillColor(INK)
    d.y -= 3

# ── Savollar ────────────────────────────────────────────────────────────
LETTERS = "ABCDEFG"
qno = 0
for sec in Q.SECTIONS:
    d.newpage()
    c.setFont("DSM", 9); c.setFillColor(CLAY)
    d.y -= 4; c.drawString(ML, d.y, str(sec["n"]))
    d.y -= 11*mm
    c.setFont("NRL", 25); c.setFillColor(INK)
    c.drawString(ML, d.y, sec["title"])
    d.y -= 8*mm
    if sec.get("note"):
        d.text(sec["note"], "DS", 9.8, SOFT, gap=4*mm)
    d.y -= 2*mm

    for q in sec["questions"]:
        qno += 1
        # Savol bo'linib ketmasligi uchun butun blok balandligini oldindan
        # o'lchaymiz: raqam + savol + misol + variantlar + javob katakchasi.
        if q.get("table"):
            est = 30
            est += len(d.wrap(q["q"], "NRM", 13.2, CW)) * 19
            est += len(d.wrap(q["ex"], "DS", 9.3, CW - 9)) * 14.4 + 6
            est += 21 + (len(Q.PRICES) - 1) * 10*mm + 9*mm
        else:
            est = 30
            est += len(d.wrap(q["q"], "NRM", 13.2, CW)) * 19
            est += len(d.wrap(q["ex"], "DS", 9.3, CW - 9)) * 14.4 + 6
            for o in q["opts"]:
                est += len(d.wrap(o, "DS", 9.9, CW - 15)) * 16
            est += 14*mm + 13 + 9*mm
        d.need(est)
        d.y -= 4
        c.setFont("DSM", 8.4); c.setFillColor(CLAY)
        c.drawString(ML, d.y, f"{qno:02d}")
        d.y -= 6
        d.text(q["q"], "NRM", 13.2, INK, lead=19, gap=5)

        ytop = d.y
        d.text(q["ex"], "DS", 9.3, SOFT, x=9, gap=6)
        c.setFillColor(CLAY); c.rect(ML, d.y + 4, 1.4, ytop - d.y - 8, stroke=0, fill=1)
        c.setFillColor(INK)

        if q.get("table"):
            d.need(30)
            d.y -= 16
            c.setFont("DSM", 8.2); c.setFillColor(FAINT)
            c.drawString(ML, d.y, "Kurs")
            c.drawRightString(ML + CW*0.52, d.y, "Narx")
            c.drawString(ML + CW*0.60, d.y, "Ustoz ulushi")
            d.y -= 5
            c.setStrokeColor(RULE); c.setLineWidth(0.6)
            c.line(ML, d.y, ML + CW, d.y)
            for row in Q.PRICES[1:]:
                d.need(11*mm)
                d.y -= 10*mm
                c.setFont("DS", 10); c.setFillColor(INK)
                c.drawString(ML, d.y + 2.5*mm, row[0])
                c.setFont("DS", 10); c.setFillColor(SOFT)
                c.drawRightString(ML + CW*0.52, d.y + 2.5*mm, row[1])
                c.setFillColor(INK)
                key = row[0].lower().replace(" ", "_").replace("'", "")
                c.acroForm.textfield(
                    name=f"ulush_{key}", tooltip=f"{row[0]} — ustoz ulushi",
                    x=ML + CW*0.60, y=d.y, width=CW*0.40, height=8*mm,
                    borderColor=RULE, fillColor=white, textColor=INK,
                    fontName="Helvetica", fontSize=10, borderWidth=0.6,
                    forceBorder=True)
                d.fields += 1
            d.y -= 9*mm
            continue

        for i, o in enumerate(q["opts"]):
            d.need(20)
            first = True
            for ln in d.wrap(o, "DS", 9.9, CW - 15):
                d.need(16); d.y -= 16
                if first:
                    c.setFont("DSM", 9.9); c.setFillColor(CLAY)
                    c.drawString(ML, d.y, LETTERS[i])
                    first = False
                c.setFont("DS", 9.9); c.setFillColor(INK)
                c.drawString(ML + 15, d.y, ln)
        d.y -= 4
        d.field(f"javob_{qno}", h=14*mm, label="Javob")
        d.y -= 9*mm

# ── Yakun ───────────────────────────────────────────────────────────────
d.newpage()
c.setFont("DSM", 9); c.setFillColor(CLAY)
d.y -= 4; c.drawString(ML, d.y, "8")
d.y -= 11*mm
c.setFont("NRL", 25); c.setFillColor(INK)
c.drawString(ML, d.y, "Qo'shimcha")
d.y -= 9*mm
d.text(Q.CLOSING, "DS", 9.8, SOFT, gap=6*mm)
d.field("qoshimcha", h=70*mm)
d.y -= 12*mm
d.field("imzo", h=13*mm, label="Ism, lavozim, sana")

d.foot(); c.save()
print(f"Sahifa: {d.page}  |  maydon: {d.fields}")
