# Full Project Review (v2)

Kodbazani ikki bosqichda review qilish: avval **sistemani tushunish** (Research), keyin **skill'lar bilan baholash** (Audit). Severity'ni faqat code path tasdiqlangandan keyin qo'yiladi.

## Arguments

`$ARGUMENTS`:
- bo'sh yoki `all` — butun loyiha
- path (`server/src/payments/`) — papka
- `diff` — `main`'dan farqlar
- `client` yoki `server` — workspace

Bo'sh bo'lsa, foydalanuvchidan scope so'rang.

---

## Methodology — eng muhim qoidalar

Bu komandaning **maqsadi**: yuzaki "podozritelnyy" findinglarni topish emas, **real impactga ega bug'larni** topish.

### Confidence marker — har bir findingda majburiy

| Marker | Ma'no | Severity chegarasi |
|--------|-------|-------------------|
| 🔴 **Confirmed** | Code path traced. Real flow ma'lum. Production'da haqiqatan ishlaydi. | Har qanday severity |
| 🟡 **Suspicious** | Kod xavfli ko'rinadi, lekin qachon/qaerda ishlashi tekshirilmagan | Max Medium |
| 🔵 **Hypothesis** | CLAUDE.md, naming, yoki shablon asosida taxmin. Kod bilan tasdiqlanmagan | Max Low |

**Qoida: 🔴 Confirmed bo'lmagan finding hech qachon Critical emas.**

### CLAUDE.md — haqiqat emas, gipoteza

CLAUDE.md eskirgan bo'lishi mumkin. Agar CLAUDE.md qoidasi kodga zid kelsa:
1. Avval — kod CLAUDE.md'ni ishlatadigan boshqa joyni tekshiring (grep)
2. Agar barcha kod yangi pattern'ni qo'llasa — **CLAUDE.md'ni flag qiling**, kod bug emas
3. Faqat agar kod o'zi ichida nomos bo'lsa — kod bug

Misol: CLAUDE.md "Roles 1-5" deydi, kodda `STUDENT_ROLE_ID = 6`. `grep STUDENT_ROLE_ID src/` 4+ joyda 6 ishlatilishini ko'rsatsa → bu CLAUDE.md eskirgan, **kod to'g'ri**.

### Skillarni majburiy ishlatish

Quyidagi skill'lar har bir tegishli bosqichda **majburan** invoke qilinishi kerak. Manual fallback **faqat** skill xatosi haqida xabar berish bilan birga:

| Bosqich | Skill |
|---------|-------|
| Architecture | `improve-codebase-architecture` |
| Duplication | `code-deduplication` |
| Dead code | `dead-code` |
| Smells | `code-smell-detector` |
| Method complexity | `refactor-method-complexity-reduce` |
| React/Next | `vercel-react-best-practices` |
| Final review | `requesting-code-review` |

Agar skill javob bermasa: REPORT'da `⚠ Skill X invoke qilinmadi: <sabab>` deb yozing va shu bosqichning confidence'ini past tuting.

---

## Phase A — Research (severity'siz)

Bu bosqichda **hech qanday finding yozilmaydi**. Faqat sistemani tushunish.

### A1. Scope va static analysis

1. `$ARGUMENTS` asosida fayl ro'yxati. Output: `.claude/review-output/scope.md`
2. Static toollar (parallel):
   - `cd client && npx tsc --noEmit`
   - `cd server && npx tsc --noEmit`
   - `npx eslint <scope>`
   - `npx knip --no-progress` (agar mavjud)
   - `npx jscpd <scope>` (agar mavjud)
3. Output: `.claude/review-output/static-analysis.md`

### A2. Code path mapping — **eng muhim qadam**

Scope'dagi har bir **non-trivial fayl** uchun aniqlang:

| Savol | Qanday topish |
|-------|---------------|
| Kim chaqiradi? | `grep -rn "<funksiyaNomi>\|<filePath>" --include="*.ts"` |
| Qachon ishlaydi? | Cron, HTTP route, event listener, manual script? |
| Test mode bormi? | `--dry-run`, feature flag, env-gated? |
| Production'da real ishlaydi? | Dev-only / migration script / live flow? |

Misol — agar `backfill-X.ts` skripti ko'rsangiz, avval shuni aniqlang:
- Bu **bir martalik** migration skriptmi yoki har deploy'da avtomatik ishlaydi?
- WHERE filter'da qanday guard'lar bor?
- Production'da hozir nechta record'ga ta'sir qiladi?

Output: `.claude/review-output/code-paths.md` — har bir fayl uchun yuqoridagi 4 savolga javob.

### A3. CLAUDE.md sverka

Scope'ga aloqador bo'lgan `CLAUDE.md`, `client/CLAUDE.md`, `server/CLAUDE.md` qoidalarini o'qing. Har bir qoida'ni kod bilan tasdiqlang:

- Qoida X aytadi → grep orqali topadi → kod mosligini tekshiradi
- Agar kod qoidaga zid → A2'dagi flow asosida: kod bug'mi yoki CLAUDE.md eskirganmi?

Output: `.claude/review-output/claudemd-sverka.md`. Format:
```
CLAUDE.md: "Roles are 1-5"
Code:      STUDENT_ROLE_ID = 6 in src/students/shared/student-select.ts:3
           Used 4 times: ...
Conclusion: CLAUDE.md eskirgan, kod izchil. (CLAUDE.md update flag)
```

### A4. Production reality check (ixtiyoriy lekin tavsiya)

Agar scope production data'ga ta'sir qiladigan skript yoki migration bo'lsa:
- DB'da real holatni tekshiring (read-only query)
- "Skript bu N ta record'ga ta'sir qiladi" deb yozing — taxmin emas, fakt

**Cross-check:** `.env`'dagi `DATABASE_URL`'ni avval tekshiring (`new URL(...).host`) — dev/staging/prod ekanligini aniqlang. Railway/Vercel CLI bo'lsa, alohida production'ga ulaning.

---

## Phase B — Audit (skill'lar bilan)

Endi Phase A natijalarini ishlatib, har bir bosqichda **skill invoke** qilamiz.

### B1. 🛡 Security

`/security-review` built-in komandasini invoke qiling. Phase A'dagi code-paths.md'ni context sifatida bering.

Har bir finding uchun:
- Code path (A2 dan)
- Real impact (production'da hozir ta'sir qiladimi?)
- Confidence marker
- Severity (Confirmed bo'lmasa max Medium)

Output: `security.md`

### B2. 🏗 Architecture

`Skill: improve-codebase-architecture` invoke qiling. Output qaytarilgandan keyin findinglarni Phase A bilan cross-check qiling — skill'ning har bir tavsiyasi real impact'ga ega ekanligini tasdiqlang.

Output: `architecture.md`

### B3. 🔁 Duplication

`Skill: code-deduplication` invoke qiling. `jscpd` natijasini (agar A1'da bo'lsa) context sifatida bering.

Output: `duplication.md`

### B4. 💀 Dead code

`Skill: dead-code` invoke qiling. `knip` natijasini context sifatida bering.

Skill chiqargan dead code'ni Phase A bilan tasdiqlang: chindan ham hech kim ishlatmaydi, yoki dynamic import / DI / reflection bo'lishi mumkin.

Output: `dead-code.md`

### B5. 👃 Smells & Complexity

`Skill: code-smell-detector` invoke qiling.
100+ qatorli har bir funksiya uchun `Skill: refactor-method-complexity-reduce` invoke qiling.

Output: `smells.md`

### B6. 💬 Comments & Naming

Manual review (skill yo'q). Confidence marker'ni 🟡'dan past tuting agar siz patternni faqat 1-2 fayl asosida ko'rsangiz.

Output: `comments.md`

### B7. ⚛️ Stack-specific

**Client uchun:** `Skill: vercel-react-best-practices` invoke qiling.
**Server uchun:** Manual + `nestjs-best-practices` context7 reference.

Output: `stack.md`

### B8. 🧠 Logic & Correctness

`Skill: requesting-code-review` invoke qiling. Bu eng so'nggi pass — barcha avvalgi findinglarni context sifatida bering.

Output: `logic.md`

### B9. 📋 Yakuniy REPORT.md

Har bir finding'ning shabloni:

```markdown
### F-<id>: <qisqa title>

**File:** path/to/file:line
**Severity:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low
**Confidence:** 🔴 Confirmed / 🟡 Suspicious / 🔵 Hypothesis
**Code path:** Bu kod <X> orqali chaqiriladi, <Y> sharoitda ishlaydi.
**Real impact (production):** Bugun N ta record'ga ta'sir qiladi. Y feature ochilganda Z bo'ladi.
**Skill source:** code-smell-detector / manual / requesting-code-review (yoki "skill javob bermadi")
**Tavsiya:** ...
```

REPORT.md tarkibi:
- TL;DR — har bir severity bo'yicha confidence breakdown:
  ```
  🔴 Critical: 0 (Confirmed) / 2 (Suspicious) / 0 (Hypothesis)
  🟠 High:     1 / 3 / 0
  ```
- Top 10 (faqat 🔴 Confirmed + 🟠 Confirmed High)
- Phase A natijasi: CLAUDE.md sverka, code paths xulosalari
- Skill invocation status (qaysi skill ishladi, qaysi yo'q)

---

## Rules

1. **🔴 Confirmed bo'lmasa Critical emas.** Bu qoida buzilishi mumkin emas.
2. **🔵 Hypothesis max Low.** "CLAUDE.md aytadi X" asosida finding High bo'la olmaydi.
3. **Skill skip qilsangiz — REPORT'da ayting va confidence past tutting.**
4. **Production write kerakmi?** Hech qanday yozish — faqat o'qish va `.claude/review-output/`'ga yozish.
5. **CLAUDE.md eskirgan deb topsangiz** — bu alohida finding (severity Low, lekin alohida bo'lim):
   ```
   ## CLAUDE.md Update Candidates
   - server/CLAUDE.md "Roles 1-5" eskirgan → Role 6 (Student) qo'shildi
   ```
6. **Memory'dagi qoidalar** (CEO branch access kabi) — Phase A'da hisobga oling, finding qilmang.
7. **Katta scope** (10K+ qator) — Phase A'ni `Explore` agent'iga bo'lib bering, Phase B'ni asosiy contextda saqlang.

---

## Output struktura

```
.claude/review-output/
├── scope.md                 # A1
├── static-analysis.md       # A1
├── code-paths.md            # A2 (eng muhim)
├── claudemd-sverka.md       # A3
├── production-reality.md    # A4 (ixtiyoriy)
├── security.md              # B1
├── architecture.md          # B2
├── duplication.md           # B3
├── dead-code.md             # B4
├── smells.md                # B5
├── comments.md              # B6
├── stack.md                 # B7
├── logic.md                 # B8
└── REPORT.md                # B9 — yakuniy
```

---

## Anti-patterns (oldingi review'larda men qilgan xatolar)

- ❌ Hardcoded literal ko'rib darhol "Critical" deyish (oldindan flow tekshirmasdan)
- ❌ CLAUDE.md aytadi → kod bug deb finding qilish (kod aslida to'g'ri bo'lsa)
- ❌ Skillarni "scope kichik" bahonasi bilan o'tkazib yuborish
- ❌ Dev DB'ga ulanib, "production'da X ta record" deb yozish
- ❌ Confidence marker'siz "High" yoki "Critical" yozish
- ❌ Code path tekshirmasdan finding labelash

Bu komandaning maqsadi: ushbu xatolarning takrorlanishini majburan to'sish.