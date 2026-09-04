# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import questions as Q

FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
pdfmetrics.registerFont(TTFont("AU", FONT))
pdfmetrics.registerFont(TTFont("AUB", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))

W, H = A4
ML, MR, MT, MB = 20*mm, 20*mm, 18*mm, 20*mm
CW = W - ML - MR
INK   = HexColor("#1a1a1a")
MUTED = HexColor("#5b6470")
LINE  = HexColor("#d8dde3")
ACC   = HexColor("#7a1f2b")
BOXBG = HexColor("#f5f7f9")

class Doc:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle("To'lov tizimi — qaror savollari")
        self.c.setAuthor("DaF Sprachzentrum")
        self.y = H - MT
        self.page = 1
        self.fields = 0

    def space(self, need):
        if self.y - need < MB:
            self.footer(); self.c.showPage(); self.page += 1; self.y = H - MT

    def footer(self):
        self.c.setFont("AU", 7.5); self.c.setFillColor(MUTED)
        self.c.drawString(ML, MB - 9, "DaF Sprachzentrum — to'lov tizimi qaror savollari")
        self.c.drawRightString(W - MR, MB - 9, str(self.page))
        self.c.setFillColor(INK)

    def wrap(self, text, font, size, width):
        out, line = [], ""
        for word in text.split():
            t = (line + " " + word).strip()
            if pdfmetrics.stringWidth(t, font, size) <= width:
                line = t
            else:
                if line: out.append(line)
                line = word
        if line: out.append(line)
        return out

    def para(self, text, size=9.2, font="AU", color=INK, lead=None, indent=0, gap=3):
        lead = lead or size * 1.42
        lines = self.wrap(text, font, size, CW - indent)
        self.space(len(lines) * lead + gap)
        self.c.setFont(font, size); self.c.setFillColor(color)
        for ln in lines:
            if self.y - lead < MB:
                self.footer(); self.c.showPage(); self.page += 1; self.y = H - MT
                self.c.setFont(font, size); self.c.setFillColor(color)
            self.y -= lead
            self.c.drawString(ML + indent, self.y, ln)
        self.y -= gap
        self.c.setFillColor(INK)

    def field(self, name, label, height=13*mm):
        self.space(height + 12)
        self.c.setFont("AU", 7.6); self.c.setFillColor(MUTED)
        self.y -= 9
        self.c.drawString(ML, self.y, label)
        self.y -= height + 2
        self.c.acroForm.textfield(
            name=name, tooltip=label, x=ML, y=self.y, width=CW, height=height,
            borderColor=LINE, fillColor=white, textColor=INK,
            fontName="Helvetica", fontSize=9.5, borderWidth=0.7,
            forceBorder=True, fieldFlags="multiline" if height > 8*mm else "",
        )
        self.fields += 1
        self.y -= 6
        self.c.setFillColor(INK)

d = Doc(sys.argv[1])
c = d.c

# ── Sarlavha ────────────────────────────────────────────────────────────
c.setFillColor(ACC); c.rect(0, H - 46*mm, W, 46*mm, stroke=0, fill=1)
c.setFillColor(white)
c.setFont("AUB", 21); c.drawString(ML, H - 24*mm, "To'lov tizimi — qaror savollari")
c.setFont("AU", 10.5); c.drawString(ML, H - 32*mm, "DaF Sprachzentrum · ma'muriyat uchun · 2026-yil sentabr")
c.setFont("AU", 9); c.drawString(ML, H - 39*mm, "35 ta savol · 7 bo'lim · javoblar shu hujjatning o'ziga yoziladi")
d.y = H - 56*mm
c.setFillColor(INK)

for t, b in Q.INTRO:
    d.para(t, size=10.5, font="AUB", gap=2)
    d.para(b, size=9.2, color=MUTED, gap=8)

# ── 0-bo'lim: hozirgi holat ─────────────────────────────────────────────
d.space(40)
d.y -= 6
c.setFillColor(ACC); c.rect(ML, d.y - 2, CW, 1.4, stroke=0, fill=1); c.setFillColor(INK)
d.y -= 6
d.para(Q.STATE["title"], size=11.5, font="AUB", gap=6)

for title, rows in Q.STATE["blocks"]:
    d.para(title, size=9.6, font="AUB", gap=3)
    ncol = len(rows[0])
    colw = [CW*0.34] + [(CW*0.66)/(ncol-1)]*(ncol-1) if ncol > 2 else [CW*0.5, CW*0.5]
    rh = 13
    d.space(rh * (len(rows) + 1))
    for i, row in enumerate(rows):
        if d.y - rh < MB:
            d.footer(); c.showPage(); d.page += 1; d.y = H - MT
        d.y -= rh
        if i == 0:
            c.setFillColor(BOXBG); c.rect(ML, d.y - 3, CW, rh, stroke=0, fill=1)
            c.setFillColor(INK); c.setFont("AUB", 8.4)
        else:
            c.setFont("AU", 8.6); c.setFillColor(INK)
        x = ML + 3
        for j, cell in enumerate(row):
            if j == 0: c.drawString(x, d.y, str(cell))
            else: c.drawRightString(x + colw[j] - 6, d.y, str(cell))
            x += colw[j]
        c.setStrokeColor(LINE); c.setLineWidth(0.4)
        c.line(ML, d.y - 4, ML + CW, d.y - 4)
    d.y -= 8

for n in Q.STATE["notes"]:
    d.para("•  " + n, size=8.8, color=MUTED, indent=4, gap=4)

# ── Savollar ────────────────────────────────────────────────────────────
qno = 0
for sec in Q.SECTIONS:
    d.space(60)
    d.y -= 10
    c.setFillColor(ACC); c.rect(ML, d.y - 2, CW, 1.4, stroke=0, fill=1); c.setFillColor(INK)
    d.y -= 6
    d.para(sec["title"], size=11.5, font="AUB", gap=3)
    d.para(sec["intro"], size=8.8, color=MUTED, gap=8)

    for q in sec["questions"]:
        qno += 1
        d.space(78)
        d.para(f"{qno}.  {q['q']}", size=10, font="AUB", gap=4)
        d.para(q["situation"], size=9.1, gap=4)
        d.para("Nega muhim:  " + q["why"], size=8.8, color=MUTED, gap=5)
        for opt in q["options"]:
            d.para(opt, size=9.1, indent=10, gap=1.5)
        d.y -= 3
        d.field(f"javob_{qno}", "Javob (A / B / C yoki o'z variantingiz):", height=11*mm)
        d.field(f"izoh_{qno}", "Izoh:", height=13*mm)
        d.y -= 5
        c.setStrokeColor(LINE); c.setLineWidth(0.4)
        if d.y - 6 > MB:
            c.line(ML, d.y, ML + CW, d.y)
        d.y -= 8

# ── Yakun ───────────────────────────────────────────────────────────────
d.space(90)
d.y -= 8
c.setFillColor(ACC); c.rect(ML, d.y - 2, CW, 1.4, stroke=0, fill=1); c.setFillColor(INK)
d.y -= 6
d.para(Q.CLOSING[0], size=11.5, font="AUB", gap=3)
d.para(Q.CLOSING[1], size=9, color=MUTED, gap=6)
d.field("qoshimcha", "Qo'shimcha holatlar va izohlar:", height=45*mm)
d.y -= 6
d.field("imzo", "To'ldirdi (F.I.Sh., lavozim, sana):", height=11*mm)

d.footer()
c.save()
print(f"Sahifa: {d.page}, to'ldiriladigan maydon: {d.fields}")
