# Darsga qo'yilmagan o'quvchi: belgi, xabarlar, avto-pauza, qaytish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** To'lov uchun darsga qo'yilmagan o'quvchini profilda binafsha belgi bilan ko'rsatish, ketma-ket 3 darsdan keyin pauzaga o'tkazib pulini hisoblash, xabar yuborish va qaytganda admin kelgan kunlarni belgilashi.

**Architecture:** Qoida bitta sof funksiyada (`barred-lessons.ts`), uni `BarredLessonsService` hukm (`LessonAdmissionService.forLesson`) bilan to'ldiradi. Mavjud `AbsenceStreakService` (yagona ketma-ketlik ta'rifi) shu kunlarni «Kelmadi» kabi sanaydi, mavjud avto-pauza cron'i va xabar servisi qayta ishlatiladi. Pul `MonthlyChargeService` ga ikki yangi metod bilan (`releaseBarredLessons`, `restoreBarredLessons`) yoziladi. Yangi jadval yo'q.

**Tech Stack:** NestJS + Prisma + Jest (server), Next.js + React Query + shadcn + vitest (client).

## Global Constraints

- Til: UI matnlari O'zbek (lotin), `t("…")` / `msg("…")`; yangi client fayl `STRICT_FILES` ga qo'shiladi, ru/de/en tarjimalari bilan.
- Sanalar Toshkent kuni, `'YYYY-MM-DD'`; `common/date/tashkent` dan tashqarida qo'lda bound yasama.
- Pul append-only: tuzatish faqat `createAdjustment` (`actor: { kind: 'system' }`, `metadata.kind`).
- Barcha o'zgartirish `server/` ichida `npx prettier --write` (client'da prettier YO'Q).
- `ADMISSION_START_DAY = '2026-10-01'`; 50% talab `MIN_SHARE_START_DAY = '2026-11-01'`.
- Yangi marshrut `@Can(...)` + `route-access.snapshot.json` qatori.
- Yangi qoida sozlama bilan yoqiladi, standart o'chiq (`absence.barredLessonsEnabled`).
- Commit xabarlari va kod izohlari ingliz tilida, ADR/spec O'zbek tilida.
- Prod'ga yozish yo'q: eski o'quvchilar skripti `dry-run` standart.

---

## File Structure

| Fayl | Mas'uliyat |
|---|---|
| `server/src/attendance/barred-lessons.ts` (+spec) | Sof qoida: kunlar ro'yxati, ketma-ketlik |
| `server/src/attendance/barred-lessons.service.ts` (+spec) | DB'dan yuklash + `forLesson` hukmi |
| `server/src/students/students-read.service.ts` | `getLessonsOverview` ga `BARRED` |
| `client/src/components/shared/attendance-dot.tsx`, `students/lesson-trail-tab.tsx` | Binafsha nuqta va belgi |
| `server/src/outreach/absence-streak.service.ts` | Ketma-ketlikka darsga qo'yilmagan kunlar |
| `server/src/absence-pause/absence-pause-notify.service.ts` | Darsga qo'yilmaganlar matnlari |
| `server/src/absence-pause/absence-auto-pause.cron.service.ts` | Sozlama darvozasi, bo'shatish chaqiruvi |
| `server/src/billing/monthly-charge.service.ts` | `releaseBarredLessons`, `restoreBarredLessons` |
| `server/src/students/students-status.service.ts` | `pauseForAbsence` + bo'shatish |
| `server/src/students/barred-lessons.controller.ts` | `GET/POST /students/:id/barred-lessons` |
| `client/src/components/students/restore-barred-lessons-dialog.tsx` | Qaytish oynasi |
| `server/scripts/audit-barred-students.ts` | Eski holatlar hisoboti (dry-run) |
| `docs/adr/0142-*.md`, `docs/adr/README.md` | Qaror |

---

### Task 1: Sof qoida `barredLessonDays` va ketma-ketlik

**Files:**
- Create: `server/src/attendance/barred-lessons.ts`
- Test: `server/src/attendance/barred-lessons.spec.ts`

**Interfaces:**
- Produces:
  - `barredLessonDays(input: BarredDaysInput): string[]` — saralangan, takrorsiz kunlar.
  - `barredStreak(heldDaysAsc: string[], rowByDay: ReadonlyMap<string, 'MARKED' | 'ABSENT'>, barred: ReadonlySet<string>): number` — oxirgi o'tgan darsdan orqaga: «Kelmadi» yoki darsga qo'yilmagan kunlar soni; boshqa har qanday belgi uzadi.

- [ ] **Step 1: Write the failing test**

```ts
import { barredLessonDays, barredStreak } from './barred-lessons';

const base = {
  coveredDates: ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'],
  frozenOutDates: [] as string[],
  heldDays: new Set(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12']),
  markedDays: new Set(['2026-10-05']),
  from: '2026-10-01',
  to: '2026-10-30',
  includeFrozenOut: false,
};

describe('barredLessonDays', () => {
  it('returns held, covered days without a row', () => {
    expect(barredLessonDays(base)).toEqual([
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
    ]);
  });
  it('skips frozen-out days unless asked', () => {
    const input = { ...base, frozenOutDates: ['2026-10-09'] };
    expect(barredLessonDays(input)).toEqual(['2026-10-07', '2026-10-12']);
    expect(barredLessonDays({ ...input, includeFrozenOut: true })).toEqual([
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
    ]);
  });
  it('skips days the teacher did not hold', () => {
    const input = { ...base, heldDays: new Set(['2026-10-05', '2026-10-12']) };
    expect(barredLessonDays(input)).toEqual(['2026-10-12']);
  });
});

describe('barredStreak', () => {
  const held = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12'];
  it('counts barred days from the latest lesson back', () => {
    const rows = new Map<string, 'MARKED' | 'ABSENT'>([['2026-10-05', 'MARKED']]);
    const barred = new Set(['2026-10-07', '2026-10-09', '2026-10-12']);
    expect(barredStreak(held, rows, barred)).toBe(3);
  });
  it('counts ABSENT rows together with barred days', () => {
    const rows = new Map<string, 'MARKED' | 'ABSENT'>([
      ['2026-10-05', 'MARKED'],
      ['2026-10-07', 'ABSENT'],
    ]);
    const barred = new Set(['2026-10-09', '2026-10-12']);
    expect(barredStreak(held, rows, barred)).toBe(3);
  });
  it('stops at a marked (came / late / excused) day', () => {
    const rows = new Map<string, 'MARKED' | 'ABSENT'>([['2026-10-09', 'MARKED']]);
    const barred = new Set(['2026-10-05', '2026-10-07', '2026-10-12']);
    expect(barredStreak(held, rows, barred)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest src/attendance/barred-lessons.spec.ts`
Expected: FAIL «Cannot find module './barred-lessons'».

- [ ] **Step 3: Implement**

```ts
export interface BarredDaysInput {
  coveredDates: string[];
  frozenOutDates: string[];
  heldDays: ReadonlySet<string>;
  markedDays: ReadonlySet<string>;
  from: string;
  to: string;
  /** Show released days too (profile tab, restore dialog). */
  includeFrozenOut: boolean;
}

export function barredLessonDays(input: BarredDaysInput): string[] {
  const frozen = new Set(input.includeFrozenOut ? [] : input.frozenOutDates);
  const days = new Set<string>();
  for (const d of input.coveredDates) {
    if (d < input.from || d >= input.to) continue;
    if (frozen.has(d) || !input.heldDays.has(d) || input.markedDays.has(d)) {
      continue;
    }
    days.add(d);
  }
  return [...days].sort();
}

export function barredStreak(
  heldDaysAsc: string[],
  rowByDay: ReadonlyMap<string, 'MARKED' | 'ABSENT'>,
  barred: ReadonlySet<string>,
): number {
  let count = 0;
  for (let i = heldDaysAsc.length - 1; i >= 0; i--) {
    const day = heldDaysAsc[i];
    const row = rowByDay.get(day);
    if (row === 'ABSENT' || (row === undefined && barred.has(day))) count++;
    else break;
  }
  return count;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx jest src/attendance/barred-lessons.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Make `unmarked-lesson-days.ts` reuse it, then commit**

Replace the body of `unmarkedLessonDays` in `server/src/outreach/unmarked-lesson-days.ts` with a call to `barredLessonDays({ ...input, includeFrozenOut: false })` (keep its exported signature and spec green).

```bash
cd server && npx prettier --write src/attendance/barred-lessons.ts src/attendance/barred-lessons.spec.ts src/outreach/unmarked-lesson-days.ts && npx jest src/attendance/barred-lessons.spec.ts src/outreach/unmarked-lesson-days.spec.ts
git add src/attendance/barred-lessons.ts src/attendance/barred-lessons.spec.ts src/outreach/unmarked-lesson-days.ts
git commit -m "feat(attendance): add pure barred-lesson rule and streak"
```

---

### Task 2: `BarredLessonsService` (yuklash + hukm)

**Files:**
- Create: `server/src/attendance/barred-lessons.service.ts`, `server/src/attendance/barred-lessons.service.spec.ts`
- Modify: `server/src/attendance/attendance.module.ts` (provider + export)

**Interfaces:**
- Consumes: `barredLessonDays`, `barredStreak` (Task 1); `LessonAdmissionService.forLesson({ groupId, lessonDay, studentIds })` → `Map<number, LessonAdmission>` (`admitted: false` + `reason` `NOT_PAID | BELOW_MIN_SHARE`).
- Produces: `BarredLessonsService.forEnrollments(enrollmentIds: string[], opts?: { includeFrozenOut?: boolean; today?: string }): Promise<Map<string, EnrollmentBarred>>`, bunda
  `EnrollmentBarred = { enrollmentId: string; studentId: number; groupId: string; days: string[]; streak: number; lastDay: string | null; shortfall: number }`.

- [ ] **Step 1: Write the failing test** — Prisma mock bilan: bir yozilish, 3 kunlik `coveredDates`, ustoz 3 kun ham davomat olgan (boshqa o'quvchi qatori), o'quvchida qator yo'q, `forLesson` har kun `admitted:false, reason:'NOT_PAID', shortfall: 40000` qaytaradi → `days.length === 3`, `streak === 3`, `lastDay` oxirgi kun, `shortfall === 40000`. Ikkinchi test: `forLesson` `admitted:true` qaytarsa → `days` bo'sh, `streak === 0`.

- [ ] **Step 2: Run** `cd server && npx jest src/attendance/barred-lessons.service.spec.ts` — Expected: FAIL (modul yo'q).

- [ ] **Step 3: Implement.** Mantiq (ADR-0141 `getBlockedFromLessons` dagi so'rovlarning xuddi o'zi, lekin enrollmentId bo'yicha):
  1. `enrollment.findMany({ where: { id: { in } , status: ACTIVE } })` → `studentId`, `groupId`.
  2. Oynа: `from = max(ADMISSION_START_DAY, today − 31 kun)`, `to = today`.
  3. Oldingi + joriy oy `enrollmentMonthlyCharge` (CHARGED) → `coveredDates`, `frozenOutDates` birlashtiriladi.
  4. `attendance.groupBy(['groupId','date'])` (`cancellationId: null`) → `heldDays` per guruh; o'quvchining `markedDays` va ABSENT kunlari.
  5. `barredLessonDays(...)` → nomzod kunlar.
  6. Har nomzod kun uchun `admission.forLesson({ groupId, lessonDay, studentIds:[studentId] })`; faqat `admitted === false` va `reason` `NOT_PAID`/`BELOW_MIN_SHARE` kunlari qoladi (tezlik: kun×guruh bo'yicha bitta chaqiruvda hamma studentId).
  7. `barredStreak(heldAsc, rowByDay, barredSet)`; `lastDay` = oxirgi darsga qo'yilmagan kun; `shortfall` = oxirgi kunning hukmidan.

- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(attendance): add BarredLessonsService with admission verdict"`.

---

### Task 3: Profil → «Darslar» tabida binafsha nuqta

**Files:**
- Modify: `server/src/students/students-read.service.ts` (~`getLessonsOverview`, 637-)
- Modify: `client/src/components/shared/attendance-dot.tsx`, `client/src/components/students/lesson-trail-tab.tsx`
- Modify: `client/src/i18n/dictionaries/{en,ru,de}.ts`
- Test: `server/src/students/students-read.service.spec.ts`

**Interfaces:**
- Consumes: `BarredLessonsService.forEnrollments(ids, { includeFrozenOut: true })`.
- Produces: `Lesson.status` ga `"BARRED"` qo'shiladi (server `OverviewLesson`, client `DotStatus`); `Lesson.released?: boolean` (kun pauzada qaytarilgan).

- [ ] **Step 1: Failing test (server)** — `getLessonsOverview` oylik davrdagi o'quvchi uchun, davomat qatori yo'q va `BarredLessonsService` mock'i 2 kun qaytarsa, `lessons` ichida `{ date, status: 'BARRED' }` ikki yozuv sana tartibida davomat nuqtalari orasiga qo'shilgan bo'lishi kerak.
- [ ] **Step 2: Run** `npx jest src/students/students-read.service.spec.ts -t BARRED` — FAIL.
- [ ] **Step 3: Implement (server)** — `getLessonsOverview` oxirida, monthly-era blokda: `barred.days` ni `lessons` ga `status: 'BARRED'`, `released: frozenOut.has(date)` bilan qo'shib, `date` bo'yicha saralash. `attended/total` hisobiga **kirmasin**.
- [ ] **Step 4: Client** — `DotStatus` ga `"BARRED"`; `AttendanceDot` da `bg-violet-500`, tooltip: `t("To'lov qilinmagani uchun darsga qo'yilmadi")`, `released` bo'lsa qo'shimcha `t("Puli qaytarilgan")`. `lesson-trail-tab.tsx` belgilar qatoriga binafsha nuqta + `t("Qo'yilmadi")`. Matnlar uchun ru/de/en kalitlari (yangi kalitlar: «Qo'yilmadi», «To'lov qilinmagani uchun darsga qo'yilmadi», «Puli qaytarilgan»).
- [ ] **Step 5: Verify** — `cd server && npx jest src/students/students-read.service.spec.ts`; `cd client && npx vitest run src/i18n src/components/students && npx tsc --noEmit && npx eslint src/components/students src/components/shared/attendance-dot.tsx`. Brauzerda mock API bilan `/students/profile/<id>?tab=darslar` ni ko'rib skrinshot.
- [ ] **Step 6: Commit** — `feat(students): show barred lessons in violet on the lessons tab`.

---

### Task 4: Ketma-ketlikka darsga qo'yilmagan kunlarni qo'shish

**Files:**
- Modify: `server/src/outreach/absence-streak.service.ts` (`computeStreaks`, `StreakRow`)
- Test: `server/src/outreach/absence-streak.service.spec.ts`

**Interfaces:**
- Consumes: `BarredLessonsService.forEnrollments`.
- Produces: `StreakRow` ga `barredDays: number` (ketma-ketlikdagi darsga qo'yilmagan kunlar soni) va `reason: 'ABSENT' | 'BARRED' | 'MIXED'`. `consecutiveAbsentCount` endi ikkalasining jami (cron o'zgarishsiz ishlaydi).

- [ ] **Step 1: Failing test** — qator yo'q, 3 ta darsga qo'yilmagan kun → `computeStreaks({ companyId, threshold: 3 })` bitta qator qaytaradi, `consecutiveAbsentCount === 3`, `reason === 'BARRED'`. Ikkinchi: 1 ta ABSENT + 2 ta darsga qo'yilmagan → `3`, `'MIXED'`. Uchinchi: sozlama o'chiq (`absence.barredLessonsEnabled` false) → eski xulq (qator yo'q → 0).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** — `consecutiveAbsentCount` chaqiruvidan keyin, sozlama yoqilgan bo'lsa, qarzdor ACTIVE yozilishlar uchun `forEnrollments` natijasi bilan birlashtiriladi: ABSENT qatorlari (`lastTen` dan) va darsga qo'yilmagan kunlar bitta kunlar chizig'ida `barredStreak` bilan qayta sanaladi; `lastAbsenceDate` = ikkalasining eng so'nggisi. **Eslatma:** hozirgi SQL `rn <= 10` oynasi o'zgarmaydi.
- [ ] **Step 4: Run** `npx jest src/outreach src/absence-pause` — PASS.
- [ ] **Step 5: Commit** — `feat(outreach): count barred lessons in the absence streak`.

---

### Task 5: Xabarlar (3 bosqich, yangi format)

**Files:**
- Modify: `server/src/absence-pause/absence-pause-notify.service.ts`, `server/src/absence-pause/absence-auto-pause.cron.service.ts` (`sendReminders`)
- Test: `server/src/absence-pause/absence-pause-notify.service.spec.ts`

**Interfaces:**
- Consumes: `StreakRow.reason`, `EnrollmentBarred.shortfall`.
- Produces: `PauseTarget` ga ixtiyoriy `barred?: { shortfall: number; lessonDate: Date }`; `nudgeStudent`/`warnStudent`/`announcePause` `target.barred` bor bo'lsa to'lov formatidagi matn yuboradi.

Matnlar (spec 2.3, artifactdagi bilan bir xil bo'lishi shart):

```ts
// nudge (1)
`👋 <b>${lesson} darsga qo'yilmadingiz</b>\n\n` +
`${group} guruhida to'lov qilinmagani uchun darsga qo'yilmadingiz. ` +
`Darsga qaytish uchun kamida <b>${som(shortfall)} so'm</b> to'lash kerak.`
// warn (2)
`😕 <b>Ketma-ket ${n} ta darsga qo'yilmadingiz</b>\n\n…yana <b>${left} ta</b> dars bo'lsa joyingiz vaqtincha to'xtatiladi.`
// pause (3)
`⏸️ <b>Joyingizni vaqtincha to'xtatdik</b>\n\n…kelgan darslaringiz puli hisobda qoladi, qolgan oy puli qaytarildi.`
```

- [ ] **Step 1: Failing test** — `nudgeStudent` `barred` bilan «to'lov qilinmagani» va summani o'z ichiga olgan matn bilan `sendMessage` chaqiradi; `barred` yo'q bo'lsa eski matn.
- [ ] **Step 2–3:** run (FAIL) → implement → run (PASS).
- [ ] **Step 4:** `sendReminders` da `target.barred` ni `reason !== 'ABSENT'` bo'lganda to'ldirish; `absence.barredLessonsEnabled` ning «xabar» bosqichi `log` rejimida faqat `logger.log` qiladi.
- [ ] **Step 5: Commit** — `feat(absence-pause): payment-reason messages for barred lessons`.

---

### Task 6: Pauza + pulni bo'shatish

**Files:**
- Modify: `server/src/billing/monthly-charge.service.ts` (yangi metod, `restoreChargeForReturn` yaqinida), `server/src/students/students-status.service.ts` (`pauseForAbsence`), `server/src/absence-pause/absence-auto-pause.cron.service.ts`
- Test: `server/src/billing/monthly-charge.service.spec.ts`, `server/src/students/students-status.service.spec.ts`

**Interfaces:**
- Consumes: `EnrollmentBarred.days`.
- Produces: `MonthlyChargeService.releaseBarredLessons(tx, { enrollmentId, barredDays: string[], companyId, reason }): Promise<{ refunded: number; lessons: number }>`.

```ts
async releaseBarredLessons(
  tx: Prisma.TransactionClient,
  p: { enrollmentId: string; barredDays: string[]; companyId: number; reason: string },
): Promise<{ refunded: number; lessons: number }> {
  // For each CHARGED month charge of the enrollment, take the barred days that
  // are in its coveredDates and not yet in frozenOutDates; refund their prorated
  // price (applyDiscount(proratedMonthlyAmount(monthlyPrice, plannedLessons, n), discount)),
  // write ONE createAdjustment per charge (metadata.kind = 'monthly-release',
  // policy = 'BARRED_LESSONS', dates), update the charge (coveredLessons,
  // chargedAmount, frozenOutDates).
}
```
Narx hisobi `repair-student-10918-october-first-lesson.ts` dagi bilan bir xil (`proratedMonthlyAmount` + `applyDiscount`), ya'ni #10918 natijasi test namunasi: 450 000, 13 dars, 1 dars kelgan → qoladi 34 615.

- [ ] **Step 1: Failing tests** — (a) 13 darsli oy, 12 kun darsga qo'yilmagan → qaytadi 12×34 615 ≈ 415 385, `chargedAmount` 34 615, `frozenOutDates` 12 kun; (b) bo'sh `barredDays` → hech narsa yozilmaydi; (c) ikki marta chaqirsa takror qaytarmaydi (idempotent); (d) hech kelmagan → hammasi qaytadi.
- [ ] **Step 2:** run (FAIL) → implement → run (PASS).
- [ ] **Step 3:** `pauseForAbsence` ga ixtiyoriy `barredDays` va `reason: 'BARRED'`; bitta tranzaksiyada `FROZEN` + `releaseBarredLessons`; sabab `buildAutoPauseReason` ning darsga qo'yilmagan varianti: «Avtomatik pauza: N ta ketma-ket dars to'lov qilinmagani uchun qo'yilmadi (oxirgisi dd.MM.yyyy)». Prefiks `AUTO_PAUSE_REASON_PREFIX` o'zgarmaydi.
- [ ] **Step 4:** cron `runForCompany` da `reason !== 'ABSENT'` qator uchun `forEnrollments` kunlarini `pauseForAbsence` ga uzatish.
- [ ] **Step 5: Commit** — `feat(billing): release barred lessons when auto-pausing`.

---

### Task 7: Qaytishda darslarni belgilash

**Files:**
- Create: `server/src/students/barred-lessons.controller.ts` (+spec), `client/src/components/students/restore-barred-lessons-dialog.tsx`
- Modify: `server/src/billing/monthly-charge.service.ts` (`restoreBarredLessons`), `server/src/common/permissions/route-access.snapshot.json`, `client/src/components/shared/change-status-dialog.tsx`, `client/src/components/students/enroll-to-group-dialog.tsx`, dictionaries, `i18n-coverage.test.ts`

**Interfaces:**
- `GET /students/:id/barred-lessons` → `{ items: { enrollmentId, groupName, days: string[] }[] }` (pauzada bo'shatilgan va hali qaytarilmagan kunlar: `frozenOutDates` ∩ pauza kunidan oldingi qatorsiz o'tgan darslar).
- `POST /students/:id/barred-lessons/restore` body `{ enrollmentId: string; attendedDays: string[] }` (`[]` = «hech biriga kelmagan»); `@Can('students.manage')`.
- `MonthlyChargeService.restoreBarredLessons(tx, { enrollmentId, days, companyId, performedById })`: har kun uchun manfiy ADJUSTMENT (dars narxi, chegirma bilan), kun `frozenOutDates` dan chiqadi, `coveredLessons+1`; shuningdek `attendance` ga `PRESENT` qatori (`markedMethod: MANUAL`) va ustoz haqi uchun mavjud `saveLate` yo'lidagi accrual (`LessonBillingService`) — **mavjud metodni qayta ishlat, hisobni qaytadan yozma**.

- [ ] **Step 1: Failing tests** — (a) 3 kun bo'shatilgan, 1 tasi belgilanadi → balans 34 615 ga kamayadi, shu kun `frozenOutDates` da yo'q, `PRESENT` qatori bor; (b) `attendedDays` da bo'shatilmagan kun → 400; (c) ruxsatsiz rol → 403; (d) `[]` → hech narsa o'zgarmaydi, lekin `EntityHistory` ga «qaytarishda darslar belgilanmadi» yoziladi.
- [ ] **Step 2:** run (FAIL) → implement server → run (PASS); route snapshot qatori qo'shiladi (`"GET /students/:id/barred-lessons": [...]`, `"POST /students/:id/barred-lessons/restore": [...]`), `npx jest src/common/permissions` yashil.
- [ ] **Step 3: Client.** Dialog: kunlar ro'yxati (katak), pastda «Hech biriga kelmagan» va «Saqlash»; submit loading holati; `ChangeStatusDialog` (FROZEN→ACTIVE) va `EnrollToGroupDialog` ochilishida `GET …/barred-lessons` bo'sh bo'lmasa, amalni davom ettirishdan **oldin** shu oyna ochiladi. Skeleton, Uzbek toast, `getErrorMessage`.
- [ ] **Step 4:** `cd client && npx vitest run src/i18n src/components/students && npx tsc --noEmit && npx eslint <fayllar>`; brauzerda ko'rib skrinshot.
- [ ] **Step 5: Commit** — `feat(students): ask which barred lessons were attended on return`.

---

### Task 8: Sozlama va eski o'quvchilar skripti

**Files:**
- Modify: `server/src/settings/` (sozlama kaliti `absence.barredLessonsEnabled`: `'off' | 'report' | 'notify-log' | 'notify' | 'pause'`), `client/src/components/settings/…` (CEO bloki «Darsga qo'yilmaganlar»)
- Create: `server/scripts/audit-barred-students.ts`

**Interfaces:** `BarredLessonsService` sozlamani o'qiydi; bosqichlar: `report` = faqat tab rangi va hisobot; `notify-log` = xabar faqat logga; `notify` = xabar ketadi; `pause` = avto-pauza ham.

- [ ] **Step 1:** Sozlama kaliti va CEO formasi (`@CeoOnly`/mavjud `settings.*` darvozasi bilan bir xil; ADR-0087 qoidasi).
- [ ] **Step 2:** Skript: `scripts/lib/check-cli.ts` (`run`, `makePrisma`, `printTable`) bilan, har ACTIVE qarzdor yozilish uchun `forEnrollments` natijasi: o'quvchi, guruh, ketma-ket kunlar, kelgan darslar, bo'lishi kerak qarz, hozirgi balansdan farq. Faqat o'qiydi. `--apply` bu skriptda **yo'q** (alohida tasdiq bilan keyingi PR).
- [ ] **Step 3:** Skriptni tasdiqlangan usul bilan o'qish rejimida ishga tushirish: `cd server && railway run npx ts-node --transpile-only scripts/audit-barred-students.ts`, natijani CEO'ga ko'rsatish.
- [ ] **Step 4: Commit** — `feat(settings): staged switch for barred-lesson rules and audit script`.

---

### Task 9: ADR-0142, hujjatlar, yakuniy tekshiruv

**Files:**
- Create: `docs/adr/0142-darsga-qoyilmagan-oquvchi-avto-pauza.md`
- Modify: `docs/adr/README.md` (indeks qatori; raqam to'qnashsa `git mv`), `server/CLAUDE.md` («Automatic pause after consecutive absences» bo'limiga qisqa band), `client/CLAUDE.md` (Darslar tabi binafsha belgi bandi)

- [ ] **Step 1:** ADR-0142: kontekst (spec 1), qaror (spec 2.1–2.8), ADR-0023 ga qo'shimcha (qator yo'q kun ham sanaladi), ADR-0047 ga bog'lanish, 6.2/3.5 dan farq, oqibatlar.
- [ ] **Step 2:** To'liq tekshiruv, har biri bir marta: `cd server && npx prettier --write <o'zgargan fayllar> && npx eslint <fayllar> && npx jest src/attendance src/outreach src/absence-pause src/billing src/students src/common/permissions` va `npm run build`; `cd client && npx vitest run src/i18n src/components && npx tsc --noEmit`.
- [ ] **Step 3:** Mock API bilan brauzerda: profil tabi (binafsha), qaytish oynasi, Aloqa markazi → Pauzadagilar. Skrinshotlar.
- [ ] **Step 4: Commit** — `docs(adr): add ADR-0142 barred lessons, auto-pause and return flow`.
- [ ] **Step 5:** PR ochish, CI yashil bo'lishini kutish; prod'ga chiqarish va sozlamani `report` bosqichidan yoqish — CEO bilan alohida qadam.

---

## Self-review (spec bilan solishtirish)

- 2.1 qoida → Task 1–2. 2.2 profil → Task 3. 2.3 sanash va xabar → Task 4–5. 2.4 pauza va pul → Task 6. 2.5 qo'ng'iroqdan keyin → mavjud tugmalar (Task 7 oynani qo'shadi). 2.6 qaytish → Task 7. 2.7 eski holatlar → Task 8. 2.8 yoqish → Task 8. ADR → Task 9.
- Nomlar izchil: `barredLessonDays`, `barredStreak`, `BarredLessonsService.forEnrollments`, `releaseBarredLessons`, `restoreBarredLessons`, `absence.barredLessonsEnabled`.
- Ochiq: hukm tarixi (spec 4-bo'lim) Task 2 da «pauza paytida qotirish» sifatida hal qilinadi: `releaseBarredLessons` metadata'siga `dates` yoziladi, qaytarish oynasi shuni o'qiydi.
