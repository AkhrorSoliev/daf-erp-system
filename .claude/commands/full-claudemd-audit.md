# Full CLAUDE.md Audit

Loyihaning barcha `CLAUDE.md` fayllarini (server + client + root, agar mavjud bo'lsa) kod bilan sistematik solishtirib chiqish. Maqsad: kodga zid yoki eskirgan qoidalarni topish.

## Arguments

`$ARGUMENTS`:
- bo'sh yoki `all` — barcha CLAUDE.md fayllarini audit qilish
- `server` — faqat `server/CLAUDE.md`
- `client` — faqat `client/CLAUDE.md`

## Methodology

Bu **diagnostic audit**, fix qilmaydi. Output — kandidat tuzatishlar ro'yxati.

CLAUDE.md = hujjat. Kod = haqiqat. Agar ziddiyat bo'lsa, **default: hujjat eskirgan deb hisoblang**. Faqat kod o'z ichida nomos bo'lsa — kod bug.

### Confidence marker — har bir finding'da majburiy

| Marker | Ma'no |
|--------|-------|
| 🔴 Confirmed | Grep qilingan, kod ko'rsatilgan, ziddiyat aniq |
| 🟡 Suspicious | Kod ko'rinmasdan kelyapti, lekin paterndan kelib chiqib ziddiyat ehtimoli bor |
| 🔵 Hypothesis | Faqat CLAUDE.md o'qib taxmin qilingan |

**Faqat 🔴 Confirmed findinglar tuzatish kandidati**.

## Phase A — CLAUDE.md tarkibini parsing

`.claude/review-output/claudemd-claims.md` faylga yozing. Har bir CLAUDE.md uchun:

### Toifa 1: Aniq verifiable claims
- Constant qiymatlar (`STUDENT_ROLE_ID = 6`, ID ranges, sequences)
- Aniq fayl yo'llari (`src/students/student-portal.controller.ts`)
- Aniq endpoint nomlari (`POST /api/payments/:id/reverse`)
- Aniq funksiya nomlari (`createStudentUser`, `processAttendanceBilling`)
- Aniq library nomlari va versiyalari
- "Not yet implemented", "Coming soon", "TBD" iboralari
- Schema field nomlari (`Student.discountPercent`, `User.mustResetPassword`)

### Toifa 2: Pattern qoidalari
- "All controllers must..."
- "Every X has Y"
- "Use Z for W"

### Toifa 3: Architectural assertions
- Folder structure ("modules in `src/<domain>/`")
- Naming conventions ("kebab-case for files")
- Required behaviors ("must record history via EntityHistoryService")

## Phase B — Verification

Har bir Toifa 1 claim uchun (verifiable):

1. **Grep yoki Read** — kod haqiqatan bunday narsani bormi/qiladmi?
2. Agar yo'q bo'lsa — qaerda? (Toifa 1: aniq tekshiriladi)
3. Output: `.claude/review-output/claudemd-toifa1-results.md`

Toifa 2 (pattern) — **namuna asosida**:
- Qoida nima kerakligini aniqlang
- 3-5 ta misol oling, har birini tekshiring
- Misollarning yarmidan ko'pi qoidaga zid kelsa — qoida eskirgan deb belgilang

Toifa 3 (architectural) — folder/fayl mavjudligi orqali tekshirish.

## Skill invocation

`Skill: documentation-writer` invoke qiling — CLAUDE.md tuzatish tavsiyalarini formatlash uchun.

Diátaxis pattern: CLAUDE.md asosan "reference" janrida. Tuzatishlar reference uslubida (aniq, foydalanishga tayyor) bo'lishi kerak.

## Output

`.claude/review-output/claudemd-audit-REPORT.md`:

```markdown
# CLAUDE.md Audit — <sana>

## Sumary

| Fayl | Outdated 🔴 | Wrong 🔴 | Missing 🟡 |
|------|-------------|----------|------------|
| server/CLAUDE.md | N | N | N |
| client/CLAUDE.md | N | N | N |

## server/CLAUDE.md

### S1. <Qisqa title> 🔴
**CLAUDE.md (line N):** "<aniq quote>"
**Kod:** <file:line, grep natijasi>
**Tuzatish:**
```diff
- eski qator
+ yangi qator
```

### S2. ...

## client/CLAUDE.md

(same format)

## Tavsiya etilgan tuzatish strategiyasi

1. Avval 🔴 Confirmed barchasini bitta PR'da hal qiling
2. 🟡 Suspicious'larni alohida tekshiring (deeper grep, kontekst)
3. Missing (kod aytadi, CLAUDE.md aytmaydi) — yangi sectionlar yoziladi
```

## Rules

1. **Style preferences flag qilmaslik** — faqat fakt-based zidliklar. "Bu paragraf yaxshi yozilmagan" — bu audit emas.
2. **Konkret havola majburiy** — har bir finding'da `file:line` bo'lishi shart.
3. **Memory'dagi qoidalar** (CEO branch access kabi) — bu audit'da hisobga oling, ular CLAUDE.md'ni o'zgartirmaydi.
4. **Audit faqat o'qish** — CLAUDE.md fayllariga **tegmaydi**. Tuzatishlarni alohida vazifa sifatida foydalanuvchi hal qiladi.
5. **Skip qilingan claim** — agar siz qiyin/qimmat ko'rgan claim'ni tekshirmagan bo'lsangiz, REPORT'da "skipped: <sabab>" deb yozing.