# B7a «Ketgan o'quvchilar» hisoboti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/reports/departed-students` sahifasini maket bo'yicha qayta qurish: bitta ma'lumot to'plamidan (`DepartureFacts`) kartalar, sabablar, ustunlar, kesimlar va ro'yxat hisoblanadi, kurs/ustoz filtri hamma blokka ta'sir qiladi.

**Architecture:** Server: yangi `server/src/reports/departed/` moduli — `loadDepartures` (ADR-0035) epizodlariga guruh, kurs, filial, to'xtash paytidagi ustoz, sabab, o'qigan muddat qo'shib «fakt»lar yasaydi (`loadDepartureFacts`), toza `aggregateOverview` hamma blokni shu faktlardan sanaydi; uch yangi yo'l (`overview`, `list`, `excel`). Mijoz: komponentlar qayta quriladi, B5 («Guruhlar bo'yicha to'lov») naqshi bo'yicha.

**Tech Stack:** NestJS + Prisma 7 + Jest (server), Next.js 16 + React Query + Vitest (mijoz), exceljs.

**Spec:** `docs/superpowers/specs/2026-10-17-b7a-ketgan-oquvchilar-design.md` (c4e00c1f). Worktree: `.claude/worktrees/b7a-ketganlar`, branch `feat/b7a-ketgan-oquvchilar`.

## Global Constraints

- Ketgan ta'rifi `students/shared/departure-episodes.ts` va `reports/shared/departures.loader.ts` da qoladi (ADR-0035). «Ketgan»ni boshqa joyda `DROPPED` yoki `EXPELLED` dan sanash TAQIQ. Faqat `departuresInRange`, `pendingInRange` va epizodlarning o'zi ishlatiladi.
- «Kursni tugatdi» hozircha ketgan sanaladi; maketdagi «kursni tugatish ketish emas» izohi sahifaga KIRMAYDI.
- Sanalar Toshkent kuni: `common/date/tashkent` yordamchilari (`tashkentRangeUtc`, `tashkentMonthRangeUtc`, `addMonthsToMonthKey`). Yuqori chegara har doim EXCLUSIVE (`lt`). `new Date(query.startDate)` va `setHours(23,59,59…)` taqiqlangan (`tashkent.single-source.spec.ts`).
- Filial qamrovi: `@BranchScope()` ro'yxat sifatida; bo'sh qamrov 403 «Bu filial ma'lumotlarini ko'rish huquqingiz yo'q» (`listScope`). Yangi yo'llar `branch-route-policy.ts` ga YOZILMAYDI.
- Yo'llar: `@Can('reports.students')`. Yangi yo'l uchun `route-access.snapshot.json` qatori va (kerak bo'lsa) `intentional-access-changes.ts` yozuvi — olib tashlanayotgan o'xshash yo'lning qatorlari nusxa qilinadi (`summary` → `overview`, `list` → `list`, `summary` → `excel`).
- Hamma matn lotin yozuvida o'zbekcha; ekranda inglizcha so'z, «koeffitsient», «LTV» yo'q. Kod izohlari inglizcha yoki o'zbekcha (atrofdagidek), commit xabarlari INGLIZCHA.
- Server: har tegilgan `.ts` ga `npx prettier --write` **`server/` ichidan, node_modules bilan** (node_modules yo'q joyda `npx` boshqa versiya yuklaydi va CI yiqiladi). Mijoz (`client/`): prettier ISHLATILMAYDI.
- Server testlari: `cd server && npx jest <yo'l>`; tur tekshiruvi `npm run typecheck`; `npm run build`; lint `npx eslint <fayllar> --quiet`. Mijoz: `cd client && npx vitest run <yo'l>`, `npx tsc --noEmit`, `npm run lint`. Mijoz testlari faqat `src/**/*.test.ts`; komponent `createElement` + `renderToStaticMarkup` bilan.
- Mijozda `bg-success`, `bg-warning` faqat `.lumio` ichida bor: oddiy sahifada `bg-emerald-500/20`, `bg-amber-500/25`, `text-destructive` ishlating.
- `keepPreviousData` eski javobni ko'rsatadi: oy/davr almashganda eski javobni yangi davr deb CHIZMANG (skelet yoki xiralashtirish; B5 `isFreshAnswer` naqshi).
- Testlardagi raqamlar to'qilgan bo'lsin; prod yig'indilari repoga yozilmaydi (repo ochiq).
- Yangi fayl 500 qatordan oshmasin.
- Worktree'da `node_modules` yo'q: 1-vazifada `npm ci` (server va client).

## Fayllar xaritasi

Server (`server/src/reports/`):

| Fayl | Mas'uliyat |
| --- | --- |
| `departed/departed-period.ts` | toza: davr sanalari, oldingi davr, 6 oy oynasi, 100 dan N, ulush qoidasi |
| `departed/departed.types.ts` | `DepartureFact`, `StartMember`, `DepartedFilter` va javob turlari |
| `departed/departure-facts.ts` | toza: guruhni tanlash, ustoz to'xtash paytida, sabab, o'qigan muddat, fakt yasash |
| `departed/departure-facts.loader.ts` | DB: `loadDepartureFacts` — epizodlar to'plamlari + faktlar |
| `departed/departed-aggregate.ts` | toza: kartalar, oylar, sabablar, kesimlar |
| `departed/departed-overview.service.ts` | `overview` + `averageStudyMonths` (marketing uchun) |
| `departed/departed-list.service.ts` | `list` + `excel` ma'lumoti |
| `departed/departed.excel.ts` | exceljs ish kitobi |
| `departed/departed.controller.ts` | `overview`, `list`, `excel` |
| `departed/dto/departed-query.dto.ts` | so'rov DTO'lari |
| `shared/departures.loader.ts` (o'zgaradi) | `activeAtStartMembers` qaytaradi |
| `shared/teacher-change-departures.ts` (o'zgaradi) | ixtiyoriy `groupFilter` |

Mijoz (`client/src/components/reports/departed-students/`): `departed-types.ts`, `departed-url.ts`, `departed-format.ts`, `departed-queries.ts`, `departed-filter-bar.tsx`, `departed-cards.tsx`, `departed-pending.tsx`, `departed-months.tsx`, `departed-reasons.tsx`, `departed-cuts.tsx`, `departed-list.tsx`, `departed-students-page.tsx`; `teacher-change-retention-cards.tsx` moslashtiriladi; eski komponentlar o'chadi.

---

### Task 1: Davr yordamchilari va filtr (toza)

**Files:**
- Create: `server/src/reports/departed/departed-period.ts`
- Create: `server/src/reports/departed/departed.types.ts`
- Test: `server/src/reports/departed/departed-period.spec.ts`

**Interfaces:**
- Produces (`departed-period.ts`):
  - `interface DayRange { startDate: string; endDate: string }`
  - `parseDayRange(startDate: string, endDate: string): { gte: Date; lt: Date }` — 400 «Sana noto'g'ri formatda» / «Oxirgi sana boshidan oldin bo'lmasin» / «Davr 10 yildan oshmasin»
  - `previousRange(r: DayRange): DayRange`
  - `monthKeysEndingAt(endDate: string, count: number): string[]` (o'sish tartibida)
  - `per100(departed: number, atStart: number): number | null` (bir xona kasr)
  - `MIN_SHARE_BASE = 5`, `shareOf(departed: number, atStart: number): number | null`
- Produces (`departed.types.ts`): quyidagi turlar (aynan shu nomlar keyingi vazifalarda ishlatiladi).

- [ ] **Step 1: Sozlash**

```bash
cd .claude/worktrees/b7a-ketganlar/server && npm ci --prefer-offline --no-audit --no-fund && npx prisma generate
cd ../client && npm ci --prefer-offline --no-audit --no-fund
```

- [ ] **Step 2: `departed.types.ts` ni yozing**

```ts
import type { StopKind } from '../../students/shared/departure-episodes';

export interface NamedId<T extends string | number = string> {
  id: T;
  name: string;
}

export interface TeacherRef {
  id: number;
  fullName: string;
}

export interface GroupRef {
  id: string;
  name: string;
}

/** Where a student sat: the group and what hangs off it. Every part may be unknown. */
export interface Placement {
  group: GroupRef | null;
  course: NamedId | null;
  branch: NamedId<number> | null;
  teachers: TeacherRef[];
}

/** One departure episode with everything the page needs (spec §3). */
export interface DepartureFact extends Placement {
  /** `${studentId}:${startedAt.getTime()}` — one episode. */
  key: string;
  studentId: number;
  fullName: string;
  phone: string;
  /** The student's balance today, so'm (negative = owes). */
  balance: number;
  startedAt: Date;
  stopKind: StopKind;
  state: 'pending' | 'confirmed';
  returnedAt: Date | null;
  reason: { id: string | null; name: string };
  comment: string | null;
  /** Months from the first enrollment to the stop; null when unknown. */
  studyMonths: number | null;
}

/** A student studying at the start of the range, with where he sat then. */
export interface StartMember extends Placement {
  studentId: number;
}

export interface DepartedFilter {
  courseIds?: string[];
  teacherIds?: number[];
}

export interface CutRow {
  id: string;
  name: string;
  departed: number;
  atStart: number;
  /** departed ÷ atStart × 100, one decimal; null when atStart < 5. */
  share: number | null;
}

export type CutKey = 'teacher' | 'course' | 'group' | 'branch';

export interface DepartedOverview {
  range: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
  cards: {
    departed: number;
    previousDeparted: number;
    atStart: number;
    per100: number | null;
    avgStudyMonths: number | null;
  };
  pendingToday: number;
  months: { key: string; departed: number; provisional: boolean }[];
  reasons: { reasonId: string | null; name: string; count: number }[];
  cuts: Record<CutKey, CutRow[]>;
  /** Each departed student once; the teacher cut may add up to more. */
  uniqueDeparted: number;
  teacherChange: {
    totalTeacherChanges: number;
    departedAfterTeacherChange: number;
  };
  graceDays: { LEFT_GROUP: number; FROZEN: number };
}

export type ListState = 'ketgan' | 'kutilmoqda' | 'qaytgan';

export interface ListRow {
  studentId: number;
  fullName: string;
  phone: string;
  group: GroupRef | null;
  departedAt: string;
  studyMonths: number | null;
  reason: { id: string | null; name: string };
  comment: string | null;
  state: ListState;
  /** so'm owed today; 0 when the balance is not negative. */
  debt: number;
}

export interface DepartedList {
  data: ListRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Over the whole filtered list, not the page. */
  confirmed: number;
  returned: number;
  pending: number;
}
```

- [ ] **Step 3: Failing test `departed-period.spec.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import {
  monthKeysEndingAt,
  parseDayRange,
  per100,
  previousRange,
  shareOf,
} from './departed-period';

describe('previousRange', () => {
  it('a whole calendar month goes to the previous calendar month', () => {
    expect(
      previousRange({ startDate: '2026-09-01', endDate: '2026-09-30' }),
    ).toEqual({ startDate: '2026-08-01', endDate: '2026-08-31' });
  });
  it('January goes to December of the year before', () => {
    expect(
      previousRange({ startDate: '2027-01-01', endDate: '2027-01-31' }),
    ).toEqual({ startDate: '2026-12-01', endDate: '2026-12-31' });
  });
  it('February of a leap year is whole at 29 days', () => {
    expect(
      previousRange({ startDate: '2028-03-01', endDate: '2028-03-31' }),
    ).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
  });
  it('any other range goes to the same number of days right before it', () => {
    expect(
      previousRange({ startDate: '2026-07-01', endDate: '2026-09-30' }),
    ).toEqual({ startDate: '2026-04-02', endDate: '2026-06-30' });
  });
  it('a one-day range', () => {
    expect(
      previousRange({ startDate: '2026-09-10', endDate: '2026-09-10' }),
    ).toEqual({ startDate: '2026-09-09', endDate: '2026-09-09' });
  });
});

describe('monthKeysEndingAt', () => {
  it('six months up to the month of the end date, ascending', () => {
    expect(monthKeysEndingAt('2026-09-30', 6)).toEqual([
      '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
    ]);
  });
  it('crosses the new year', () => {
    expect(monthKeysEndingAt('2027-02-10', 3)).toEqual([
      '2026-12', '2027-01', '2027-02',
    ]);
  });
});

describe('per100 / shareOf', () => {
  it('rounds to one decimal', () => {
    expect(per100(64, 530)).toBe(12.1);
  });
  it('is null without a base', () => {
    expect(per100(3, 0)).toBeNull();
  });
  it('share is hidden under 5 at the start', () => {
    expect(shareOf(2, 4)).toBeNull();
    expect(shareOf(2, 5)).toBe(40);
  });
});

describe('parseDayRange', () => {
  it('turns Tashkent days into [gte, lt)', () => {
    const r = parseDayRange('2026-09-01', '2026-09-30');
    expect(r.gte.toISOString()).toBe('2026-08-31T19:00:00.000Z');
    expect(r.lt.toISOString()).toBe('2026-09-30T19:00:00.000Z');
  });
  it('refuses a reversed range', () => {
    expect(() => parseDayRange('2026-09-30', '2026-09-01')).toThrow(
      BadRequestException,
    );
  });
  it('refuses a calendar-impossible day', () => {
    expect(() => parseDayRange('2026-02-30', '2026-03-01')).toThrow(
      BadRequestException,
    );
  });
  it('refuses a range over ten years', () => {
    expect(() => parseDayRange('2010-01-01', '2026-01-01')).toThrow(
      BadRequestException,
    );
  });
});
```

- [ ] **Step 4: Run — FAIL** (`cd server && npx jest src/reports/departed/departed-period.spec.ts`, «Cannot find module»).

- [ ] **Step 5: `departed-period.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import {
  addMonthsToMonthKey,
  tashkentRangeUtc,
} from '../../common/date/tashkent';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 3660;

export interface DayRange {
  startDate: string;
  endDate: string;
}

const dayMs = (d: string) =>
  Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const daysInMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A real calendar day, 'YYYY-MM-DD'. */
function isRealDay(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return dayStr(dayMs(d)) === d;
}

/** The picked Tashkent days as `[gte, lt)` UTC instants; a 400 for a bad range. */
export function parseDayRange(startDate: string, endDate: string) {
  if (!isRealDay(startDate) || !isRealDay(endDate)) {
    throw new BadRequestException("Sana noto'g'ri formatda");
  }
  if (dayMs(endDate) < dayMs(startDate)) {
    throw new BadRequestException("Oxirgi sana boshidan oldin bo'lmasin");
  }
  if ((dayMs(endDate) - dayMs(startDate)) / DAY_MS > MAX_DAYS) {
    throw new BadRequestException("Davr 10 yildan oshmasin");
  }
  return tashkentRangeUtc(startDate, endDate);
}

function isWholeMonth(r: DayRange): boolean {
  return (
    r.startDate.slice(0, 7) === r.endDate.slice(0, 7) &&
    r.startDate.slice(8, 10) === '01' &&
    +r.endDate.slice(8, 10) ===
      daysInMonth(+r.endDate.slice(0, 4), +r.endDate.slice(5, 7))
  );
}

/**
 * The period to compare with: a whole calendar month goes to the month before
 * it; any other range to the same number of days right before it.
 */
export function previousRange(r: DayRange): DayRange {
  if (isWholeMonth(r)) {
    const y = +r.startDate.slice(0, 4);
    const m = +r.startDate.slice(5, 7);
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const mm = String(pm).padStart(2, '0');
    return {
      startDate: `${py}-${mm}-01`,
      endDate: `${py}-${mm}-${String(daysInMonth(py, pm)).padStart(2, '0')}`,
    };
  }
  const len = Math.round((dayMs(r.endDate) - dayMs(r.startDate)) / DAY_MS) + 1;
  return {
    startDate: dayStr(dayMs(r.startDate) - len * DAY_MS),
    endDate: dayStr(dayMs(r.startDate) - DAY_MS),
  };
}

/** `count` Tashkent month keys up to the month of `endDate`, ascending. */
export function monthKeysEndingAt(endDate: string, count: number): string[] {
  const last = endDate.slice(0, 7);
  return Array.from({ length: count }, (_, i) =>
    addMonthsToMonthKey(last, -(count - 1 - i)),
  );
}

/** Departures per 100 students studying at the start, one decimal. */
export function per100(departed: number, atStart: number): number | null {
  if (atStart <= 0) return null;
  return Math.round((departed / atStart) * 1000) / 10;
}

/** A share on fewer than this many students is not shown (spec §4.5). */
export const MIN_SHARE_BASE = 5;

export function shareOf(departed: number, atStart: number): number | null {
  return atStart < MIN_SHARE_BASE ? null : per100(departed, atStart);
}
```

- [ ] **Step 6: Run — PASS.** Agar `tashkentRangeUtc` xato sanaga `Invalid Date` qaytarmay otsa, 4-testni moslashtiring (haqiqiy xatti-harakatni `tashkent.ts` dan o'qing).
- [ ] **Step 7: Prettier + commit**

```bash
cd server && npx prettier --write src/reports/departed/ && npx jest src/reports/departed && cd .. && git add server/src/reports/departed && git commit -m "feat(reports): departed-students period helpers and fact types"
```

---

### Task 2: `loadDepartures` boshlang'ich a'zolarni qaytaradi

**Files:**
- Modify: `server/src/reports/shared/departures.loader.ts`
- Test: mavjud loader spec (`server/src/reports/shared/departures.loader.spec.ts`; yo'q bo'lsa `grep -rn "loadDepartures" server/src --include='*.spec.ts' -l` dagi spec) — yangi `describe`.

**Interfaces:**
- Produces: `LoadedDepartures.activeAtStartMembers: { studentId: number; enrollmentId: string }[]`; `activeAtStart === activeAtStartMembers.length` (hozirgi son o'zgarmaydi). `activeAt` berilmasa `[]`.

- [ ] **Step 1:** Mavjud spec'ni o'qing; `activeAt` bilan chaqirilgan holat uchun yangi test yozing: ikki o'quvchi (biri davr boshida `ACTIVE` yozilishli, biri yo'q) → `activeAtStartMembers` faqat birinchisini va **o'sha yozilishning id**sini beradi; `activeAtStart` 1.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** `departures.loader.ts` da:
  - `LoadedDepartures` ga `activeAtStartMembers: { studentId: number; enrollmentId: string }[]` qo'shing (izoh: «the enrollment that was ACTIVE at `activeAt`; one per student»).
  - Erta qaytish (`students.length === 0`) ga `activeAtStartMembers: []`.
  - Tsikldagi `activeAtStart += 1` o'rniga:

```ts
    if (activeAt) {
      const live = own.find(
        (e) => statusOn(e, logsByEnrollment, activeAt) === 'ACTIVE',
      );
      if (live) activeAtStartMembers.push({ studentId: s.id, enrollmentId: live.id });
    }
```
  - Oxirida `activeAtStart: activeAtStartMembers.length` va `activeAtStartMembers` ni qaytaring. `let activeAtStart = 0` o'chadi.
- [ ] **Step 4:** Run loader spec + `npx jest src/reports src/home src/dashboard` (loader'ni o'qiydigan hamma spec) — PASS.
- [ ] **Step 5:** Prettier + commit `feat(reports): departures loader returns who was studying at the start`.

---

### Task 3: Fakt yasash qoidalari (toza)

**Files:**
- Create: `server/src/reports/departed/departure-facts.ts`
- Test: `server/src/reports/departed/departure-facts.spec.ts`

**Interfaces:**
- Consumes: `departed.types.ts` (Task 1); `enrollmentStatusOn`, `supplyOpeningRow`, `supplyClosingRow`, `EnrollmentStatusEvent` (`students/shared/enrollment-status-on.ts`); `DepartureEpisode`, `StopKind` (`students/shared/departure-episodes.ts`).
- Produces (hammasi `departure-facts.ts` dan eksport):
  - `NO_REASON = 'Sabab yozilmagan'`
  - turlar `EnrollmentInput`, `GroupInput`, `CardInput`, `StudentInput`, `TeacherChangeRow`, `FactContext`
  - `pickEnrollmentAt(enrollments: EnrollmentInput[], at: Date): EnrollmentInput | null`
  - `teacherIdsAt(currentIds: number[], changesAsc: readonly TeacherChangeRow[], at: Date): number[]`
  - `reasonOf(kind: StopKind, card: CardInput, enrollment: EnrollmentInput | null): { id: string | null; name: string; comment: string | null }`
  - `studyMonthsOf(enrollments: readonly { startDate: Date | null; createdAt: Date }[], departedAt: Date): number | null`
  - `buildFact(ep: DepartureEpisode, s: StudentInput, ctx: FactContext): DepartureFact`
  - `buildStartMember(enrollmentId: string, s: StudentInput, at: Date, ctx: FactContext): StartMember`

- [ ] **Step 1: Failing test** `departure-facts.spec.ts` — quyidagi holatlar (har biri alohida `it`, kichik yordamchi `enr()` / `student()` fabrikalar bilan; raqamlar to'qilgan):
  1. `pickEnrollmentAt`: to'xtashdan oldin `ACTIVE` bo'lgan yozilishni tanlaydi (log: ACTIVE@01.09, DROPPED@10.09; at=10.09 → shu yozilish).
  2. `pickEnrollmentAt`: ikki yozilishdan **keyinroq yaratilgani** tanlanadi (ikkalasi to'xtashdan oldin ACTIVE).
  3. `pickEnrollmentAt`: to'xtash paytida hech biri faol emas (chetlatish guruhsizlikdan 5 kun keyin) → `statusChangedAt` to'xtashdan oldingi eng so'nggisi.
  4. `pickEnrollmentAt`: bo'sh ro'yxat → `null`.
  5. `teacherIdsAt`: to'xtashdan keyin o'zgarish bor → o'sha o'zgarishning `previousTeacherIds`; bir nechta bo'lsa eng birinchisi; o'zgarish yo'q yoki hammasi oldin → hozirgi ro'yxat.
  6. `reasonOf`: EXPELLED + karta EXPELLED → kartaning sababi va izohi; EXPELLED + karta boshqa holatda → yozilishning sababi; LEFT_GROUP → yozilishning sababi (kartaga qaramaydi, karta EXPELLED bo'lsa ham); hammasi bo'sh → `{ id: null, name: NO_REASON, comment: null }`.
  7. `studyMonthsOf`: eng erta `startDate` (bo'lmasa `createdAt`) dan to'xtashgacha oy (`/30.44 kun`); to'xtash birinchi yozilishdan oldin → `null`; yozilish yo'q → `null`.
  8. `buildFact`: ustozlar to'xtash paytidagi ro'yxatdan nomlar bilan (`ctx.teacherName`), guruh/kurs/filial, `key`, `state`, `returnedAt`, qarz (`balance`) saqlanadi; guruh topilmasa `group/course/branch = null`, `teachers = []`.
  9. `buildStartMember`: berilgan yozilishning guruhi va `at` paytidagi ustozlar.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: `departure-facts.ts`**

```ts
import {
  enrollmentStatusOn,
  supplyClosingRow,
  supplyOpeningRow,
  type EnrollmentStatusEvent,
} from '../../students/shared/enrollment-status-on';
import type {
  DepartureEpisode,
  StopKind,
} from '../../students/shared/departure-episodes';
import type {
  DepartureFact,
  NamedId,
  Placement,
  StartMember,
} from './departed.types';

export const NO_REASON = 'Sabab yozilmagan';
const MS_PER_MONTH = 24 * 60 * 60 * 1000 * 30.44;

export interface GroupInput {
  id: string;
  name: string;
  course: NamedId;
  branch: NamedId<number>;
  /** Today's teachers of the group. */
  teacherIds: number[];
}

export interface EnrollmentInput {
  id: string;
  status: string;
  createdAt: Date;
  startDate: Date | null;
  statusChangedAt: Date | null;
  statusChangeReason: string | null;
  departureReason: { id: string; name: string } | null;
  stateLog: EnrollmentStatusEvent[];
  group: GroupInput | null;
}

export interface CardInput {
  status: string;
  statusChangeReason: string | null;
  statusExitReason: { id: string; name: string } | null;
}

export interface StudentInput {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  card: CardInput;
  enrollments: EnrollmentInput[];
}

export interface TeacherChangeRow {
  createdAt: Date;
  previousTeacherIds: number[];
}

export interface FactContext {
  /** Teacher changes of each group, ascending by time. */
  teacherChangesByGroup: ReadonlyMap<string, readonly TeacherChangeRow[]>;
  teacherName: ReadonlyMap<number, string>;
}

function latestBy<T>(items: readonly T[], at: (item: T) => Date): T {
  return items.reduce((best, x) =>
    at(x).getTime() > at(best).getTime() ? x : best,
  );
}

/**
 * The enrollment the student stopped in: the one ACTIVE or FROZEN just before
 * the stop (the newest if several); else the one closed latest before it;
 * else the newest one opened before it. `null` without enrollments.
 */
export function pickEnrollmentAt(
  enrollments: readonly EnrollmentInput[],
  at: Date,
): EnrollmentInput | null {
  if (enrollments.length === 0) return null;
  const before = new Date(at.getTime() - 1);
  const live = enrollments.filter((e) => {
    const log = [...e.stateLog].sort(
      (a, b) => a.transitionAt.getTime() - b.transitionAt.getTime(),
    );
    supplyOpeningRow(log, e.createdAt);
    supplyClosingRow(log, e);
    const status = enrollmentStatusOn(log, before, e);
    return status === 'ACTIVE' || status === 'FROZEN';
  });
  if (live.length > 0) return latestBy(live, (e) => e.createdAt);
  const closed = enrollments.filter(
    (e) => e.statusChangedAt && e.statusChangedAt.getTime() <= at.getTime(),
  );
  if (closed.length > 0) {
    return latestBy(closed, (e) => e.statusChangedAt as Date);
  }
  const opened = enrollments.filter(
    (e) => e.createdAt.getTime() <= at.getTime(),
  );
  return opened.length > 0 ? latestBy(opened, (e) => e.createdAt) : null;
}

/**
 * The teachers a group had at `at`: the first change after that moment says
 * who they were before it; no later change means today's teachers.
 */
export function teacherIdsAt(
  currentIds: number[],
  changesAsc: readonly TeacherChangeRow[],
  at: Date,
): number[] {
  const next = changesAsc.find((c) => c.createdAt.getTime() > at.getTime());
  return next ? next.previousTeacherIds : currentIds;
}

/**
 * Why the student stopped, read where the stop was written: an expulsion or
 * a freeze on the card (while the card still has that status), leaving a
 * group on the enrollment that closed.
 */
export function reasonOf(
  kind: StopKind,
  card: CardInput,
  enrollment: EnrollmentInput | null,
): { id: string | null; name: string; comment: string | null } {
  const fromCard = card.statusExitReason
    ? {
        id: card.statusExitReason.id,
        name: card.statusExitReason.name,
        comment: card.statusChangeReason,
      }
    : null;
  const fromEnrollment = enrollment?.departureReason
    ? {
        id: enrollment.departureReason.id,
        name: enrollment.departureReason.name,
        comment: enrollment.statusChangeReason,
      }
    : null;
  const cardSpeaks =
    (kind === 'EXPELLED' && card.status === 'EXPELLED') ||
    (kind === 'FROZEN' && card.status === 'FROZEN');
  const picked = cardSpeaks
    ? (fromCard ?? fromEnrollment)
    : fromEnrollment;
  return picked ?? { id: null, name: NO_REASON, comment: null };
}

/**
 * From the student's very first enrollment to the stop, in months. The first
 * enrollment is dated like the old summary did: the earliest `startDate`,
 * else the earliest `createdAt` — marketing reads the same number.
 */
export function studyMonthsOf(
  enrollments: readonly { startDate: Date | null; createdAt: Date }[],
  departedAt: Date,
): number | null {
  const starts = enrollments
    .map((e) => e.startDate)
    .filter((d): d is Date => d !== null);
  const pool =
    starts.length > 0 ? starts : enrollments.map((e) => e.createdAt);
  if (pool.length === 0) return null;
  const first = Math.min(...pool.map((d) => d.getTime()));
  const ms = departedAt.getTime() - first;
  return ms > 0 ? ms / MS_PER_MONTH : null;
}

function placementOf(
  group: GroupInput | null,
  at: Date,
  ctx: FactContext,
): Placement {
  if (!group) return { group: null, course: null, branch: null, teachers: [] };
  const ids = teacherIdsAt(
    group.teacherIds,
    ctx.teacherChangesByGroup.get(group.id) ?? [],
    at,
  );
  return {
    group: { id: group.id, name: group.name },
    course: group.course,
    branch: group.branch,
    teachers: ids.flatMap((id) => {
      const fullName = ctx.teacherName.get(id);
      return fullName ? [{ id, fullName }] : [];
    }),
  };
}

export function buildFact(
  ep: DepartureEpisode,
  s: StudentInput,
  ctx: FactContext,
): DepartureFact {
  const enrollment = pickEnrollmentAt(s.enrollments, ep.startedAt);
  const reason = reasonOf(ep.stopKind, s.card, enrollment);
  return {
    key: `${s.id}:${ep.startedAt.getTime()}`,
    studentId: s.id,
    fullName: `${s.firstName} ${s.lastName}`,
    phone: s.phone,
    balance: s.balance,
    startedAt: ep.startedAt,
    stopKind: ep.stopKind,
    state: ep.state,
    returnedAt: ep.returnedAt,
    reason: { id: reason.id, name: reason.name },
    comment: reason.comment,
    studyMonths: studyMonthsOf(s.enrollments, ep.startedAt),
    ...placementOf(enrollment?.group ?? null, ep.startedAt, ctx),
  };
}

export function buildStartMember(
  enrollmentId: string,
  s: StudentInput,
  at: Date,
  ctx: FactContext,
): StartMember {
  const enrollment = s.enrollments.find((e) => e.id === enrollmentId) ?? null;
  return {
    studentId: s.id,
    ...placementOf(enrollment?.group ?? null, at, ctx),
  };
}
```

- [ ] **Step 4:** Run — PASS. **Step 5:** Prettier + commit `feat(reports): departure fact rules (group, teacher at the stop, reason, study months)`.

---

### Task 4: Faktlarni yuklovchi (DB)

**Files:**
- Create: `server/src/reports/departed/departure-facts.loader.ts`
- Test: `server/src/reports/departed/departure-facts.loader.spec.ts`

**Interfaces:**
- Consumes: `loadDepartures` (Task 2 bilan), `departuresInRange`, `pendingInRange` (`departure-episodes.ts`), Task 3 funksiyalari.
- Produces:

```ts
export interface FactsRequest {
  range: { gte: Date; lt: Date };
  previous?: { gte: Date; lt: Date };
  months?: { key: string; gte: Date; lt: Date; provisional: boolean }[];
  withStartMembers?: boolean;
  withPendingToday?: boolean;
  now?: Date;
}
export interface FactSets {
  current: DepartureFact[];        // departuresInRange(range)
  pendingInRange: DepartureFact[]; // pendingInRange(range)
  previous: DepartureFact[];
  months: { key: string; provisional: boolean; facts: DepartureFact[] }[];
  pendingToday: DepartureFact[];   // every pending episode today
  startMembers: StartMember[];
  floor: Date | null;
  graceDays: { LEFT_GROUP: number; FROZEN: number };
}
export function loadDepartureFacts(prisma: PrismaService, companyId: number, scope: ReportBranchIds, req: FactsRequest): Promise<FactSets>;
export function applyFilter(sets: FactSets, filter: DepartedFilter): FactSets; // pure
export function matchesFilter(item: Placement, filter: DepartedFilter): boolean; // pure
```

- [ ] **Step 1: Failing test.** `jest.mock('../shared/departures.loader')` bilan `loadDepartures` ni soxtalang: 3 epizod (biri tasdiqlangan joriy davrda, biri oldingi davrda, biri kutilmoqda) + `activeAtStartMembers` ikki o'quvchi; `prisma` soxtasi: `student.findMany`, `groupTeacherHistory.findMany`, `user.findMany`. Tekshiruvlar:
  1. `current`, `previous`, `pendingToday`, `pendingInRange`, `months[i].facts` to'g'ri epizodlardan (`departuresInRange` semantikasi: bir o'quvchi — eng erta tasdiqlangani).
  2. Bir epizod ikki to'plamda bo'lsa (joriy va oy ustuni) ikkalasida **bir xil fakt** (`key` teng).
  3. Prisma so'rovlari bitta `student.findMany` (barcha kerakli id lar bilan) — N+1 yo'q.
  4. `startMembers`: har a'zo uchun o'sha yozilishning guruhi.
  5. `applyFilter`: `courseIds` — faktning kursi ro'yxatda; `teacherIds` — to'xtash paytidagi ustozlardan biri ro'yxatda; guruhi noma'lum fakt yoqilgan filtrda tushib qoladi; filtr bo'sh → o'zgarmaydi; `startMembers` ham xuddi shunday filtrlanadi.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Amalga oshirish**

```ts
export async function loadDepartureFacts(prisma, companyId, scope, req) {
  const now = req.now ?? new Date();
  const dep = await loadDepartures(prisma, companyId, scope, {
    activeAt: req.withStartMembers ? req.range.gte : undefined,
    now,
  });
  const { episodes, floor, graceDays } = dep;

  const currentEp = departuresInRange(episodes, req.range, floor);
  const pendingRangeEp = pendingInRange(episodes, req.range, floor);
  const previousEp = req.previous ? departuresInRange(episodes, req.previous, floor) : [];
  const monthEps = (req.months ?? []).map((m) => ({
    key: m.key,
    provisional: m.provisional,
    eps: departuresInRange(episodes, { gte: m.gte, lt: m.lt }, floor),
  }));
  const pendingTodayEp = req.withPendingToday ? episodes.filter((e) => e.state === 'pending') : [];

  const studentIds = new Set<number>();
  for (const e of [...currentEp, ...pendingRangeEp, ...previousEp, ...pendingTodayEp, ...monthEps.flatMap((m) => m.eps)]) studentIds.add(e.studentId);
  for (const m of dep.activeAtStartMembers) studentIds.add(m.studentId);
  if (studentIds.size === 0) {
    return {
      current: [], pendingInRange: [], previous: [], pendingToday: [],
      months: monthEps.map((m) => ({ key: m.key, provisional: m.provisional, facts: [] })),
      startMembers: [], floor, graceDays,
    };
  }

  const rows = await prisma.student.findMany({
    where: { id: { in: [...studentIds] } },
    select: {
      id: true, firstName: true, lastName: true, phone: true, balance: true,
      status: true, statusChangeReason: true,
      statusExitReason: { select: { id: true, name: true } },
      enrollments: {
        where: { deletedAt: null },
        select: {
          id: true, status: true, createdAt: true, startDate: true,
          statusChangedAt: true, statusChangeReason: true,
          departureReason: { select: { id: true, name: true } },
          stateLog: { select: { status: true, transitionAt: true } },
          group: { select: {
            id: true, name: true,
            branch: { select: { id: true, name: true } },
            course: { select: { id: true, name: true } },
            teachers: { select: { teacherId: true } },
          } },
        },
      },
    },
  });

  const groupIds = [
    ...new Set(
      rows.flatMap((r) => r.enrollments.flatMap((e) => (e.group ? [e.group.id] : []))),
    ),
  ];
  const history = groupIds.length
    ? await prisma.groupTeacherHistory.findMany({
        where: { groupId: { in: groupIds } },
        orderBy: { createdAt: 'asc' },
        select: { groupId: true, createdAt: true, previousTeacherIds: true },
      })
    : [];
  const teacherChangesByGroup = new Map<string, TeacherChangeRow[]>();
  for (const h of history) {
    const list = teacherChangesByGroup.get(h.groupId);
    const row = { createdAt: h.createdAt, previousTeacherIds: h.previousTeacherIds };
    if (list) list.push(row);
    else teacherChangesByGroup.set(h.groupId, [row]);
  }

  const teacherIds = new Set<number>(history.flatMap((h) => h.previousTeacherIds));
  for (const r of rows) {
    for (const e of r.enrollments) {
      for (const t of e.group?.teachers ?? []) teacherIds.add(t.teacherId);
    }
  }
  const users = teacherIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...teacherIds] } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const ctx: FactContext = {
    teacherChangesByGroup,
    teacherName: new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`])),
  };

  const students = new Map<number, StudentInput>(
    rows.map((r) => [
      r.id,
      {
        id: r.id, firstName: r.firstName, lastName: r.lastName,
        phone: r.phone, balance: r.balance,
        card: {
          status: r.status,
          statusChangeReason: r.statusChangeReason,
          statusExitReason: r.statusExitReason,
        },
        enrollments: r.enrollments.map((e) => ({
          ...e,
          group: e.group
            ? {
                id: e.group.id, name: e.group.name,
                course: e.group.course, branch: e.group.branch,
                teacherIds: e.group.teachers.map((t) => t.teacherId),
              }
            : null,
        })),
      },
    ]),
  );

  const memo = new Map<string, DepartureFact>();
  const factOf = (ep: DepartureEpisode): DepartureFact => {
    const key = `${ep.studentId}:${ep.startedAt.getTime()}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const fact = buildFact(ep, students.get(ep.studentId) as StudentInput, ctx);
    memo.set(key, fact);
    return fact;
  };

  return {
    current: currentEp.map(factOf),
    pendingInRange: pendingRangeEp.map(factOf),
    previous: previousEp.map(factOf),
    months: monthEps.map((m) => ({
      key: m.key, provisional: m.provisional, facts: m.eps.map(factOf),
    })),
    pendingToday: pendingTodayEp.map(factOf),
    startMembers: dep.activeAtStartMembers.flatMap((m) => {
      const s = students.get(m.studentId);
      return s ? [buildStartMember(m.enrollmentId, s, req.range.gte, ctx)] : [];
    }),
    floor,
    graceDays,
  };
}
```

Filial qamrovi zanjir: faqat `loadDepartures` ning talaba so'rovi `studentBranchWhere(scope)` ni olib yuradi, keyingi so'rovlar uning id'larini o'qiydi (`reports-branch-scope-coverage.spec.ts` shu zanjirni tekshiradi — agar yangi fayl unga qo'shilishi kerak bo'lsa, spec'ni o'qib, tegishli ro'yxatga qo'shing). Faktlarni filtrlash:

```ts
export function applyFilter(sets: FactSets, f: DepartedFilter): FactSets {
  if (!f.courseIds?.length && !f.teacherIds?.length) return sets;
  const keep = <T extends Placement>(items: T[]) => items.filter((x) => matchesFilter(x, f));
  return {
    ...sets,
    current: keep(sets.current),
    pendingInRange: keep(sets.pendingInRange),
    previous: keep(sets.previous),
    pendingToday: keep(sets.pendingToday),
    months: sets.months.map((m) => ({ ...m, facts: keep(m.facts) })),
    startMembers: keep(sets.startMembers),
  };
}

export function matchesFilter(item: Placement, f: DepartedFilter): boolean {
  if (f.courseIds?.length && !(item.course && f.courseIds.includes(item.course.id))) return false;
  if (f.teacherIds?.length && !item.teachers.some((t) => f.teacherIds!.includes(t.id))) return false;
  return true;
}
```
- [ ] **Step 4:** Run — PASS. **Step 5:** Prettier, eslint, commit `feat(reports): load departure facts in one pass`.

---

### Task 5: Yig'ish (toza) va parite testi

**Files:**
- Create: `server/src/reports/departed/departed-aggregate.ts`
- Test: `server/src/reports/departed/departed-aggregate.spec.ts`

**Interfaces:**
- Consumes: `DepartureFact`, `StartMember`, `CutRow`, `CutKey`, `DepartedOverview` (Task 1), `per100`, `shareOf` (Task 1), `NO_REASON` (Task 3).
- Produces:

```ts
export interface AggregateInput {
  current: DepartureFact[];
  previous: DepartureFact[];
  months: { key: string; provisional: boolean; facts: DepartureFact[] }[];
  pendingToday: DepartureFact[];
  startMembers: StartMember[];
}
export type AggregateOutput = Pick<DepartedOverview, 'cards' | 'pendingToday' | 'months' | 'reasons' | 'cuts' | 'uniqueDeparted'>;
export function aggregateOverview(input: AggregateInput): AggregateOutput;
```

- [ ] **Step 1: Failing test** (fabrika `fact()` / `member()` bilan):
  1. **Parite:** 7 ta fakt (har xil sabab, ustoz, kurs, guruh, filial) → `cards.departed` = 7 = Σ `reasons[].count` = `uniqueDeparted` = `cuts.course` yig'indisi = `cuts.group` yig'indisi = `cuts.branch` yig'indisi; `cuts.teacher` yig'indisi ≥ 7 (ikki ustozli guruh) va `uniqueDeparted` 7.
  2. `cards`: `previousDeparted` = `previous.length`; `atStart` = `startMembers.length`; `per100` = `per100(7, atStart)`; `avgStudyMonths` — `studyMonths` bor faktlarning o'rtachasi, bir xona; hech birida yo'q → `null`.
  3. `reasons`: soni bo'yicha kamayish, tenglikda nom bo'yicha; `id: null` («Sabab yozilmagan») ENG OXIRIDA (soni ko'p bo'lsa ham).
  4. `cuts.*`: `departed` va `atStart` (boshlang'ich a'zolar shu kalit bo'yicha) to'g'ri; `share` — `atStart < 5` bo'lsa `null`; ketgani 0 bo'lgan guruh chiqmaydi; tartib `departed` kamayish, so'ng nom.
  5. Guruhi noma'lum fakt: `cuts.group/course/branch` da «Noma'lum» (`id: '-'`) qatori; `cuts.teacher` da ustozsiz fakt ham «Noma'lum».
  6. `months`: kirgan tartibda, `departed = facts.length`, `provisional` o'tadi.
  7. `pendingToday` = `pendingToday.length`.
  8. Bo'sh kirish → hamma nol, `per100: null`, bo'sh massivlar.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: `departed-aggregate.ts`**

```ts
import type { CutKey, CutRow, DepartedOverview, DepartureFact, Placement, StartMember } from './departed.types';
import { per100, shareOf } from './departed-period';

const UNKNOWN = { id: '-', name: "Noma'lum" };
type Keyed = { id: string; name: string };

const KEYS: Record<CutKey, (p: Placement) => Keyed[]> = {
  teacher: (p) => p.teachers.length ? p.teachers.map((t) => ({ id: String(t.id), name: t.fullName })) : [UNKNOWN],
  course: (p) => (p.course ? [{ id: p.course.id, name: p.course.name }] : [UNKNOWN]),
  group: (p) => (p.group ? [{ id: p.group.id, name: p.group.name }] : [UNKNOWN]),
  branch: (p) => (p.branch ? [{ id: String(p.branch.id), name: p.branch.name }] : [UNKNOWN]),
};

function cut(facts: DepartureFact[], members: StartMember[], keysOf: (p: Placement) => Keyed[]): CutRow[] {
  const rows = new Map<string, CutRow>();
  for (const f of facts) for (const k of keysOf(f)) {
    const row = rows.get(k.id) ?? { id: k.id, name: k.name, departed: 0, atStart: 0, share: null };
    row.departed += 1; rows.set(k.id, row);
  }
  for (const m of members) for (const k of keysOf(m)) {
    const row = rows.get(k.id);
    if (row) row.atStart += 1;   // a bucket with no departures is not listed
  }
  return [...rows.values()]
    .map((r) => ({ ...r, share: shareOf(r.departed, r.atStart) }))
    .sort((a, b) => b.departed - a.departed || a.name.localeCompare(b.name, 'uz'));
}
```
`aggregateOverview` ularni birlashtiradi: `reasons` — kalit `reason.id ?? 'none'`, saralash (`id === null` oxirida), `avgStudyMonths` = `Math.round(avg*10)/10` yoki `null`; `cards.per100 = per100(current.length, startMembers.length)`.
- [ ] **Step 4:** Run — PASS. **Step 5:** Prettier + commit `feat(reports): departed-students aggregation with parity guarantees`.

---

### Task 6: `overview` xizmati, DTO, kontroller, yo'l ro'yxati

**Files:**
- Create: `server/src/reports/departed/dto/departed-query.dto.ts`, `departed-overview.service.ts`, `departed.controller.ts`
- Modify: `server/src/reports/shared/teacher-change-departures.ts` (ixtiyoriy `groupFilter`), `server/src/reports/reports.module.ts`, `server/src/common/permissions/route-access.snapshot.json`, `server/src/common/permissions/intentional-access-changes.ts`
- Test: `departed-overview.service.spec.ts`, `departed.controller.spec.ts`, mavjud `teacher-change-departures.spec.ts` ga yangi test.

**Interfaces:**
- Consumes: Task 1–5.
- Produces:
  - `DepartedFilterDto { startDate; endDate; courseId?: string[]; teacherIds?: number[] }` (`@Matches(/^\d{4}-\d{2}-\d{2}$/)` sanalar; `toStringArray`/`toNumberArray` `common/dto/to-array`; `courseId` `@IsUUID each`).
  - `DepartedListQueryDto extends DepartedFilterDto { q?; reasonId?; state?: ListState; debtorsOnly?; page?; pageSize? }` (Task 7 foydalanadi; DTO shu vazifada yoziladi).
  - `DepartedOverviewService.overview(companyId: number, scope: ReportBranchIds, q: DepartedFilterDto): Promise<DepartedOverview>`
  - `DepartedOverviewService.averageStudyMonths(companyId, scope, range: {startDate; endDate}): Promise<number>` — filtrsiz, `current` faktlarining `studyMonths` o'rtachasi, bir xona (0 — yo'q bo'lsa) — marketing o'qiydi (Task 8).
  - `loadTeacherChangeDepartures(prisma, companyId, params & { groupFilter?: { courseIds?: string[]; teacherIds?: number[] } })`: birinchi so'rovdagi `group:` shartiga `courseId: { in: courseIds }` va `teachers: { some: { teacherId: { in: teacherIds } } }` qo'shiladi.
  - `GET /reports/departed-students/overview` → `DepartedOverview`.

- [ ] **Step 1: Failing testlar.**
  - `teacher-change-departures.spec.ts`: `groupFilter` berilsa `groupTeacherHistory.findMany` ning `where.group` shu shartlarni oladi; berilmasa o'zgarmaydi.
  - `departed-overview.service.spec.ts` (`loadDepartureFacts` va `loadTeacherChangeDepartures` `jest.mock`): (a) bo'sh qamrov → 403; (b) `previous` uchun `previousRange` ishlatiladi (oy → oldingi oy); (c) filtr (`courseId`) hamma blokka, **`atStart` ga ham** ta'sir qiladi; (d) `months` 6 ta, oxirgi oyi `endDate` oyi, `provisional` = oyning `lt` qiymati `now − max(graceDays) kun` dan keyin; (e) javobda `range`, `previous`, `graceDays`, `teacherChange` bor; (f) `averageStudyMonths` filtrsiz.
  - `departed.controller.spec.ts`: `routeAccess()` / `defaultRolesOf()` (`common/permissions/testing.ts`) — `overview` `reports.students`, default rollar `summary` bilan bir xil.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Servis**

```ts
async overview(companyId, scope, q) {
  this.assertScope(scope);                               // ForbiddenException, listScope matni
  const range = parseDayRange(q.startDate, q.endDate);
  const prev = previousRange({ startDate: q.startDate, endDate: q.endDate });
  const prevRange = parseDayRange(prev.startDate, prev.endDate);
  const now = new Date();
  const maxGrace = Math.max(...Object.values(DEPARTURE_GRACE_DAYS));
  const months = monthKeysEndingAt(q.endDate, 6).map((key) => {
    const m = tashkentMonthRangeUtc(key);
    return { key, gte: m.gte, lt: m.lt, provisional: m.lt.getTime() > now.getTime() - maxGrace * DAY_MS };
  });
  const sets = await loadDepartureFacts(this.prisma, companyId, scope, { range, previous: prevRange, months, withStartMembers: true, withPendingToday: true, now });
  const filter = { courseIds: q.courseId, teacherIds: q.teacherIds };
  const f = applyFilter(sets, filter);
  const agg = aggregateOverview({ current: f.current, previous: f.previous, months: f.months, pendingToday: f.pendingToday, startMembers: f.startMembers });
  const tc = await loadTeacherChangeDepartures(this.prisma, companyId, { scope, start: range.gte, end: range.lt, groupFilter: filter });
  return { range: {…}, previous: prev, ...agg, teacherChange: { totalTeacherChanges: tc.changes.length, departedAfterTeacherChange: tc.departures.length }, graceDays: sets.graceDays };
}
```
`DEPARTURE_GRACE_DAYS` — `departure-episodes.ts` dan. Kontrollerda `overview` (`@Query() q: DepartedFilterDto`, `@CurrentUser('companyId')`, `@BranchScope()`), `@Controller('reports/departed-students')`; `reports.module.ts` ga kontroller va servislar qo'shiladi (`ReportsDepartedStudentsService` hali turibdi — Task 8 gacha).
- [ ] **Step 4:** Run — PASS. Keyin `npx jest src/common/permissions` — YANGI yo'l uchun yiqiladi: `route-access.snapshot.json` ga `GET /reports/departed-students/overview` qatorini `summary` qatorining nusxasi bilan qo'shing, kerak bo'lsa `intentional-access-changes.ts` ga `summary` yozuvining nusxasi. Qayta run — PASS.
- [ ] **Step 5:** Prettier, eslint, `npm run typecheck`, commit `feat(reports): departed-students overview endpoint`.

---

### Task 7: `list` va `excel`

**Files:**
- Create: `server/src/reports/departed/departed-list.service.ts`, `departed.excel.ts`
- Modify: `departed.controller.ts`, `reports.module.ts`, snapshot + intentional-access-changes
- Test: `departed-list.service.spec.ts`, `departed.excel.spec.ts`, kontroller spec'iga ikki yo'l.

**Interfaces:**
- Consumes: `loadDepartureFacts`, `applyFilter`, `aggregateOverview` (Excel «Xulosa» varag'i uchun), `DepartedListQueryDto`.
- Produces:
  - `DepartedListService.list(companyId, scope, q: DepartedListQueryDto): Promise<DepartedList>`
  - `DepartedListService.excel(companyId, scope, q: DepartedFilterDto & {q?; reasonId?; state?; debtorsOnly?}): Promise<{ buffer: Buffer; filename: string }>`; fayl nomi `ketgan-oquvchilar-<startDate>_<endDate>.xlsx`.
  - Qatorlar to'plami: `current` (tasdiqlangan) ∪ `pendingInRange`, filtr bilan. Holat: `pending` → `kutilmoqda`; tasdiqlangan va `returnedAt` yo'q → `ketgan`; tasdiqlangan va `returnedAt` bor → `qaytgan`. Saralash: `startedAt` kamayish, so'ng `studentId` kamayish.
  - Filtrlar: `q` — ism (kichik harfda, qismi), telefon (raqamlar qismi), yoki ID (butun son tengligi); `reasonId` (`none` — sabab yozilmagan, aks holda `reason.id` tengligi); `state`; `debtorsOnly` (`balance < 0`). `page` default 1, `pageSize` 10..50 (default 10; DTO `Min(10) Max(50)` — Excel sahifalamaydi, 20 000 gacha, oshsa 400 «Qatorlar 20 000 dan oshdi — filtrni toraytiring»).
  - `confirmed` = `ketgan + qaytgan` (jami filtrlangan to'plam bo'yicha), `returned`, `pending`.

- [ ] **Step 1: Failing testlar** (`loadDepartureFacts` soxta): holatlar uchalasi; `q` uchta usulda; `reasonId=none`; `debtorsOnly`; sahifalash; `confirmed/returned/pending` butun to'plam bo'yicha; Excel: ikki varaq «Ro'yxat» (sarlavhalar: O'quvchi, ID, Telefon, Filial, Kurs, Guruh, Ustoz, Ketgan sana, O'qidi (oy), Sabab, Izoh, Holat, Qarzi) va «Xulosa» (kartalar, sabablar, to'rt kesim), ustoz ustunida vergul bilan; qarz so'mda butun son.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Amalga oshirish (B5 `group-payments.excel.ts` uslubi: `new Workbook()`, ustun massivlari, `await wb.xlsx.writeBuffer()`). Kontrollerda `excel` B5 dagi kabi `@Res()` bilan, sarlavhalar `Content-Type`, `Content-Disposition`, `Content-Length`.
- [ ] **Step 4:** Run — PASS; `npx jest src/common/permissions` — snapshot qatorlarini `list` (← eski `list` qatori) va `excel` (← `summary`) uchun qo'shing. **Step 5:** Prettier, eslint, typecheck, commit `feat(reports): departed-students list and Excel`.

---

### Task 8: Eski yo'llarni olib tashlash va marketingni ko'chirish

**Files:**
- Modify: `server/src/reports/marketing/reports-marketing.service.ts`, `reports.controller.ts`, `reports.service.ts`, `reports.module.ts`, snapshot, `intentional-access-changes.ts`, tegishli spec'lar
- Delete: `reports-departed-students.service.ts` (+ spec), `reports-departed-lists.service.ts` (+ spec), keraksiz DTO'lar

**Interfaces:**
- Consumes: `DepartedOverviewService.averageStudyMonths` (Task 6).
- Produces: marketing o'sha raqamni yangi servisdan oladi; olib tashlangan yo'llar: `summary`, `dynamics`, `by-status`, `reasons`, `by-reason`, `group-by`, `transfer-reasons`, `transferred-list`, eski `list`. SAQLANADI: `teacher-changes-list`, `departed-after-change`, `teacher-change-reasons`.

- [ ] **Step 1:** `grep -rn "getDepartedStudents\|ReportsDepartedStudentsService\|ReportsDepartedListsService\|getTransferReasons\|getTransferredList\|getStatusExitReasons\|getDepartedStudentsByReason" server/src --include='*.ts' | grep -v spec` — har bir chaqiruvchini ro'yxatga oling. **Faqat grep isbotlagan keraksizlarni** o'chiring (`reports-departed-reasons.service.ts` dagi `getTeacherChangeReasons` qoladi; `reports-teacher-changes.service.ts` ning ishlatilayotgan metodlari qoladi).
- [ ] **Step 2:** `reports-marketing.service.ts`: `ReportsDepartedStudentsService` o'rniga `DepartedOverviewService`; `getDepartedStudentsSummary(...)` chaqirig'i `averageStudyMonths(companyId, branchIds, { startDate, endDate })`, undan keyin `avgDurationMonths` shu raqam. Marketing spec'ini moslang; eski va yangi qiymat bir xil ekani testda ko'rinsin (bir xil fakt → bir xil o'rtacha).
- [ ] **Step 3:** O'chirish; `route-access.snapshot.json` va `intentional-access-changes.ts` dan o'chirilgan yo'llar qatorlari; `reports.service.ts` fasadidan mos metodlar; modul provayderlari.
- [ ] **Step 4:** Run: `npm run typecheck && npm run build && npx jest src/reports src/common/permissions src/common/auth` — PASS. Keyin to'liq `npm test` (fon rejimida; build bilan parallel EMAS).
- [ ] **Step 5:** Prettier (tegilgan fayllar), eslint, commit `refactor(reports): remove the old departed-students endpoints`.

---

### Task 9: Mijoz — turlar, URL, format, so'rovlar, filtr paneli

**Files:**
- Create: `departed-types.ts`, `departed-url.ts`, `departed-format.ts`, `departed-queries.ts`, `departed-filter-bar.tsx` (hammasi `client/src/components/reports/departed-students/`)
- Test: `departed-url.test.ts`, `departed-format.test.ts`

**Interfaces:**
- Produces:
  - `departed-types.ts`: server turlarining nusxasi (`DepartedOverview`, `DepartedList`, `ListRow`, `CutRow`, `CutKey`, `ListState`) — maydon nomlari serverdagi bilan **aynan** bir xil.
  - `departed-url.ts`: `DEPARTED_SCHEMA` (`useUrlFilters` sxemasi: `preset` (string, `current_month`), `startDate`, `endDate`, `courseId`, `teacherIds` (vergulli), `cut` (`teacher`), `q`, `reason`, `state`, `debtors`, `page` (1), `pageSize` (10)); `resolveDepartedRange(preset, startDate, endDate, today: Date): { startDate: string; endDate: string }`; presetlar `current_month` (oyning 1-kunidan **oxirgi kunigacha**, kelajak kunlar bo'sh tursa ham), `last_month`, `3m` (3 oy oldingi oyning boshidan joriy oyning oxirigacha, ya'ni joriy oy + oldingi 2 oy), `6m`, `range` (qo'lda). Eski `12m` URL'da kelsa `6m` ga tushadi.
  - `departed-format.ts`: `formatPer100(v: number | null): string` (10 dan kichik — bir xona «4,5», aks holda butun «12»; `null` → «—»); `formatStudyMonths(v: number | null): string` («3,4 oy», `null` → «—»); `previousLabel(preset, previous: {startDate}): string` («avgustda», «oldingi 3 oyda», «oldingi 6 oyda», «oldingi davrda» — oy nomlari joy kelishigida: yanvarda, fevralda, martda, aprelda, mayda, iyunda, iyulda, avgustda, sentabrda, oktabrda, noyabrda, dekabrda); `STATE_LABEL: Record<ListState,string>` (`ketgan: «Ketgan»`, `kutilmoqda: «Kutilmoqda»`, `qaytgan: «Qaytgan»`); `formatDay(iso: string): string` (`dd.MM.yyyy`, Toshkent kuni); `formatSom(n)` mavjud yordamchi bo'lsa shuni ishlating.
  - `departed-queries.ts`: `useDepartedOverview(params)`, `useDepartedList(params)` — B5 `group-payments-queries.ts` kabi: `useBranchId()` kalitda, `placeholderData: keepPreviousData`, `staleTime: 0`.
  - `DepartedFilterBar`: davr tugmalari (Bu oy, O'tgan oy, 3 oy, 6 oy, Oraliq), `Oraliq` da ikki sana tanlagich (mavjud `DatePicker`), kurs va ustoz ko'p tanlovi (mavjud `MultiSelectCombobox`), «Tozalash». Kurs/ustoz variantlari `GET /reports/student-payments/filter-options` dan (hozirgi sahifadagidek).

- [ ] **Step 1: Failing testlar** — `resolveDepartedRange` (har preset; `today = 2026-10-17`), `formatPer100`, `formatStudyMonths`, `previousLabel` (oy → «sentabrda» ko'rinishi), URL sxemasi default'lari, eski `12m` → `6m`.
- [ ] **Step 2:** Run (`cd client && npx vitest run src/components/reports/departed-students/departed-url.test.ts src/components/reports/departed-students/departed-format.test.ts`) — FAIL.
- [ ] **Step 3:** Amalga oshirish. `formatPer100`: `Intl`/`toLocaleString("uz-UZ")` o'rniga `String(v).replace('.', ',')` (aniq natija: «4,5»).
- [ ] **Step 4:** Run — PASS; `npx tsc --noEmit`. **Step 5:** Commit `feat(client): departed-students filters, URL state and formatters` (prettier YO'Q).

---

### Task 10: Mijoz — kartalar, kutilayotganlar, oylar, sabablar

**Files:**
- Create: `departed-cards.tsx`, `departed-pending.tsx`, `departed-months.tsx`, `departed-reasons.tsx`
- Modify: `teacher-change-retention-cards.tsx` (matn va xususiyatlar)
- Test: har komponent uchun `*.test.ts` (render testi)

**Interfaces:**
- Consumes: Task 9.
- Produces (`export` nomlari):
  - `DepartedCards({ data, previousLabel, isLoading })` — 3 karta (maket §4.1): «{Oy}da ketdi / N o'quvchi / {oldingi} M edi»; «Har 100 o'quvchidan / N tasi ketdi / davr boshida X o'quvchi o'qiyotgan edi»; «Ketguncha o'qidi / N oy / o'rtacha». `atStart = 0` bo'lsa ikkinchi kartada «—».
  - `DepartedPending({ count, graceDays })` — `count > 0` bo'lsagina sariq blok (`bg-amber-500/10`): «**N o'quvchi** — guruhdan chiqqaniga {LEFT_GROUP} kun yoki muzlatilganiga {FROZEN} kun to'lmagan. Qaytmasa, «ketgan» hisoblanadi.» + «Aloqa markaziga» tugmasi (`next/link` → `/outreach`). Sarlavha «Hali qaytishi mumkin · bugungi holat».
  - `DepartedMonths({ months })` — oxirgi 6 oy ustunlari (`div` balandlik foizi, maket `.vbars`); `provisional` ustun `opacity-50`; ostida bir qatorli izoh faqat provisional bor bo'lsa: «Och rangdagi oylar dastlabki: qaytish muddati tugamagan.» Oy yorlig'i qisqa: apr, may, iyun, iyul, avg, sen, okt, noy, dek, yan, fev, mar. `aria-label` butun qatorni aytib beradi.
  - `DepartedReasons({ reasons, onReadComments })` — gorizontal chiziqlar (maket `.rbar`), eng kattasi 100% kenglik; «Boshqa sabab» nomli qatorda (nom `Boshqa sabab` ga teng bo'lsa) ostida ««Boshqa sabab» izohlarini o'qish» tugmasi → `onReadComments(reasonId)`; ostidagi izoh: «Chetlatilgan o'quvchining sababi uning kartasidan olinadi.»
  - `TeacherChangeRetentionCards`: maket matni «{Oy}da N ta guruhda ustoz almashdi. Keyingi 5 darsda shu guruhlardan M o'quvchi ketdi.»; oynalar (`TeacherChangesDialog`, `DepartedAfterChangeDialog`) saqlanadi va endi kurs/ustoz filtrini ham yuboradi (mavjud `queryParams`).

- [ ] **Step 1: Failing render testlar** (har komponent: asosiy holat, bo'sh holat, `isLoading` skeleti; `DepartedPending` `count: 0` → hech narsa chizilmaydi; `DepartedMonths` provisional izohi faqat kerak bo'lganda; `DepartedReasons` «Sabab yozilmagan» qatori oxirida va «izohlarini o'qish» faqat «Boshqa sabab» da).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Amalga oshirish (shadcn `Card`/`Skeleton`/`Button`; `space-y-*` o'rniga `flex flex-col gap-*`; ikonkalarga o'lcham klassi bermang). **Step 4:** Run + `npx tsc --noEmit` — PASS. **Step 5:** Commit `feat(client): departed-students cards, pending block, months and reasons`.

---

### Task 11: Mijoz — kesimlar, ro'yxat, sahifa, eskilarni o'chirish

**Files:**
- Create: `departed-cuts.tsx`, `departed-list.tsx`, `departed-students-page.tsx`
- Modify: `client/src/app/(dashboard)/reports/departed-students/page.tsx`
- Delete: `departed-students-client.tsx`, `departed-students-kpi-cards.tsx` (+ test), `departed-students-dynamics-chart.tsx`, `departed-students-status-chart.tsx`, `departed-students-group-by-chart.tsx`, `departed-students-filter-bar.tsx`, `departed-students-table.tsx` (+ test)
- Test: `departed-cuts.test.ts`, `departed-list.test.ts`, `departed-page.test.ts`

**Interfaces:**
- Consumes: Task 9–10, `useDepartedOverview`, `useDepartedList`, `downloadAuthedFile` (`@/lib/download-file`).
- Produces:
  - `DepartedCuts({ cuts, uniqueDeparted, cut, onCutChange })` — tugmalar Ustoz / Kurs / Guruh / Filial; jadval: nom, Ketdi, Oy boshida, Ulushi (`share` `null` → «—»; ulush `%`); ustoz kesimida ostida «Ustoz — o'quvchi ketgan paytdagi ustozi. Ikki ustozli guruh ikkala ustozda sanaladi.» va «Jami (takrorlanmasdan): {uniqueDeparted}».
  - `DepartedList({ rows, total, … })` — filtr qatori (qidiruv, sabab tanlovi — `overview.reasons` dan, holat, «Faqat qarzi borlar»), jadval (O'quvchi — ism + telefon, `/students/{id}` havolasi; Oxirgi guruh — `/groups/{id}` havolasi; Ketgan sana; O'qidi; Sabab + izoh `title`/qatorda; Holat nishoni — `ketgan` neytral, `kutilmoqda` amber, `qaytgan` emerald; Qarzi — `debt > 0` bo'lsa so'm va `/payments/debt?q={id}` havolasi (shu yo'l qo'llab-quvvatlanishini `client/src/components/payments/debt/` da tekshiring; yo'q bo'lsa `/payments/debt` ga oddiy havola), aks holda «—»), jadval ostida «{confirmed} ketgan, shundan {returned} qaytgan · {pending} kutilmoqda» va sahifalash (10–50). Izoh ustuni: «Boshqa sabab» izohlarini o'qish tugmasi bosilganda `reason` filtri shu sababga o'rnatiladi va Sabab ustuni izohni ko'rsatadi.
  - `DepartedStudentsPage` — sarlavha «Ketgan o'quvchilar» + `Excel` tugmasi (`downloadAuthedFile` bilan `/reports/departed-students/excel`, joriy filtrlar bilan, sahifasiz) + sozlama tugmasi (`canManageReasons`, «Ketish sabablarini boshqarish» → mavjud `DepartureReasonsDialog`); tartib: filtr paneli, kartalar, kutilayotganlar, oylar + sabablar (ikki ustun), kesimlar, ro'yxat, «Ustoz almashgandan keyin». Eski javobni yangi davr deb chizmaslik: `isFetching && isPlaceholderData` bo'lsa bloklar `opacity-60`, ro'yxat jadvali `inert`.
  - Sahifa `page.tsx` yangi komponentni chaqiradi.

- [ ] **Step 1: Failing render testlar:** kesim jadvali (`share: null` → «—», ustoz kesimida «Jami (takrorlanmasdan)» matni, boshqa kesimda yo'q); ro'yxat (uch holat nishoni; qarz havolasi; bo'sh ro'yxat matni «Bu davrda ketgan o'quvchi yo'q»); sahifa (yuklanayotganda skelet; xatoda xato matni).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Amalga oshirish; eski fayllarni o'chiring (`git rm`); `grep -rn "departed-students-" client/src` bilan o'chirilganlarga havola qolmaganini tekshiring (`dialog-pagination-footer.tsx`, `teacher-changes-dialog.tsx`, `departed-after-change-dialog.tsx`, `departure-reasons-dialog.tsx`, `teacher-change-*` QOLADI).
- [ ] **Step 4:** `npx vitest run src/components/reports/departed-students`, `npx tsc --noEmit`, `npm run lint` (xatosiz). Telefon kengligida (375 px) tekshiruvi 12-bosqichda. **Step 5:** Commit `feat(client): departed-students page rebuilt on the single data set`.

---

### Task 12: Hujjatlar

**Files:**
- Create: `docs/adr/0097-ketgan-oquvchilar-hisoboti-bitta-malumot-toplami.md`, `client/src/qollanma/kontent/hisobotlar/ketgan-oquvchilar.mdx`
- Modify: `docs/adr/README.md` (indeks qatori), `client/src/qollanma/bolimlar.ts` (sahifa ro'yxati; `xodimlar-kpi.mdx` qanday ro'yxatdan o'tganini `grep -rn "xodimlar-kpi" client/src/qollanma` bilan ko'ring), `client/src/qollanma/yangiliklar.ts` (yangi yozuv), `server/CLAUDE.md`, `client/CLAUDE.md` (eski yo'llar o'rniga yangilari)

**Interfaces:** hujjatlar kodga bog'liq emas.

- [ ] **Step 1: ADR-0097** (o'zbekcha, `0035` formatida): qaror — hisobot sahifasi bitta fakt to'plamidan (`departed/`) hisoblanadi; sabab epizodga, ustoz to'xtash paytida, kesim maxraji «oy boshida»; filtr hamma blokka; ro'yxat davrdagi hamma ketganlar (qaytganlar belgisi bilan); eski sabablar `DROPPED` yozilish sanardi — nega mos kelmasdi; «Kursni tugatdi» hozircha ketgan (CEO 17.10; imtihon va Teilnahmebestätigung qo'shilgach yangi ADR bilan o'zgaradi). ADR-0035 ta'rifi o'zgarmaydi («Bog'liq»). Holat «Qabul qilindi», sana 2026-10-17.
- [ ] **Step 2: Qo'llanma sahifasi** — oddiy tilda: sahifa nimani ko'rsatadi, «ketgan» qachon sanaladi (21 va 60 kun), «Kutilmoqda» va «Qaytgan» nimani anglatadi, sabab qayerdan olinadi, «Oy boshida» nima, ulush nega «—» bo'lishi mumkin. Rasmsiz.
- [ ] **Step 3: `yangiliklar.ts`** yozuvi (mavjud yozuvlar formatida): sahifa qayta qurildi, filtr hamma blokka ta'sir qiladi, sabablar endi tepadagi songa teng, Excel qo'shildi.
- [ ] **Step 4: CLAUDE.md** — server: «Reports Module» bo'limida ketgan o'quvchilar yo'llari (`overview`, `list`, `excel`) va «`loadDepartureFacts` — yagona o'qish»; client: sahifa tuzilishi. Qoida: server/CLAUDE.md faqat inglizcha.
- [ ] **Step 5:** Qo'llanma coverage testlari (`client`: `npx vitest run src/qollanma`) PASS; commit `docs: ADR-0097, guide page and news entry for the departed-students report`.

---

### Task 13: Yakuniy tekshiruv (boshqaruvchi bajaradi)

Subagent emas, boshqaruvchi:

- [ ] Server: `npm run typecheck && npm run build && npm test`; `npx eslint src --quiet` (CI kabi). Mijoz: `npx tsc --noEmit && npx vitest run && npm run lint && npm run build`.
- [ ] Soxta API bilan brauzer tekshiruvi (`mock-api` naqshi, throwaway; yangi `overview`/`list` javoblari to'qilgan): kompyuter va 375 px, qorong'u rejim, davr almashishi (eski javob chizilmasligi), filtr hamma blokka, «Boshqa sabab» izohlari, Excel tugmasi, «Aloqa markaziga» havolasi. Skrinshotlar CEO'ga PR'dan oldin.
- [ ] Yakuniy butun-branch ko'rik (opus), bitta tuzatish to'lqini.
- [ ] `main` bilan birlashtirish (`git merge origin/main`), qayta to'liq sinov.

---

## Self-review (reja muallifi)

**Spec qamrovi:** §2 qarorlar — T10 (matn), T12 (ADR); §3 fakt to'plami — T2–T5; §4.1 kartalar — T5, T6, T10; §4.2 kutilayotganlar — T4 (`withPendingToday`), T10; §4.3 oylar — T6 (`provisional`), T10; §4.4 sabablar — T3 (`reasonOf`), T5, T10; §4.5 kesimlar — T5, T11; §4.6 ro'yxat — T7, T11; §4.7 ustoz almashishi — T6 (`groupFilter`), T10; Excel — T7, T11; §5 server yo'llari — T6, T7, T8; §6 mijoz — T9–T11; §7 chekka holatlar — T3 (guruh topilmasa), T5 («Noma'lum»), T1 (`floor` — T4 da `departuresInRange(…, floor)`), T4; §8 sinov — har vazifada, parite T5; §9 chiqarish — T13 + boshqaruvchi; §10 — yo'q.

**Turlar mosligi:** `FactSets`, `DepartureFact`, `StartMember`, `AggregateInput`, `DepartedOverview`, `ListRow`, `DepartedList` — T1 da bir marta aniqlangan, T4–T11 da shu nomlar. Mijoz turlari T9 da serverniki bilan bir xil nomlar. `averageStudyMonths` — T6 da yaratiladi, T8 da ishlatiladi. `activeAtStartMembers` — T2 da, T4 da o'qiladi.

**Ochiq tekshiruvlar (implementer o'qib aniqlaydi, taxmin qilinmaydi):** `tashkentRangeUtc` ning xato sanadagi xatti-harakati (T1 test 3); `/payments/debt` ning o'quvchi bo'yicha qidiruv parametri (T11); `route-access.snapshot.json` qator formati (T6).
