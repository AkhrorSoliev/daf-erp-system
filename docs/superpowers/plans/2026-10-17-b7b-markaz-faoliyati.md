# «Markaz faoliyati» hisoboti (B7b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/reports/activity` sahifasini bitta ma'lumot to'plamidan hisoblaydigan yangi «Markaz faoliyati» hisobotiga almashtirish (bandlik, to'lganlik, bo'sh o'rinlar, «qachon xona bo'sh» jadvali, xonalar, guruhlar, oylar, Excel).

**Architecture:** Server `reports/center-activity/` modulida bir marta yuklaydi (`CenterFactsLoader`), keyin sof funksiyalar har bir oy uchun `asOf` holatini hisoblaydi (`evaluateCenter`), javobni `buildOverview` yig'adi; kartalar, jadvallar va oylar bitta `CenterEval`dan chiqadi, shuning uchun yig'indilar mos keladi. Mijoz bitta so'rov (`GET /reports/center-activity/overview`) bilan hamma blokni chizadi va hech narsa hisoblamaydi. Eski `reports-center-activity.service.ts` va uning mijoz komponentlari o'chiriladi.

**Tech Stack:** NestJS + Prisma 7 + Jest + exceljs; Next.js 16 + React Query + Vitest; `useUrlFilters`, `MonthStepper`, `PaymentsPager`.

**Spec:** `docs/superpowers/specs/2026-10-17-b7b-markaz-faoliyati-design.md` (har bir vazifa shu spec bo'limiga tayanadi).

## Global Constraints

- Hafta du–sha (6 kun); ish vaqti filial sozlamasidan (`startOfWorkingDay`/`endOfWorkingDay`), noto'g'ri yoki bo'sh bo'lsa 09:00–21:00. Bayram odatiy haftani o'zgartirmaydi.
- Dars soati: 30 daqiqalik bo'laklar to'plami (bir xonada ikki guruh bir marta sanaladi), ish vaqti oynasiga qirqiladi → bandlik 100% dan oshmaydi.
- `asOf`: o'tgan oy uchun oyning oxiri (`tashkentMonthRangeUtc(oy).lt − 1 ms`), joriy oy uchun hozir. Hisobot bazasi `2026-05` dan boshlanadi; kelajak oy 400.
- Guruh `asOf` da ochiq: `max(createdAt, startDate) ≤ asOf`, `endDate` yo'q yoki `asOf ≤ endDate`, `deletedAt` yo'q yoki `asOf < deletedAt`, `StatusHistory` bo'yicha holat `ACTIVE` yoki `FORMING` (yozuv yo'q bo'lsa `createdAt` dan ACTIVE). Yuklovchi `deletedAt` bo'yicha filtrlamaydi.
- To'lganlik % = `Σ min(o'quvchi, sig'im) / Σ sig'im` (xonasi va sig'imi bor ochiq guruhlar). Bo'sh o'rin = `Σ max(0, sig'im − o'quvchi)`. Tushum = `Σ bo'sh o'rin × kurs oylik narxi` (faqat `paymentModel = MONTHLY`, shu kundagi narx).
- Issiqlik katagi: filial xonalaridan shu soatda (butun soat, to'liq ish vaqti ichida) dars bilan band bo'lmaganlari; rang `free/xonalar`: ≥ 0.75 yashil, ≥ 0.40 och yashil, ≥ 0.15 sariq, qolgani qizil.
- Marker: ikkala yo'l `@Can('reports.students')` (CEO + filial direktori; Administrator yo'q), `@BranchScope()`; bo'sh qamrov → 403 hech narsa o'qilmasdan. `oy` xato → 400 «Oy YYYY-MM ko'rinishida bo'lishi kerak»; `filial` qamrovda bo'lmasa 400.
- Kesh yo'q (`// ponytail:` izohi: Redis kaliti kompaniya + filial + oy).
- Mijoz hech qanday raqamni o'zi hisoblamaydi; jadvallar `#` ustuni bilan, sahifalash 10 (10–50), `useState`; ekranda inglizcha so'z yo'q (`ACTIVE`, `slot` va h.k.); `space-y-*` o'rniga `flex flex-col gap-*` yangi kodda; SVG atributlarida `hsl(var(--…))` yo'q; `amber-*`/`sky-*` o'rniga `yellow-*`.
- Yangi fayl 500 qatordan oshmaydi. Server: `npx prettier --write` faqat `server/` ichidan (node_modules bilan); mijozda prettier ishlatilmaydi.
- Commit xabari inglizcha, oxirida: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. ADR, spec va qo'llanma — o'zbekcha.
- Worktree: `.claude/worktrees/b7b-markaz`, branch `feat/b7b-markaz-faoliyati`. Hamma buyruq shu worktree ichida; PUSH/PR/merge yo'q.

## File Structure

Server (yangi): `server/src/reports/center-activity/`
- `center-activity.types.ts` — faktlar, natija va javob turlari, `WEEK_DAYS`, `DAY_SHORT`.
- `center-activity-period.ts` — `parseCenterMonth`, `asOfForMonth`, `monthsUpTo`, `CENTER_FIRST_MONTH`.
- `center-points.ts` — `pointOn`, `toMinutes`, `normalizeWorkWindow`, `lessonSlots`, `groupStatusOn`, `isGroupOpen`, `roomExistsOn`, `enrolledOn`.
- `center-metrics.ts` — `evaluateCenter`.
- `center-heat.ts` — `heatTone`, `buildHeat`; `heat-insight.ts` — `heatInsight`.
- `center-overview.ts` — `buildOverview` (javobni yig'adi, ustunlar parite).
- `center-facts.loader.ts` — `CenterFactsLoader.load`.
- `center-activity.service.ts`, `center-activity.controller.ts`, `center-activity.excel.ts`, `dto/center-activity-query.dto.ts` va har birining `*.spec.ts`.

Server (o'zgaradi): `reports.module.ts`, `reports.controller.ts`, `reports.service.ts` (+ spec), `rooms/rooms.service.ts`, `common/permissions/route-access.snapshot.json`, `common/permissions/intentional-access-changes.ts`. O'chiriladi: `reports-center-activity.service.ts` (+ spec), `dto/center-activity-query.dto.ts`.

Mijoz: `client/src/components/reports/center-activity/` — eski 13 fayl o'chiriladi; yangilari: `center-activity-types.ts`, `center-activity-url.ts`, `center-activity-format.ts`, `center-activity-queries.ts`, `center-activity-cards.tsx`, `center-activity-heat.tsx`, `center-activity-rooms.tsx`, `center-activity-groups.tsx`, `center-activity-months.tsx`, `center-activity-page.tsx` (+ `*.test.ts`). O'zgaradi: `app/(dashboard)/reports/activity/page.tsx`, `lib/reports-nav.ts`, `lib/breadcrumb-routes.ts`, `lib/uzbek-only-texts.test.ts`, qo'llanma (`kontent/hisobotlar/markaz-faoliyati.mdx`, `sahifalar/hisobotlar.ts`, `yangiliklar.ts`).

Hujjat: `docs/adr/0098-markaz-faoliyati-bitta-malumot-toplami.md`, `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md`.

---

### Task 0: Tayyorgarlik (worktree)

**Files:** yo'q (faqat muhit).

- [ ] **Step 1: Bog'liqliklarni o'rnat**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/b7b-markaz/server && npm ci && npx prisma generate
cd ../client && npm ci
```
Expected: ikkalasi xatosiz tugaydi.

- [ ] **Step 2: Asos holatini tekshir**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/b7b-markaz/server && npx jest src/reports/reports-center-activity.service.spec.ts src/reports/group-payments
```
Expected: PASS (keyingi vazifalar buni buzmaganini taqqoslash uchun).

- [ ] **Step 3: Eslatma (commit yo'q)** — `client/AGENTS.md` ni `next dev` qayta yozadi; ishdan keyin `git checkout -- client/AGENTS.md`.

---

### Task 1: Oy va `asOf` yordamchilari + so'rov DTO

**Files:**
- Create: `server/src/reports/center-activity/center-activity-period.ts`
- Create: `server/src/reports/center-activity/center-activity-period.spec.ts`
- Create: `server/src/reports/center-activity/dto/center-activity-query.dto.ts`
- Create: `server/src/reports/center-activity/dto/center-activity-query.dto.spec.ts`

**Interfaces:**
- Produces:
  - `export const CENTER_FIRST_MONTH = '2026-05'`
  - `export function parseCenterMonth(oy: string | undefined, now: Date): string` — bo'sh → joriy Toshkent oyi; chegaradan tashqari → `BadRequestException` (matn pastda).
  - `export function asOfForMonth(month: string, now: Date): Date`
  - `export function monthsUpTo(month: string, max?: number): string[]` — o'sish tartibida, `CENTER_FIRST_MONTH` dan past emas, ko'pi bilan `max` (standart 6).
  - `export class CenterActivityQueryDto { oy?: string; filial?: number }`

- [ ] **Step 1: Yiqiladigan test yoz** (`center-activity-period.spec.ts`)

```ts
import { BadRequestException } from '@nestjs/common';
import {
  CENTER_FIRST_MONTH,
  asOfForMonth,
  monthsUpTo,
  parseCenterMonth,
} from './center-activity-period';

// 2026-10-17 10:00 Toshkent = 05:00 UTC
const NOW = new Date('2026-10-17T05:00:00.000Z');

describe('parseCenterMonth', () => {
  it('empty means the current Tashkent month', () => {
    expect(parseCenterMonth(undefined, NOW)).toBe('2026-10');
    expect(parseCenterMonth('', NOW)).toBe('2026-10');
  });

  it('uses the Tashkent month, not the UTC one (00:30 on the 1st)', () => {
    // 2026-10-31T19:30Z is 2026-11-01 00:30 in Tashkent
    expect(parseCenterMonth(undefined, new Date('2026-10-31T19:30:00Z'))).toBe(
      '2026-11',
    );
  });

  it('accepts the floor month and the current month', () => {
    expect(parseCenterMonth('2026-05', NOW)).toBe('2026-05');
    expect(parseCenterMonth('2026-10', NOW)).toBe('2026-10');
  });

  it('refuses a month before May 2026 and a future month, in Uzbek', () => {
    expect(() => parseCenterMonth('2026-04', NOW)).toThrow(
      new BadRequestException('Bu hisobot may 2026 dan boshlanadi'),
    );
    expect(() => parseCenterMonth('2026-11', NOW)).toThrow(
      new BadRequestException("Kelajak oyni tanlab bo'lmaydi"),
    );
  });
});

describe('asOfForMonth', () => {
  it('a past month is read at its last millisecond', () => {
    // 2026-09-30 23:59:59.999 Toshkent = 18:59:59.999 UTC
    expect(asOfForMonth('2026-09', NOW).toISOString()).toBe(
      '2026-09-30T18:59:59.999Z',
    );
  });

  it('the current month is read now', () => {
    expect(asOfForMonth('2026-10', NOW).getTime()).toBe(NOW.getTime());
  });
});

describe('monthsUpTo', () => {
  it('counts back at most six months, never before the floor', () => {
    expect(monthsUpTo('2026-10')).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(monthsUpTo('2026-07')).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(monthsUpTo('2027-02')).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
    expect(monthsUpTo('2027-02')[0] >= CENTER_FIRST_MONTH).toBe(true);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-activity-period.spec.ts`
Expected: FAIL — «Cannot find module './center-activity-period'».

- [ ] **Step 3: Implementatsiya** (`center-activity-period.ts`)

```ts
import { BadRequestException } from '@nestjs/common';
import {
  addMonthsToMonthKey,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../../common/date/tashkent';

/** The report starts with the reporting base (ADR-0067): no month before it. */
export const CENTER_FIRST_MONTH = '2026-05';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `?oy=` → a month key inside [2026-05, the current Tashkent month]. Empty is the current month. */
export function parseCenterMonth(oy: string | undefined, now: Date): string {
  const current = tashkentMonthKey(now);
  if (!oy) return current;
  if (!MONTH.test(oy)) {
    throw new BadRequestException("Oy YYYY-MM ko'rinishida bo'lishi kerak");
  }
  if (oy < CENTER_FIRST_MONTH) {
    throw new BadRequestException('Bu hisobot may 2026 dan boshlanadi');
  }
  if (oy > current) {
    throw new BadRequestException("Kelajak oyni tanlab bo'lmaydi");
  }
  return oy;
}

/**
 * The instant a month is read at: its last millisecond, or `now` for a month
 * still running. Every figure of the page is the state AT this instant.
 */
export function asOfForMonth(month: string, now: Date): Date {
  const end = new Date(tashkentMonthRangeUtc(month).lt.getTime() - 1);
  return end.getTime() > now.getTime() ? now : end;
}

/** The bars of «Oylar bo'yicha»: up to `max` months ending at `month`, oldest first, none before the floor. */
export function monthsUpTo(month: string, max = 6): string[] {
  const out: string[] = [];
  for (let i = max - 1; i >= 0; i--) {
    const m = addMonthsToMonthKey(month, -i);
    if (m >= CENTER_FIRST_MONTH) out.push(m);
  }
  return out;
}
```

- [ ] **Step 4: DTO testi** (`dto/center-activity-query.dto.spec.ts`)

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CenterActivityQueryDto } from './center-activity-query.dto';

const props = async (query: object) =>
  (
    await validate(plainToInstance(CenterActivityQueryDto, query), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map((e) => e.property);

describe('CenterActivityQueryDto', () => {
  it('accepts the URL the page keeps', async () => {
    expect(await props({ oy: '2026-09', filial: '2' })).toEqual([]);
    expect(await props({})).toEqual([]);
  });

  it.each([
    ['oy', '2026-13'],
    ['oy', '09.2026'],
    ['filial', '0'],
    ['filial', 'a'],
  ])('refuses %s=%s', async (key, value) => {
    expect(await props({ [key]: value })).toEqual([key]);
  });

  it('refuses an unknown key', async () => {
    expect(await props({ bucket: 'daily' })).toEqual(['bucket']);
  });
});
```

- [ ] **Step 5: DTO** (`dto/center-activity-query.dto.ts`)

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

/** `GET /reports/center-activity/overview` and `/excel`. The month's range is checked in `parseCenterMonth`. */
export class CenterActivityQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "Oy YYYY-MM ko'rinishida bo'lishi kerak",
  })
  oy?: string;

  /** The branch the «Qachon xona bo'sh» table is drawn for. Must be inside the caller's scope (checked in the service). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Filial butun son bo'lishi kerak" })
  @Min(1, { message: "Filial 1 dan kichik bo'lmaydi" })
  filial?: number;
}
```

- [ ] **Step 6: O'tishini ko'r**

Run: `cd server && npx jest src/reports/center-activity`
Expected: PASS (ikkala fayl).

- [ ] **Step 7: Commit**

```bash
cd server && npx prettier --write src/reports/center-activity && cd .. && git add server/src/reports/center-activity && git commit -m "feat(center-activity): month and as-of helpers, query DTO

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Turlar va «shu kunda» sof yordamchilari

**Files:**
- Create: `server/src/reports/center-activity/center-activity.types.ts`
- Create: `server/src/reports/center-activity/center-points.ts`
- Create: `server/src/reports/center-activity/center-points.spec.ts`

**Interfaces:**
- Produces (types, hammasi `center-activity.types.ts`dan export):

```ts
export const WEEK_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
export const DAY_SHORT: Record<WeekDay, string> = { monday: 'Du', tuesday: 'Se', wednesday: 'Chor', thursday: 'Pay', friday: 'Ju', saturday: 'Sha' };
export const DEFAULT_WORK_START = '09:00';
export const DEFAULT_WORK_END = '21:00';

export interface Point<T> { validFrom: Date; validTo: Date | null; value: T }
export interface WorkWindow { start: string; end: string }
export interface RoomFact {
  id: string; name: string; branchId: number; branchName: string;
  createdAt: Date; deletedAt: Date | null; status: string;
  capacityNow: number | null; capacityHistory: Point<number>[];
  window: WorkWindow;
}
export interface ScheduleValue { exactDays: string[]; start: string | null; end: string | null; courseId: string | null }
export interface EnrollmentFact { createdAt: Date; statusChangedAt: Date | null; status: string; log: EnrollmentStatusEvent[] }
export interface GroupFact {
  id: string; name: string; roomId: string | null; branchId: number;
  createdAt: Date; startDate: Date | null; endDate: Date | null; deletedAt: Date | null;
  scheduleNow: ScheduleValue; scheduleHistory: Point<ScheduleValue>[];
  statusLog: { status: string; at: Date }[]; // ascending by `at`
  enrollments: EnrollmentFact[];
}
export interface CourseFact { id: string; name: string; monthly: boolean; priceNow: number; priceHistory: Point<number>[] }
export interface CenterFacts { rooms: RoomFact[]; groups: GroupFact[]; courses: Map<string, CourseFact> }
```
(`EnrollmentStatusEvent` — `students/shared/enrollment-status-on.ts`dan import.)

- Produces (`center-points.ts`):
  - `pointOn<T>(history: Point<T>[], at: Date, fallback: T): T`
  - `toMinutes(hhmm: string): number`
  - `normalizeWorkWindow(start: string | null, end: string | null): WorkWindow` — noto'g'ri/bo'sh/boshi ≥ oxiri → standart.
  - `lessonSlots(start: string | null, end: string | null, w: WorkWindow): number[]` — 30 daqiqalik bo'lak indekslari (`minut/30`), ish oynasiga qirqilgan; vaqt yo'q/noto'g'ri → `[]`.
  - `groupStatusOn(g: GroupFact, at: Date): string`
  - `isGroupOpen(g: GroupFact, at: Date): boolean`
  - `roomExistsOn(r: RoomFact, at: Date, current: boolean): boolean`
  - `enrolledOn(g: GroupFact, at: Date): number`

- [ ] **Step 1: `center-activity.types.ts` ni yoz** — yuqoridagi bloklarni aynan shu ko'rinishda (bitta fayl, importlar: `EnrollmentStatusEvent` from `'../../students/shared/enrollment-status-on'`).

- [ ] **Step 2: Yiqiladigan test yoz** (`center-points.spec.ts`)

```ts
import {
  enrolledOn,
  groupStatusOn,
  isGroupOpen,
  lessonSlots,
  normalizeWorkWindow,
  pointOn,
  roomExistsOn,
  toMinutes,
} from './center-points';
import type { GroupFact, RoomFact } from './center-activity.types';

const d = (s: string) => new Date(s);
const W = { start: '08:00', end: '22:30' };

const group = (over: Partial<GroupFact> = {}): GroupFact => ({
  id: 'g1',
  name: 'A1-04',
  roomId: 'r1',
  branchId: 1,
  createdAt: d('2026-05-01T00:00:00Z'),
  startDate: null,
  endDate: null,
  deletedAt: null,
  scheduleNow: { exactDays: ['monday'], start: '10:00', end: '11:30', courseId: 'c1' },
  scheduleHistory: [],
  statusLog: [],
  enrollments: [],
  ...over,
});

describe('pointOn', () => {
  const history = [
    { validFrom: d('2026-05-01T00:00:00Z'), validTo: d('2026-07-01T00:00:00Z'), value: 10 },
    { validFrom: d('2026-07-01T00:00:00Z'), validTo: null, value: 14 },
  ];
  it('reads the version valid at the instant, else the fallback', () => {
    expect(pointOn(history, d('2026-06-15T00:00:00Z'), 99)).toBe(10);
    expect(pointOn(history, d('2026-07-01T00:00:00Z'), 99)).toBe(14);
    expect(pointOn(history, d('2026-04-01T00:00:00Z'), 99)).toBe(99);
    expect(pointOn([], d('2026-06-15T00:00:00Z'), 7)).toBe(7);
  });
});

describe('normalizeWorkWindow', () => {
  it('keeps a valid window and falls back otherwise', () => {
    expect(normalizeWorkWindow('08:00', '22:30')).toEqual({ start: '08:00', end: '22:30' });
    expect(normalizeWorkWindow(null, null)).toEqual({ start: '09:00', end: '21:00' });
    expect(normalizeWorkWindow('21:00', '09:00')).toEqual({ start: '09:00', end: '21:00' });
    expect(normalizeWorkWindow('9', '21:00')).toEqual({ start: '09:00', end: '21:00' });
  });
});

describe('lessonSlots', () => {
  it('returns half-hour slot indexes', () => {
    expect(lessonSlots('10:00', '11:30', W)).toEqual([20, 21, 22]);
  });
  it('clips to the working window', () => {
    expect(lessonSlots('07:00', '09:00', W)).toEqual([16, 17]);
    expect(lessonSlots('22:00', '23:30', W)).toEqual([44]);
  });
  it('returns nothing for a missing or reversed time', () => {
    expect(lessonSlots(null, '11:00', W)).toEqual([]);
    expect(lessonSlots('12:00', '11:00', W)).toEqual([]);
    expect(lessonSlots('25:00', '26:00', W)).toEqual([]);
  });
  it('toMinutes', () => {
    expect(toMinutes('08:30')).toBe(510);
  });
});

describe('groupStatusOn', () => {
  it('reads StatusHistory, and ACTIVE from creation when there is none', () => {
    const g = group({
      statusLog: [
        { status: 'CANCELLED', at: d('2026-08-10T00:00:00Z') },
        { status: 'ACTIVE', at: d('2026-08-20T00:00:00Z') },
      ],
    });
    expect(groupStatusOn(g, d('2026-08-01T00:00:00Z'))).toBe('ACTIVE');
    expect(groupStatusOn(g, d('2026-08-15T00:00:00Z'))).toBe('CANCELLED');
    expect(groupStatusOn(g, d('2026-09-01T00:00:00Z'))).toBe('ACTIVE');
    expect(groupStatusOn(group(), d('2026-09-01T00:00:00Z'))).toBe('ACTIVE');
  });
});

describe('isGroupOpen', () => {
  it('is closed before it was created or started', () => {
    expect(isGroupOpen(group(), d('2026-04-30T00:00:00Z'))).toBe(false);
    expect(isGroupOpen(group({ startDate: d('2026-06-01T00:00:00Z') }), d('2026-05-20T00:00:00Z'))).toBe(false);
    expect(isGroupOpen(group({ startDate: d('2026-06-01T00:00:00Z') }), d('2026-06-02T00:00:00Z'))).toBe(true);
  });
  it('a group deleted later is still open before the deletion', () => {
    const g = group({ deletedAt: d('2026-09-10T00:00:00Z') });
    expect(isGroupOpen(g, d('2026-08-31T18:59:59Z'))).toBe(true);
    expect(isGroupOpen(g, d('2026-09-30T18:59:59Z'))).toBe(false);
  });
  it('is closed after its endDate and while not ACTIVE or FORMING', () => {
    expect(isGroupOpen(group({ endDate: d('2026-07-01T00:00:00Z') }), d('2026-07-02T00:00:00Z'))).toBe(false);
    const paused = group({ statusLog: [{ status: 'PAUSED', at: d('2026-07-01T00:00:00Z') }] });
    expect(isGroupOpen(paused, d('2026-07-02T00:00:00Z'))).toBe(false);
    const forming = group({ statusLog: [{ status: 'FORMING', at: d('2026-05-01T00:00:00Z') }] });
    expect(isGroupOpen(forming, d('2026-07-02T00:00:00Z'))).toBe(true);
  });
});

describe('roomExistsOn', () => {
  const room = (over: Partial<RoomFact> = {}): RoomFact => ({
    id: 'r1', name: '1-xona', branchId: 1, branchName: "Farg'ona",
    createdAt: d('2026-05-01T00:00:00Z'), deletedAt: null, status: 'ACTIVE',
    capacityNow: 16, capacityHistory: [], window: W, ...over,
  });
  it('existence by creation and deletion; the current month also needs ACTIVE', () => {
    expect(roomExistsOn(room(), d('2026-04-01T00:00:00Z'), false)).toBe(false);
    expect(roomExistsOn(room({ deletedAt: d('2026-07-01T00:00:00Z') }), d('2026-08-01T00:00:00Z'), false)).toBe(false);
    expect(roomExistsOn(room({ status: 'INACTIVE' }), d('2026-08-01T00:00:00Z'), false)).toBe(true);
    expect(roomExistsOn(room({ status: 'INACTIVE' }), d('2026-08-01T00:00:00Z'), true)).toBe(false);
  });
});

describe('enrolledOn', () => {
  it('counts enrollments ACTIVE at the instant (log, then own columns)', () => {
    const g = group({
      enrollments: [
        { createdAt: d('2026-05-01T00:00:00Z'), statusChangedAt: null, status: 'ACTIVE', log: [] },
        {
          createdAt: d('2026-05-01T00:00:00Z'), statusChangedAt: d('2026-08-10T00:00:00Z'), status: 'DROPPED',
          log: [
            { status: 'ACTIVE', transitionAt: d('2026-05-01T00:00:00Z') },
            { status: 'DROPPED', transitionAt: d('2026-08-10T00:00:00Z') },
          ],
        },
      ],
    });
    expect(enrolledOn(g, d('2026-08-01T00:00:00Z'))).toBe(2);
    expect(enrolledOn(g, d('2026-09-01T00:00:00Z'))).toBe(1);
  });
});
```

- [ ] **Step 3: Yiqilishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-points.spec.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 4: Implementatsiya** (`center-points.ts`)

```ts
import { enrollmentStatusOn } from '../../students/shared/enrollment-status-on';
import {
  DEFAULT_WORK_END,
  DEFAULT_WORK_START,
  type GroupFact,
  type Point,
  type RoomFact,
  type WorkWindow,
} from './center-activity.types';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The version of an SCD2 history valid at `at`; `fallback` when none covers it (un-backfilled data). */
export function pointOn<T>(history: Point<T>[], at: Date, fallback: T): T {
  const t = at.getTime();
  for (const p of history) {
    if (p.validFrom.getTime() <= t && (p.validTo === null || p.validTo.getTime() > t)) {
      return p.value;
    }
  }
  return fallback;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** A branch's working window; an unreadable or reversed one is replaced by the default. */
export function normalizeWorkWindow(
  start: string | null,
  end: string | null,
): WorkWindow {
  if (start && end && HHMM.test(start) && HHMM.test(end) && toMinutes(start) < toMinutes(end)) {
    return { start, end };
  }
  return { start: DEFAULT_WORK_START, end: DEFAULT_WORK_END };
}

/**
 * The half-hour slots (minutes / 30) a lesson covers, clipped to the room's
 * working window so occupancy cannot pass 100%. A missing or reversed time
 * covers nothing.
 */
export function lessonSlots(
  start: string | null,
  end: string | null,
  w: WorkWindow,
): number[] {
  if (!start || !end || !HHMM.test(start) || !HHMM.test(end)) return [];
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (to <= from) return [];
  const first = Math.max(Math.floor(from / 30), Math.ceil(toMinutes(w.start) / 30));
  const last = Math.min(Math.ceil(to / 30), Math.floor(toMinutes(w.end) / 30));
  const out: number[] = [];
  for (let s = first; s < last; s++) out.push(s);
  return out;
}

/** The group's status at `at` from `StatusHistory`; ACTIVE from creation when it has no rows yet. */
export function groupStatusOn(g: GroupFact, at: Date): string {
  const t = at.getTime();
  let status: string | null = null;
  for (const row of g.statusLog) {
    if (row.at.getTime() <= t) status = row.status;
    else break;
  }
  return status ?? 'ACTIVE';
}

/** Does the group hold its room and seats at `at`? Closed, deleted, paused and not-yet-started groups do not. */
export function isGroupOpen(g: GroupFact, at: Date): boolean {
  const t = at.getTime();
  const opened = Math.max(g.createdAt.getTime(), g.startDate?.getTime() ?? 0);
  if (opened > t) return false;
  if (g.endDate && t > g.endDate.getTime()) return false;
  if (g.deletedAt && t >= g.deletedAt.getTime()) return false;
  const s = groupStatusOn(g, at);
  return s === 'ACTIVE' || s === 'FORMING';
}

/**
 * Is the room part of the centre at `at`? A past month has no status history
 * for rooms, so only creation and deletion count; the current month also needs
 * ACTIVE, so a room under repair is not offered for a new group.
 */
export function roomExistsOn(r: RoomFact, at: Date, current: boolean): boolean {
  const t = at.getTime();
  if (r.createdAt.getTime() > t) return false;
  if (r.deletedAt && t >= r.deletedAt.getTime()) return false;
  return current ? r.status === 'ACTIVE' : true;
}

/** Enrollments of the group that are ACTIVE at `at` (the activity report's own reader, ADR-0035). */
export function enrolledOn(g: GroupFact, at: Date): number {
  return g.enrollments.filter(
    (e) =>
      enrollmentStatusOn(e.log.length > 0 ? e.log : undefined, at, {
        createdAt: e.createdAt,
        statusChangedAt: e.statusChangedAt,
        status: e.status,
      }) === 'ACTIVE',
  ).length;
}
```

- [ ] **Step 5: O'tishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-points.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd server && npx prettier --write src/reports/center-activity && npx eslint src/reports/center-activity --quiet && cd .. && git add server/src/reports/center-activity && git commit -m "feat(center-activity): fact types and point-in-time helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `evaluateCenter` — bir `asOf` holati

**Files:**
- Create: `server/src/reports/center-activity/center-metrics.ts`
- Create: `server/src/reports/center-activity/center-metrics.spec.ts`

**Interfaces:**
- Consumes: Task 2 turlari va yordamchilari.
- Produces:

```ts
export interface RoomResult {
  id: string; name: string; branchId: number; branchName: string;
  capacity: number | null; groupCount: number;
  lessonHours: number;   // haftasiga, 30 daqiqalik to'plam
  workHours: number;     // haftasiga (kunlik × 6)
  occupancyPct: number | null; // 1 xona raqami, workHours 0 bo'lsa null
  window: WorkWindow;
  slots: Record<WeekDay, Set<number>>;
}
export interface GroupResult {
  id: string; name: string; courseName: string; branchId: number; roomId: string;
  days: WeekDay[]; start: string | null; end: string | null;
  enrolled: number; capacity: number; free: number; overfull: boolean;
  monthlyPrice: number | null;
}
export interface CenterEval {
  rooms: RoomResult[];
  groups: GroupResult[];          // xonasi va sig'imi bor ochiq guruhlar
  unplaced: number;               // xonasi yoki sig'imi yo'q ochiq guruhlar
  deletedLater: number;           // shu kunda ochiq, hozir o'chirilgan guruhlar
}
export function evaluateCenter(facts: CenterFacts, at: Date, current: boolean): CenterEval
```

- [ ] **Step 1: Yiqiladigan test yoz** (`center-metrics.spec.ts`)

```ts
import { evaluateCenter } from './center-metrics';
import type { CenterFacts, GroupFact, RoomFact } from './center-activity.types';

const d = (s: string) => new Date(s);
const W = { start: '08:00', end: '22:30' };
const AT = d('2026-09-30T18:59:59.999Z');

const room = (id: string, over: Partial<RoomFact> = {}): RoomFact => ({
  id, name: `${id}-xona`, branchId: 1, branchName: "Farg'ona",
  createdAt: d('2026-05-01T00:00:00Z'), deletedAt: null, status: 'ACTIVE',
  capacityNow: 16, capacityHistory: [], window: W, ...over,
});

const enr = (n: number) =>
  Array.from({ length: n }, () => ({
    createdAt: d('2026-05-01T00:00:00Z'), statusChangedAt: null, status: 'ACTIVE', log: [],
  }));

const group = (id: string, roomId: string | null, over: Partial<GroupFact> = {}): GroupFact => ({
  id, name: id, roomId, branchId: 1, createdAt: d('2026-05-01T00:00:00Z'),
  startDate: null, endDate: null, deletedAt: null,
  scheduleNow: { exactDays: ['monday', 'wednesday'], start: '10:00', end: '11:30', courseId: 'c1' },
  scheduleHistory: [], statusLog: [], enrollments: enr(8), ...over,
});

const facts = (rooms: RoomFact[], groups: GroupFact[]): CenterFacts => ({
  rooms, groups,
  courses: new Map([
    ['c1', { id: 'c1', name: 'Standart', monthly: true, priceNow: 450_000, priceHistory: [] }],
  ]),
});

describe('evaluateCenter', () => {
  it('counts distinct half-hours: two groups at the same time are one lesson', () => {
    const ev = evaluateCenter(
      facts([room('r1')], [group('g1', 'r1'), group('g2', 'r1')]),
      AT, false,
    );
    const [r] = ev.rooms;
    // 2 days x 3 half-hours x 0.5 h = 3 h
    expect(r.lessonHours).toBe(3);
    expect(r.groupCount).toBe(2);
    // working hours: 14.5 h x 6 days = 87
    expect(r.workHours).toBe(87);
    expect(r.occupancyPct).toBeCloseTo(3.4, 1);
  });

  it('seats are per group; an overfull group counts as full', () => {
    const ev = evaluateCenter(
      facts([room('r1', { capacityNow: 10 })], [
        group('g1', 'r1', { enrollments: enr(4) }),
        group('g2', 'r1', { enrollments: enr(12) }),
      ]),
      AT, false,
    );
    const [a, b] = ev.groups;
    expect([a.enrolled, a.capacity, a.free, a.overfull]).toEqual([4, 10, 6, false]);
    expect([b.enrolled, b.capacity, b.free, b.overfull]).toEqual([12, 10, 0, true]);
    expect(a.monthlyPrice).toBe(450_000);
  });

  it('a group deleted after `at` is still counted, and noted', () => {
    const ev = evaluateCenter(
      facts([room('r1')], [group('g1', 'r1', { deletedAt: d('2026-10-05T00:00:00Z') })]),
      AT, false,
    );
    expect(ev.groups).toHaveLength(1);
    expect(ev.deletedLater).toBe(1);
  });

  it('a group without a room or a capacity is unplaced, not a seat', () => {
    const ev = evaluateCenter(
      facts([room('r1', { capacityNow: null })], [group('g1', null), group('g2', 'r1')]),
      AT, false,
    );
    expect(ev.groups).toHaveLength(0);
    expect(ev.unplaced).toBe(2);
    // g2 still takes the room's hours
    expect(ev.rooms[0].lessonHours).toBe(3);
  });

  it('reads the capacity and the schedule valid at `at`', () => {
    const r = room('r1', {
      capacityNow: 20,
      capacityHistory: [{ validFrom: d('2026-05-01T00:00:00Z'), validTo: d('2026-08-01T00:00:00Z'), value: 12 }],
    });
    const g = group('g1', 'r1', {
      scheduleHistory: [{
        validFrom: d('2026-05-01T00:00:00Z'), validTo: d('2026-08-01T00:00:00Z'),
        value: { exactDays: ['friday'], start: '15:00', end: '16:00', courseId: 'c1' },
      }],
    });
    const early = evaluateCenter(facts([r], [g]), d('2026-07-15T00:00:00Z'), false);
    expect(early.groups[0].capacity).toBe(12);
    expect(early.groups[0].days).toEqual(['friday']);
    expect(early.rooms[0].lessonHours).toBe(1);
    const late = evaluateCenter(facts([r], [g]), AT, false);
    expect(late.groups[0].capacity).toBe(20);
    expect(late.groups[0].days).toEqual(['monday', 'wednesday']);
  });

  it('only monthly courses carry a price', () => {
    const f = facts([room('r1')], [group('g1', 'r1')]);
    f.courses.set('c1', { id: 'c1', name: 'Paket', monthly: false, priceNow: 900_000, priceHistory: [] });
    expect(evaluateCenter(f, AT, false).groups[0].monthlyPrice).toBeNull();
  });

  it('a room that does not exist yet is left out; Sunday lessons are ignored', () => {
    const f = facts(
      [room('r1', { createdAt: d('2026-12-01T00:00:00Z') }), room('r2')],
      [group('g1', 'r2', { scheduleNow: { exactDays: ['sunday', 'monday'], start: '10:00', end: '11:00', courseId: 'c1' } })],
    );
    const ev = evaluateCenter(f, AT, false);
    expect(ev.rooms.map((r) => r.id)).toEqual(['r2']);
    expect(ev.rooms[0].lessonHours).toBe(1);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-metrics.spec.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Implementatsiya** (`center-metrics.ts`)

```ts
import {
  WEEK_DAYS,
  type CenterFacts,
  type GroupFact,
  type WeekDay,
  type WorkWindow,
} from './center-activity.types';
import {
  enrolledOn,
  isGroupOpen,
  lessonSlots,
  pointOn,
  roomExistsOn,
  toMinutes,
} from './center-points';

export interface RoomResult {
  id: string;
  name: string;
  branchId: number;
  branchName: string;
  capacity: number | null;
  groupCount: number;
  /** Distinct lesson hours in a typical week (half-hour slots, clipped to the working window). */
  lessonHours: number;
  /** Working hours in a typical week: the day's window × 6 (du–sha). */
  workHours: number;
  occupancyPct: number | null;
  window: WorkWindow;
  slots: Record<WeekDay, Set<number>>;
}

export interface GroupResult {
  id: string;
  name: string;
  courseName: string;
  branchId: number;
  roomId: string;
  days: WeekDay[];
  start: string | null;
  end: string | null;
  enrolled: number;
  capacity: number;
  free: number;
  overfull: boolean;
  monthlyPrice: number | null;
}

export interface CenterEval {
  rooms: RoomResult[];
  groups: GroupResult[];
  /** Open groups with no room, or a room with no capacity: they hold hours but no counted seat. */
  unplaced: number;
  /** Open at `at` and deleted since: the page says so under the figures. */
  deletedLater: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const emptySlots = (): Record<WeekDay, Set<number>> => ({
  monday: new Set(), tuesday: new Set(), wednesday: new Set(),
  thursday: new Set(), friday: new Set(), saturday: new Set(),
});
const isWeekDay = (d: string): d is WeekDay =>
  (WEEK_DAYS as readonly string[]).includes(d);

/**
 * The centre at one instant. A pure function of the facts: every block of the
 * page is read off this one value, so the cards add up to the tables.
 * `current` is true for the month still running (rooms must be ACTIVE then).
 */
export function evaluateCenter(
  facts: CenterFacts,
  at: Date,
  current: boolean,
): CenterEval {
  const rooms = facts.rooms.filter((r) => roomExistsOn(r, at, current));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const open = facts.groups.filter((g) => isGroupOpen(g, at));

  const slotsByRoom = new Map<string, Record<WeekDay, Set<number>>>();
  const countByRoom = new Map<string, number>();
  const groups: GroupResult[] = [];
  let unplaced = 0;
  let deletedLater = 0;

  for (const g of open) {
    if (g.deletedAt) deletedLater++;
    const room = g.roomId ? roomById.get(g.roomId) : undefined;
    const sched = pointOn(g.scheduleHistory, at, g.scheduleNow);
    const days = sched.exactDays.filter(isWeekDay);
    if (room) {
      const slots = slotsByRoom.get(room.id) ?? emptySlots();
      const covered = lessonSlots(sched.start, sched.end, room.window);
      for (const day of days) for (const s of covered) slots[day].add(s);
      slotsByRoom.set(room.id, slots);
      countByRoom.set(room.id, (countByRoom.get(room.id) ?? 0) + 1);
    }
    const capacity = room ? pointOn(room.capacityHistory, at, room.capacityNow) : null;
    if (!room || !capacity || capacity <= 0) {
      unplaced++;
      continue;
    }
    const enrolled = enrolledOn(g, at);
    const course = sched.courseId ? facts.courses.get(sched.courseId) : undefined;
    const price = course?.monthly ? pointOn(course.priceHistory, at, course.priceNow) : null;
    groups.push({
      id: g.id, name: g.name, courseName: course?.name ?? '', branchId: g.branchId,
      roomId: room.id, days, start: sched.start, end: sched.end,
      enrolled, capacity, free: Math.max(0, capacity - enrolled),
      overfull: enrolled > capacity, monthlyPrice: price,
    });
  }

  const roomResults: RoomResult[] = rooms.map((r) => {
    const slots = slotsByRoom.get(r.id) ?? emptySlots();
    let half = 0;
    for (const day of WEEK_DAYS) half += slots[day].size;
    const lessonHours = half / 2;
    const workHours = ((toMinutes(r.window.end) - toMinutes(r.window.start)) / 60) * WEEK_DAYS.length;
    return {
      id: r.id, name: r.name, branchId: r.branchId, branchName: r.branchName,
      capacity: pointOn(r.capacityHistory, at, r.capacityNow),
      groupCount: countByRoom.get(r.id) ?? 0,
      lessonHours, workHours,
      occupancyPct: workHours > 0 ? round1((lessonHours / workHours) * 100) : null,
      window: r.window, slots,
    };
  });

  return { rooms: roomResults, groups, unplaced, deletedLater };
}

export type { GroupFact };
```

- [ ] **Step 4: O'tishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-metrics.spec.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/reports/center-activity && npx eslint src/reports/center-activity --quiet && cd .. && git add server/src/reports/center-activity && git commit -m "feat(center-activity): evaluate the centre at one instant

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Issiqlik matritsasi va ko'rsatma

**Files:**
- Create: `server/src/reports/center-activity/center-heat.ts`
- Create: `server/src/reports/center-activity/heat-insight.ts`
- Create: `server/src/reports/center-activity/center-heat.spec.ts`

**Interfaces:**
- Consumes: `RoomResult` (Task 3), `WEEK_DAYS`, `WeekDay`.
- Produces:

```ts
export type HeatTone = 'green' | 'light' | 'yellow' | 'red';
export interface HeatCell { free: number; tone: HeatTone }
export interface Heat { rooms: number; days: WeekDay[]; hours: number[]; cells: HeatCell[][] /* [dayIndex][hourIndex] */ }
export function heatTone(free: number, rooms: number): HeatTone
export function buildHeat(rooms: RoomResult[]): Heat   // bitta filial xonalari; xona yo'q → hours: []
// heat-insight.ts
export interface InsightSlot { days: WeekDay[]; fromHour: number; toHour: number; /* exclusive */ freeMin: number; freeMax: number }
export interface HeatInsight { quiet: InsightSlot[]; busy: InsightSlot | null }
export function heatInsight(heat: Heat): HeatInsight
```

- [ ] **Step 1: Yiqiladigan test yoz** (`center-heat.spec.ts`)

```ts
import { buildHeat, heatTone } from './center-heat';
import { heatInsight } from './heat-insight';
import type { RoomResult } from './center-metrics';
import { WEEK_DAYS, type WeekDay } from './center-activity.types';

const W = { start: '08:00', end: '22:30' };
const slots = (m: Partial<Record<WeekDay, number[]>> = {}) => {
  const out = {} as RoomResult['slots'];
  for (const d of WEEK_DAYS) out[d] = new Set(m[d] ?? []);
  return out;
};
const room = (id: string, m: Partial<Record<WeekDay, number[]>> = {}): RoomResult => ({
  id, name: id, branchId: 1, branchName: 'F', capacity: 16, groupCount: 1,
  lessonHours: 0, workHours: 87, occupancyPct: 0, window: W, slots: slots(m),
});

describe('heatTone', () => {
  it('matches the mock-up for 9 rooms: 7–9 / 4–6 / 2–3 / 0–1 free', () => {
    expect([9, 7].map((f) => heatTone(f, 9))).toEqual(['green', 'green']);
    expect([6, 4].map((f) => heatTone(f, 9))).toEqual(['light', 'light']);
    expect([3, 2].map((f) => heatTone(f, 9))).toEqual(['yellow', 'yellow']);
    expect([1, 0].map((f) => heatTone(f, 9))).toEqual(['red', 'red']);
  });
});

describe('buildHeat', () => {
  it('lists whole hours inside the window (08..21 for 08:00–22:30)', () => {
    const h = buildHeat([room('a')]);
    expect(h.days).toEqual([...WEEK_DAYS]);
    expect(h.hours[0]).toBe(8);
    expect(h.hours[h.hours.length - 1]).toBe(21);
    expect(h.rooms).toBe(1);
  });

  it('a room is busy in an hour when any half of it holds a lesson', () => {
    // Monday 10:30–11:00 = slot 21 → busy for hour 10 only
    const h = buildHeat([room('a', { monday: [21] }), room('b')]);
    const at = (day: WeekDay, hour: number) =>
      h.cells[WEEK_DAYS.indexOf(day)][h.hours.indexOf(hour)];
    expect(at('monday', 10).free).toBe(1);
    expect(at('monday', 11).free).toBe(2);
    expect(at('tuesday', 10).free).toBe(2);
  });

  it('no rooms gives an empty matrix', () => {
    expect(buildHeat([]).hours).toEqual([]);
  });
});

describe('heatInsight', () => {
  it('finds the quiet evening of the days that share it and the busiest afternoon', () => {
    // 9 rooms; Mon/Wed/Fri busy 15:00–17:00 with 8 rooms (1 free); Tue/Thu/Sat free
    const rooms = Array.from({ length: 9 }, (_, i) =>
      room(`r${i}`, i < 8
        ? { monday: [30, 31, 32, 33], wednesday: [30, 31, 32, 33], friday: [30, 31, 32, 33] }
        : {}),
    );
    const ins = heatInsight(buildHeat(rooms));
    expect(ins.busy).toEqual({
      days: ['monday', 'wednesday', 'friday'],
      fromHour: 15,
      toHour: 17,
      freeMin: 1,
      freeMax: 1,
    });
    expect(ins.quiet[0].days).toContain('tuesday');
    expect(ins.quiet.length).toBeLessThanOrEqual(2);
  });

  it('an empty matrix has nothing to say', () => {
    expect(heatInsight(buildHeat([]))).toEqual({ quiet: [], busy: null });
  });
});
```

(15:00–17:00 = slots 30–33; Pay-Ju etc. Bu testda `quiet`ning aniq tarkibi ataylab bog'lanmagan: qoida «kunlari eng ko'p va eng uzun yashil oraliq», aniq qiymat §Step 3 kodida.)

- [ ] **Step 2: Yiqilishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-heat.spec.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: `center-heat.ts`**

```ts
import { WEEK_DAYS, type WeekDay } from './center-activity.types';
import type { RoomResult } from './center-metrics';
import { toMinutes } from './center-points';

export type HeatTone = 'green' | 'light' | 'yellow' | 'red';
export interface HeatCell {
  free: number;
  tone: HeatTone;
}
export interface Heat {
  rooms: number;
  days: WeekDay[];
  hours: number[];
  /** [dayIndex][hourIndex] */
  cells: HeatCell[][];
}

/** Colour by the share of rooms that are free (mock-up: 7–9 / 4–6 / 2–3 / 0–1 of 9). */
export function heatTone(free: number, rooms: number): HeatTone {
  const share = rooms > 0 ? free / rooms : 0;
  if (share >= 0.75) return 'green';
  if (share >= 0.4) return 'light';
  if (share >= 0.15) return 'yellow';
  return 'red';
}

/**
 * Free rooms per weekday and whole hour for ONE branch's rooms (they share a
 * working window). A room is busy in an hour when either of its two half-hour
 * slots holds a lesson. Hours are the whole ones inside the window, so a
 * 22:00–22:30 stub is not a column.
 */
export function buildHeat(rooms: RoomResult[]): Heat {
  if (rooms.length === 0) return { rooms: 0, days: [...WEEK_DAYS], hours: [], cells: [] };
  const w = rooms[0].window;
  const hours: number[] = [];
  for (let h = Math.ceil(toMinutes(w.start) / 60); (h + 1) * 60 <= toMinutes(w.end); h++) {
    hours.push(h);
  }
  const cells = WEEK_DAYS.map((day) =>
    hours.map((h) => {
      const busy = rooms.filter(
        (r) => r.slots[day].has(h * 2) || r.slots[day].has(h * 2 + 1),
      ).length;
      const free = rooms.length - busy;
      return { free, tone: heatTone(free, rooms.length) };
    }),
  );
  return { rooms: rooms.length, days: [...WEEK_DAYS], hours, cells };
}
```

- [ ] **Step 4: `heat-insight.ts`**

```ts
import { WEEK_DAYS, type WeekDay } from './center-activity.types';
import type { Heat, HeatTone } from './center-heat';

export interface InsightSlot {
  days: WeekDay[];
  fromHour: number;
  /** Exclusive: 17 means up to 17:00. */
  toHour: number;
  freeMin: number;
  freeMax: number;
}
export interface HeatInsight {
  quiet: InsightSlot[];
  busy: InsightSlot | null;
}

/** Maximal runs of consecutive hours with `tone`, one list per weekday, merged across days that share the same run. */
function slotsOfTone(heat: Heat, tone: HeatTone): InsightSlot[] {
  const merged = new Map<string, InsightSlot>();
  heat.days.forEach((day, di) => {
    let hi = 0;
    while (hi < heat.hours.length) {
      if (heat.cells[di][hi].tone !== tone) {
        hi++;
        continue;
      }
      let end = hi;
      let min = Infinity;
      let max = -Infinity;
      while (end < heat.hours.length && heat.cells[di][end].tone === tone) {
        min = Math.min(min, heat.cells[di][end].free);
        max = Math.max(max, heat.cells[di][end].free);
        end++;
      }
      const key = `${heat.hours[hi]}-${heat.hours[end - 1] + 1}`;
      const found = merged.get(key);
      if (found) {
        found.days.push(day);
        found.freeMin = Math.min(found.freeMin, min);
        found.freeMax = Math.max(found.freeMax, max);
      } else {
        merged.set(key, {
          days: [day],
          fromHour: heat.hours[hi],
          toHour: heat.hours[end - 1] + 1,
          freeMin: min,
          freeMax: max,
        });
      }
      hi = end;
    }
  });
  const order = (d: WeekDay) => WEEK_DAYS.indexOf(d);
  for (const s of merged.values()) s.days.sort((a, b) => order(a) - order(b));
  return [...merged.values()];
}

const weight = (s: InsightSlot) => s.days.length * (s.toHour - s.fromHour);

/**
 * The quietest and the busiest times, for the sentence under the table: up to
 * two green stretches (widest across days and hours first, then the freest) and
 * the one red stretch that is widest, then the emptiest.
 */
export function heatInsight(heat: Heat): HeatInsight {
  if (heat.hours.length === 0) return { quiet: [], busy: null };
  const quiet = slotsOfTone(heat, 'green')
    .sort((a, b) => weight(b) - weight(a) || b.freeMin - a.freeMin)
    .slice(0, 2);
  const busy =
    slotsOfTone(heat, 'red').sort(
      (a, b) => weight(b) - weight(a) || a.freeMax - b.freeMax,
    )[0] ?? null;
  return { quiet, busy };
}
```

- [ ] **Step 5: O'tishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-heat.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd server && npx prettier --write src/reports/center-activity && npx eslint src/reports/center-activity --quiet && cd .. && git add server/src/reports/center-activity && git commit -m "feat(center-activity): free-rooms heat matrix and its insight

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Javobni yig'ish (`buildOverview`) va parite

**Files:**
- Modify: `server/src/reports/center-activity/center-activity.types.ts` (javob turlarini qo'sh)
- Create: `server/src/reports/center-activity/center-overview.ts`
- Create: `server/src/reports/center-activity/center-overview.spec.ts`

**Interfaces:**
- Consumes: `CenterFacts`, `evaluateCenter` (Task 3), `buildHeat`, `heatInsight` (Task 4), `asOfForMonth`, `monthsUpTo` (Task 1).
- Produces (`center-activity.types.ts` ga qo'shiladi):

```ts
import type { Heat } from './center-heat';
import type { HeatInsight } from './heat-insight';

export interface OverviewBranch { id: number; name: string; rooms: number }
export interface RoomRow { id: string; name: string; branchId: number; branchName: string; capacity: number | null; groupCount: number; lessonHours: number; occupancyPct: number | null }
export interface GroupRow { id: string; name: string; courseName: string; branchId: number; days: WeekDay[]; start: string | null; end: string | null; enrolled: number; capacity: number; free: number; overfull: boolean }
export interface CenterOverview {
  month: string;
  asOf: string;            // ISO
  current: boolean;
  branches: OverviewBranch[];   // asOf da xonasi bor filiallar (nom bo'yicha)
  cards: {
    occupancyPct: number | null;
    lessonHoursPerWeek: number;
    workWindow: { start: string; end: string } | null; // filiallar oynasi har xil bo'lsa null
    seats: { pct: number | null; enrolled: number; capacity: number };
    free: { seats: number; revenue: number };
  };
  heat: { branchId: number; heat: Heat; insight: HeatInsight } | null;
  rooms: RoomRow[];
  groups: GroupRow[];       // faqat free > 0, free kamayish tartibida
  months: { month: string; pct: number | null }[];
  notes: { deletedLater: number; unplaced: number };
}
```
- Produces (`center-overview.ts`):
  - `export function buildOverview(facts: CenterFacts, month: string, now: Date, filialId?: number): CenterOverview` — `filialId` qamrovdagi filiallar ro'yxatida bo'lmasa `RangeError('filial')` tashlaydi (service uni 400 ga aylantiradi).
  - `export function occupancyOf(ev: CenterEval): number | null`

- [ ] **Step 1: Yiqiladigan test yoz** (`center-overview.spec.ts`)

```ts
import { buildOverview } from './center-overview';
import type { CenterFacts, GroupFact, RoomFact } from './center-activity.types';

const d = (s: string) => new Date(s);
const W = { start: '08:00', end: '22:30' };
const NOW = d('2026-10-17T05:00:00Z');

const room = (id: string, branchId = 1, over: Partial<RoomFact> = {}): RoomFact => ({
  id, name: `${id}-xona`, branchId, branchName: branchId === 1 ? "Farg'ona" : 'Namangan',
  createdAt: d('2026-05-01T00:00:00Z'), deletedAt: null, status: 'ACTIVE',
  capacityNow: 16, capacityHistory: [], window: W, ...over,
});
const enr = (n: number) =>
  Array.from({ length: n }, () => ({ createdAt: d('2026-05-01T00:00:00Z'), statusChangedAt: null, status: 'ACTIVE', log: [] }));
const group = (id: string, roomId: string, over: Partial<GroupFact> = {}): GroupFact => ({
  id, name: id, roomId, branchId: 1, createdAt: d('2026-05-01T00:00:00Z'),
  startDate: null, endDate: null, deletedAt: null,
  scheduleNow: { exactDays: ['monday', 'wednesday'], start: '10:00', end: '12:00', courseId: 'c1' },
  scheduleHistory: [], statusLog: [], enrollments: enr(8), ...over,
});
const facts = (rooms: RoomFact[], groups: GroupFact[]): CenterFacts => ({
  rooms, groups,
  courses: new Map([['c1', { id: 'c1', name: 'Standart', monthly: true, priceNow: 450_000, priceHistory: [] }]]),
});

describe('buildOverview', () => {
  const f = facts(
    [room('r1'), room('r2'), room('r3', 2)],
    [
      group('g1', 'r1'),
      group('g2', 'r2', { enrollments: enr(16) }),
      group('g3', 'r3', { branchId: 2, deletedAt: d('2026-10-01T00:00:00Z') }),
    ],
  );

  it('the cards add up to the tables (parity)', () => {
    const o = buildOverview(f, '2026-09', NOW);
    const hours = o.rooms.reduce((s, r) => s + r.lessonHours, 0);
    expect(o.cards.lessonHoursPerWeek).toBeCloseTo(hours, 5);
    const filled = o.groups.reduce((s, g) => s + Math.min(g.enrolled, g.capacity), 0);
    expect(o.cards.seats.enrolled).toBe(filled);
    expect(o.cards.free.seats).toBe(o.cards.seats.capacity - filled);
  });

  it('the last month bar equals the card (same instant, same function)', () => {
    const o = buildOverview(f, '2026-09', NOW);
    expect(o.months[o.months.length - 1]).toEqual({ month: '2026-09', pct: o.cards.occupancyPct });
    expect(o.months.map((m) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  });

  it('lists only groups with free seats, emptiest first, and notes the deleted one', () => {
    const o = buildOverview(f, '2026-09', NOW);
    expect(o.groups.map((g) => g.id)).toEqual(['g1', 'g3']); // g2 is full
    expect(o.groups[0].free).toBeGreaterThanOrEqual(o.groups[1].free);
    expect(o.notes.deletedLater).toBe(1);
  });

  it('revenue = free seats × monthly price', () => {
    const o = buildOverview(f, '2026-09', NOW);
    const expected = o.groups.reduce((s, g) => s + g.free, 0) * 450_000;
    expect(o.cards.free.revenue).toBe(expected);
  });

  it('draws the heat for the first branch by name, or the requested one', () => {
    expect(buildOverview(f, '2026-09', NOW).heat?.branchId).toBe(1);
    expect(buildOverview(f, '2026-09', NOW, 2).heat?.branchId).toBe(2);
    expect(buildOverview(f, '2026-09', NOW).branches).toEqual([
      { id: 1, name: "Farg'ona", rooms: 2 },
      { id: 2, name: 'Namangan', rooms: 1 },
    ]);
  });

  it('refuses a branch that is not in the answer', () => {
    expect(() => buildOverview(f, '2026-09', NOW, 99)).toThrow(RangeError);
  });

  it('no rooms means nulls, not zeros', () => {
    const o = buildOverview(facts([], []), '2026-09', NOW);
    expect(o.cards.occupancyPct).toBeNull();
    expect(o.cards.seats.pct).toBeNull();
    expect(o.heat).toBeNull();
  });

  it('the work window is null when branches differ', () => {
    const o = buildOverview(
      facts([room('r1'), room('r3', 2, { window: { start: '09:00', end: '21:00' } })], []),
      '2026-09', NOW,
    );
    expect(o.cards.workWindow).toBeNull();
    expect(buildOverview(facts([room('r1')], []), '2026-09', NOW).cards.workWindow).toEqual(W);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-overview.spec.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Javob turlarini qo'sh** — `center-activity.types.ts` oxiriga yuqoridagi `OverviewBranch`, `RoomRow`, `GroupRow`, `CenterOverview` bloklarini (va `Heat`, `HeatInsight` importini) ko'chir.

- [ ] **Step 4: Implementatsiya** (`center-overview.ts`)

```ts
import { tashkentMonthKey } from '../../common/date/tashkent';
import {
  type CenterFacts,
  type CenterOverview,
  type GroupRow,
  type OverviewBranch,
  type RoomRow,
} from './center-activity.types';
import { asOfForMonth, monthsUpTo } from './center-activity-period';
import { buildHeat } from './center-heat';
import { evaluateCenter, type CenterEval } from './center-metrics';
import { heatInsight } from './heat-insight';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Σ lesson hours / Σ working hours of the evaluated rooms, as a percent with one decimal; null with no working hours. */
export function occupancyOf(ev: CenterEval): number | null {
  const work = ev.rooms.reduce((s, r) => s + r.workHours, 0);
  if (work <= 0) return null;
  return round1((ev.rooms.reduce((s, r) => s + r.lessonHours, 0) / work) * 100);
}

/**
 * The whole answer of the page from one fact set. The cards, both tables and
 * every month bar read the same `evaluateCenter` results, so they add up by
 * construction (pinned by the parity tests).
 */
export function buildOverview(
  facts: CenterFacts,
  month: string,
  now: Date,
  filialId?: number,
): CenterOverview {
  const at = asOfForMonth(month, now);
  const current = month === tashkentMonthKey(now);
  const ev = evaluateCenter(facts, at, current);

  const byBranch = new Map<number, OverviewBranch>();
  for (const r of ev.rooms) {
    const b = byBranch.get(r.branchId) ?? { id: r.branchId, name: r.branchName, rooms: 0 };
    b.rooms++;
    byBranch.set(r.branchId, b);
  }
  const branches = [...byBranch.values()].sort((a, b) => a.name.localeCompare(b.name, 'uz'));
  if (filialId !== undefined && !byBranch.has(filialId)) throw new RangeError('filial');
  const heatBranch = filialId ?? branches[0]?.id;

  const hours = ev.rooms.reduce((s, r) => s + r.lessonHours, 0);
  const windows = new Set(ev.rooms.map((r) => `${r.window.start}-${r.window.end}`));
  const capacity = ev.groups.reduce((s, g) => s + g.capacity, 0);
  const filled = ev.groups.reduce((s, g) => s + Math.min(g.enrolled, g.capacity), 0);

  const rooms: RoomRow[] = ev.rooms.map((r) => ({
    id: r.id, name: r.name, branchId: r.branchId, branchName: r.branchName,
    capacity: r.capacity, groupCount: r.groupCount,
    lessonHours: r.lessonHours, occupancyPct: r.occupancyPct,
  }));
  const free = ev.groups.filter((g) => g.free > 0);
  const groupRows: GroupRow[] = [...free]
    .sort((a, b) => b.free - a.free || a.name.localeCompare(b.name, 'uz'))
    .map((g) => ({
      id: g.id, name: g.name, courseName: g.courseName, branchId: g.branchId,
      days: g.days, start: g.start, end: g.end,
      enrolled: g.enrolled, capacity: g.capacity, free: g.free, overfull: g.overfull,
    }));

  const heat =
    heatBranch === undefined
      ? null
      : (() => {
          const h = buildHeat(ev.rooms.filter((r) => r.branchId === heatBranch));
          return { branchId: heatBranch, heat: h, insight: heatInsight(h) };
        })();

  return {
    month,
    asOf: at.toISOString(),
    current,
    branches,
    cards: {
      occupancyPct: occupancyOf(ev),
      lessonHoursPerWeek: round1(hours),
      workWindow: windows.size === 1 ? ev.rooms[0].window : null,
      seats: {
        pct: capacity > 0 ? round1((filled / capacity) * 100) : null,
        enrolled: filled,
        capacity,
      },
      free: {
        seats: capacity - filled,
        revenue: free.reduce((s, g) => s + g.free * (g.monthlyPrice ?? 0), 0),
      },
    },
    heat,
    rooms,
    groups: groupRows,
    months: monthsUpTo(month).map((m) => ({
      month: m,
      pct: occupancyOf(
        m === month ? ev : evaluateCenter(facts, asOfForMonth(m, now), m === tashkentMonthKey(now)),
      ),
    })),
    notes: { deletedLater: ev.deletedLater, unplaced: ev.unplaced },
  };
}
```

- [ ] **Step 5: O'tishini ko'r**

Run: `cd server && npx jest src/reports/center-activity`
Expected: PASS (hamma center-activity spec'lari).

- [ ] **Step 6: Commit**

```bash
cd server && npx prettier --write src/reports/center-activity && npx eslint src/reports/center-activity --quiet && cd .. && git add server/src/reports/center-activity && git commit -m "feat(center-activity): assemble the overview from one evaluation

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ma'lumot yuklovchi (`CenterFactsLoader`)

**Files:**
- Create: `server/src/reports/center-activity/center-facts.loader.ts`
- Create: `server/src/reports/center-activity/center-facts.loader.spec.ts`

**Interfaces:**
- Consumes: `CenterFacts` va tur (Task 2), `normalizeWorkWindow` (Task 2), `branchIdWhere`, `ReportBranchIds`, `supplyOpeningRow`, `supplyClosingRow`.
- Produces: `@Injectable() export class CenterFactsLoader { constructor(prisma: PrismaService); load(companyId: number, scope: ReportBranchIds, firstAt: Date, lastAt: Date): Promise<CenterFacts> }`.
  - `firstAt` = eng erta oyning boshlanishi (`tashkentMonthRangeUtc(monthsUpTo(oy)[0]).gte`), `lastAt` = `asOfForMonth(oy, now)`.

- [ ] **Step 1: Guruh o'chirilganda yozilishlar nima bo'lishini o'qi (faqat o'qish, o'zgarish yo'q)**

Run:
```bash
cd server && sed -n 540,640p src/groups/groups-write.service.ts && grep -n "cascadeGroupDeletion" -A40 src/common/status/status-cascade.service.ts | head -90
```
Expected: o'chirilgan guruhning faol/muzlatilgan yozilishlari `DROPPED` ga yopiladi va holat jurnaliga `group.deletedAt` da qator yoziladi (spec §3). Natijani (yozilishlarga `deletedAt` qo'yilishi yoki yo'qligini) yuklovchining hujjat izohiga bir gap bilan yoz (Step 4): yuklovchi har ikki holatda ham `Enrollment.deletedAt` bo'yicha filtrlamaydi, shuning uchun xulosa mantiqqa ta'sir qilmaydi.

- [ ] **Step 2: `StatusHistory`ning guruh uchun `toStatus` qiymatlarini tasdiqla**

Run: `cd server && grep -n "entityType: 'Group'" -B3 -A6 src/groups/groups-status.service.ts | head -30`
Expected: `toStatus: dto.status` — ya'ni `GroupStatus` nomlari (`ACTIVE`, `PAUSED`, …). Boshqacha bo'lsa `groupStatusOn` mosla.

- [ ] **Step 3: Yiqiladigan test yoz** (`center-facts.loader.spec.ts`)

```ts
import { CenterFactsLoader } from './center-facts.loader';

const d = (s: string) => new Date(s);

function prismaMock() {
  return {
    room: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'r1', name: '1-xona', capacity: 16, status: 'ACTIVE', branchId: 1,
          createdAt: d('2026-05-01T00:00:00Z'), deletedAt: null,
          branch: { name: "Farg'ona", startOfWorkingDay: '08:00', endOfWorkingDay: '22:30' },
        },
        {
          id: 'r2', name: '2-xona', capacity: null, status: 'ACTIVE', branchId: 1,
          createdAt: d('2026-05-01T00:00:00Z'), deletedAt: null,
          branch: { name: "Farg'ona", startOfWorkingDay: '23:00', endOfWorkingDay: '07:00' },
        },
      ]),
    },
    group: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'g1', name: 'A1-04', roomId: 'r1', branchId: 1, courseId: 'c1',
          exactDays: ['monday'], lessonStartTime: '10:00', lessonEndTime: '11:30',
          startDate: null, endDate: null, createdAt: d('2026-05-01T00:00:00Z'),
          deletedAt: d('2026-09-10T00:00:00Z'),
          enrollments: [
            { id: 'e1', createdAt: d('2026-05-02T00:00:00Z'), statusChangedAt: d('2026-09-10T00:00:00Z'), status: 'DROPPED' },
          ],
        },
      ]),
    },
    roomCapacitySnapshot: {
      findMany: jest.fn().mockResolvedValue([
        { roomId: 'r1', capacity: 12, validFrom: d('2026-05-01T00:00:00Z'), validTo: d('2026-07-01T00:00:00Z') },
      ]),
    },
    groupScheduleSnapshot: {
      findMany: jest.fn().mockResolvedValue([
        {
          groupId: 'g1', exactDays: ['friday'], lessonStartTime: '15:00', lessonEndTime: '16:00',
          courseId: 'c1', validFrom: d('2026-05-01T00:00:00Z'), validTo: d('2026-08-01T00:00:00Z'),
        },
      ]),
    },
    coursePriceSnapshot: {
      findMany: jest.fn().mockResolvedValue([
        { courseId: 'c1', price: 400_000, validFrom: d('2026-05-01T00:00:00Z'), validTo: null },
      ]),
    },
    course: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'c1', name: 'Standart', paymentModel: 'MONTHLY', price: 450_000 },
      ]),
    },
    statusHistory: {
      findMany: jest.fn().mockResolvedValue([
        { entityId: 'g1', toStatus: 'PAUSED', createdAt: d('2026-07-01T00:00:00Z') },
      ]),
    },
    enrollmentStateLog: {
      findMany: jest.fn().mockResolvedValue([
        { enrollmentId: 'e1', status: 'DROPPED', transitionAt: d('2026-09-10T00:00:00Z') },
      ]),
    },
  };
}

describe('CenterFactsLoader', () => {
  it('reads deleted groups and their enrollments: no deletedAt filter', async () => {
    const prisma = prismaMock();
    await new CenterFactsLoader(prisma as never).load(1001, [1], d('2026-05-01T00:00:00Z'), d('2026-09-30T00:00:00Z'));
    const groupWhere = prisma.group.findMany.mock.calls[0][0].where;
    expect(groupWhere).toEqual({ companyId: 1001, branchId: { in: [1] }, createdAt: { lte: d('2026-09-30T00:00:00Z') } });
    const select = prisma.group.findMany.mock.calls[0][0].select;
    expect(select.enrollments.where).toBeUndefined();
    expect(prisma.room.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1001, branchId: { in: [1] }, createdAt: { lte: d('2026-09-30T00:00:00Z') },
    });
  });

  it('builds rooms with a normalized window and a capacity history', async () => {
    const facts = await new CenterFactsLoader(prismaMock() as never).load(1001, null, d('2026-05-01T00:00:00Z'), d('2026-09-30T00:00:00Z'));
    expect(facts.rooms[0].window).toEqual({ start: '08:00', end: '22:30' });
    expect(facts.rooms[1].window).toEqual({ start: '09:00', end: '21:00' }); // reversed → default
    expect(facts.rooms[0].capacityHistory).toEqual([
      { validFrom: d('2026-05-01T00:00:00Z'), validTo: d('2026-07-01T00:00:00Z'), value: 12 },
    ]);
    expect(facts.rooms[0].capacityNow).toBe(16);
  });

  it('builds groups with schedule history, status log and completed enrollment logs', async () => {
    const facts = await new CenterFactsLoader(prismaMock() as never).load(1001, null, d('2026-05-01T00:00:00Z'), d('2026-09-30T00:00:00Z'));
    const g = facts.groups[0];
    expect(g.scheduleNow).toEqual({ exactDays: ['monday'], start: '10:00', end: '11:30', courseId: 'c1' });
    expect(g.scheduleHistory[0].value).toEqual({ exactDays: ['friday'], start: '15:00', end: '16:00', courseId: 'c1' });
    expect(g.statusLog).toEqual([{ status: 'PAUSED', at: d('2026-07-01T00:00:00Z') }]);
    // opening row supplied: the log started with DROPPED, created earlier
    expect(g.enrollments[0].log).toEqual([
      { status: 'ACTIVE', transitionAt: d('2026-05-02T00:00:00Z') },
      { status: 'DROPPED', transitionAt: d('2026-09-10T00:00:00Z') },
    ]);
  });

  it('maps courses: monthly flag, now-price and price history', async () => {
    const facts = await new CenterFactsLoader(prismaMock() as never).load(1001, null, d('2026-05-01T00:00:00Z'), d('2026-09-30T00:00:00Z'));
    expect(facts.courses.get('c1')).toEqual({
      id: 'c1', name: 'Standart', monthly: true, priceNow: 450_000,
      priceHistory: [{ validFrom: d('2026-05-01T00:00:00Z'), validTo: null, value: 400_000 }],
    });
  });

  it('asks the snapshots only for the ids it read', async () => {
    const prisma = prismaMock();
    await new CenterFactsLoader(prisma as never).load(1001, null, d('2026-05-01T00:00:00Z'), d('2026-09-30T00:00:00Z'));
    expect(prisma.roomCapacitySnapshot.findMany.mock.calls[0][0].where.roomId).toEqual({ in: ['r1', 'r2'] });
    expect(prisma.groupScheduleSnapshot.findMany.mock.calls[0][0].where.groupId).toEqual({ in: ['g1'] });
    expect(prisma.statusHistory.findMany.mock.calls[0][0].where).toEqual({
      entityType: 'Group', entityId: { in: ['g1'] },
    });
    expect(prisma.enrollmentStateLog.findMany.mock.calls[0][0].where.enrollmentId).toEqual({ in: ['e1'] });
  });
});
```

- [ ] **Step 4: Yiqilishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-facts.loader.spec.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 5: Implementatsiya** (`center-facts.loader.ts`)

```ts
import { Injectable } from '@nestjs/common';
import { PaymentModel } from '@prisma/client';
import { branchIdWhere, type ReportBranchIds } from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  supplyClosingRow,
  supplyOpeningRow,
  type EnrollmentStatusEvent,
} from '../../students/shared/enrollment-status-on';
import type {
  CenterFacts,
  CourseFact,
  GroupFact,
  Point,
  RoomFact,
  ScheduleValue,
} from './center-activity.types';
import { normalizeWorkWindow } from './center-points';

const overlap = (firstAt: Date, lastAt: Date) => ({
  validFrom: { lte: lastAt },
  OR: [{ validTo: null }, { validTo: { gt: firstAt } }],
});

function group<K extends string, R extends { [P in K]: string }>(rows: R[], key: K) {
  const m = new Map<string, R[]>();
  for (const r of rows) {
    const list = m.get(r[key]) ?? [];
    list.push(r);
    m.set(r[key], list);
  }
  return m;
}

/**
 * Everything the page needs, read ONCE for a range of months (spec B7b §3).
 *
 * Deleted and closed groups are read on purpose: a group is part of a past
 * month while it was open, and `isGroupOpen` is the one gate. So neither the
 * groups, their enrollments, nor the rooms are filtered by `deletedAt` here.
 * (A group's deletion closes its enrollments in the state log at
 * `group.deletedAt`, `StatusCascadeService.cascadeGroupDeletion`; whether the
 * rows are also stamped `deletedAt` does not matter, because nothing filters
 * on it.)
 *
 * // ponytail: no cache — a month is a few hundred groups and a few thousand
 * enrollments; Redis (key: company + branch + month) if it is measured slow.
 */
@Injectable()
export class CenterFactsLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    companyId: number,
    scope: ReportBranchIds,
    firstAt: Date,
    lastAt: Date,
  ): Promise<CenterFacts> {
    const where = { companyId, ...branchIdWhere(scope), createdAt: { lte: lastAt } };
    const [roomRows, groupRows] = await Promise.all([
      this.prisma.room.findMany({
        where,
        select: {
          id: true, name: true, capacity: true, status: true, branchId: true,
          createdAt: true, deletedAt: true,
          branch: { select: { name: true, startOfWorkingDay: true, endOfWorkingDay: true } },
        },
      }),
      this.prisma.group.findMany({
        where,
        select: {
          id: true, name: true, roomId: true, branchId: true, courseId: true,
          exactDays: true, lessonStartTime: true, lessonEndTime: true,
          startDate: true, endDate: true, createdAt: true, deletedAt: true,
          enrollments: {
            select: { id: true, createdAt: true, statusChangedAt: true, status: true },
          },
        },
      }),
    ]);

    const roomIds = roomRows.map((r) => r.id);
    const groupIds = groupRows.map((g) => g.id);
    const enrollmentIds = groupRows.flatMap((g) => g.enrollments.map((e) => e.id));
    const range = overlap(firstAt, lastAt);

    const [capacities, schedules, history, logs] = await Promise.all([
      roomIds.length
        ? this.prisma.roomCapacitySnapshot.findMany({
            where: { roomId: { in: roomIds }, ...range },
            select: { roomId: true, capacity: true, validFrom: true, validTo: true },
          })
        : [],
      groupIds.length
        ? this.prisma.groupScheduleSnapshot.findMany({
            where: { groupId: { in: groupIds }, ...range },
            select: {
              groupId: true, exactDays: true, lessonStartTime: true, lessonEndTime: true,
              courseId: true, validFrom: true, validTo: true,
            },
          })
        : [],
      groupIds.length
        ? this.prisma.statusHistory.findMany({
            where: { entityType: 'Group', entityId: { in: groupIds } },
            select: { entityId: true, toStatus: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          })
        : [],
      enrollmentIds.length
        ? this.prisma.enrollmentStateLog.findMany({
            where: { enrollmentId: { in: enrollmentIds }, transitionAt: { lte: lastAt } },
            select: { enrollmentId: true, status: true, transitionAt: true },
            orderBy: { transitionAt: 'asc' },
          })
        : [],
    ]);

    const courseIds = [
      ...new Set([
        ...groupRows.map((g) => g.courseId),
        ...schedules.map((s) => s.courseId).filter((c): c is string => !!c),
      ]),
    ];
    const [courseRows, prices] = await Promise.all([
      courseIds.length
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, name: true, paymentModel: true, price: true },
          })
        : [],
      courseIds.length
        ? this.prisma.coursePriceSnapshot.findMany({
            where: { courseId: { in: courseIds }, ...range },
            select: { courseId: true, price: true, validFrom: true, validTo: true },
          })
        : [],
    ]);

    const capByRoom = group(capacities, 'roomId');
    const schedByGroup = group(schedules, 'groupId');
    const statusByGroup = group(history, 'entityId');
    const logByEnrollment = group(logs, 'enrollmentId');
    const priceByCourse = group(prices, 'courseId');

    const rooms: RoomFact[] = roomRows.map((r) => ({
      id: r.id, name: r.name, branchId: r.branchId, branchName: r.branch.name,
      createdAt: r.createdAt, deletedAt: r.deletedAt, status: r.status,
      capacityNow: r.capacity,
      capacityHistory: (capByRoom.get(r.id) ?? []).map(
        (c): Point<number> => ({ validFrom: c.validFrom, validTo: c.validTo, value: c.capacity }),
      ),
      window: normalizeWorkWindow(r.branch.startOfWorkingDay, r.branch.endOfWorkingDay),
    }));

    const groups: GroupFact[] = groupRows.map((g) => ({
      id: g.id, name: g.name, roomId: g.roomId, branchId: g.branchId,
      createdAt: g.createdAt, startDate: g.startDate, endDate: g.endDate, deletedAt: g.deletedAt,
      scheduleNow: {
        exactDays: g.exactDays, start: g.lessonStartTime, end: g.lessonEndTime, courseId: g.courseId,
      },
      scheduleHistory: (schedByGroup.get(g.id) ?? []).map(
        (s): Point<ScheduleValue> => ({
          validFrom: s.validFrom, validTo: s.validTo,
          value: { exactDays: s.exactDays, start: s.lessonStartTime, end: s.lessonEndTime, courseId: s.courseId },
        }),
      ),
      statusLog: (statusByGroup.get(g.id) ?? []).map((h) => ({ status: h.toStatus, at: h.createdAt })),
      enrollments: g.enrollments.map((e) => {
        const log: EnrollmentStatusEvent[] = (logByEnrollment.get(e.id) ?? []).map((l) => ({
          status: l.status, transitionAt: l.transitionAt,
        }));
        supplyOpeningRow(log, e.createdAt);
        supplyClosingRow(log, e);
        return { createdAt: e.createdAt, statusChangedAt: e.statusChangedAt, status: e.status, log };
      }),
    }));

    const courses = new Map<string, CourseFact>(
      courseRows.map((c) => [
        c.id,
        {
          id: c.id, name: c.name, monthly: c.paymentModel === PaymentModel.MONTHLY,
          priceNow: c.price,
          priceHistory: (priceByCourse.get(c.id) ?? []).map(
            (p): Point<number> => ({ validFrom: p.validFrom, validTo: p.validTo, value: p.price }),
          ),
        },
      ]),
    );

    return { rooms, groups, courses };
  }
}
```

- [ ] **Step 6: O'tishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-facts.loader.spec.ts && npm run typecheck`
Expected: PASS; typecheck xatosiz (`PaymentModel` enum nomini tekshir: agar Prisma'da boshqacha bo'lsa `grep -n "enum PaymentModel" prisma/schema.prisma` bilan moslang).

- [ ] **Step 7: Commit**

```bash
cd server && npx prettier --write src/reports/center-activity && npx eslint src/reports/center-activity --quiet && cd .. && git add server/src/reports/center-activity && git commit -m "feat(center-activity): load the centre's facts once, deleted groups included

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Servis, kontroller, modul, eski yo'lni olib tashlash

**Files:**
- Create: `server/src/reports/center-activity/center-activity.service.ts`
- Create: `server/src/reports/center-activity/center-activity.service.spec.ts`
- Create: `server/src/reports/center-activity/center-activity.controller.ts`
- Create: `server/src/reports/center-activity/center-activity.controller.spec.ts`
- Modify: `server/src/reports/reports.module.ts` (yangi controller/service/loader qo'shish, eski servisni olib tashlash)
- Modify: `server/src/reports/reports.controller.ts` (eski `@Get('center-activity')` metodini va `CenterActivityQueryDto` importini olib tashlash)
- Modify: `server/src/reports/reports.service.ts` (`ReportsCenterActivityService` konstruktor parametri, import, `getCenterActivity` fasadi)
- Modify: `server/src/reports/reports.service.spec.ts`, `server/src/reports/reports.controller.spec.ts` (eski servis/metodga havolalarni olib tashlash)
- Delete: `server/src/reports/reports-center-activity.service.ts`, `server/src/reports/reports-center-activity.service.spec.ts`, `server/src/reports/dto/center-activity-query.dto.ts`
- Modify: `server/src/rooms/rooms.service.ts` (kesh andozasidan `reports:center-activity:*` ni olib tashlash)
- Modify: `server/src/common/permissions/route-access.snapshot.json`, `server/src/common/permissions/intentional-access-changes.ts`

**Interfaces:**
- Consumes: `CenterFactsLoader.load`, `buildOverview`, `parseCenterMonth`, `asOfForMonth`, `monthsUpTo`, `CenterActivityQueryDto`.
- Produces:
  - `CenterActivityService.overview(companyId: number, scope: ReportBranchIds, q: CenterActivityQueryDto): Promise<CenterOverview>`
  - `CenterActivityService.excelData(companyId, scope, q): Promise<{ overview: CenterOverview; heats: { branch: OverviewBranch; heat: Heat }[]; ... }>` — Task 8'da yoziladi; bu vazifada faqat `overview`.
  - `CenterActivityController`: `GET /reports/center-activity/overview` (`overview`), `GET /reports/center-activity/excel` (`excel` — Task 8).

- [ ] **Step 1: Servis testi yoz** (`center-activity.service.spec.ts`)

```ts
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CenterActivityService } from './center-activity.service';
import type { CenterFacts } from './center-activity.types';

const d = (s: string) => new Date(s);
const W = { start: '08:00', end: '22:30' };

const facts: CenterFacts = {
  rooms: [
    {
      id: 'r1', name: '1-xona', branchId: 1, branchName: "Farg'ona",
      createdAt: d('2026-05-01T00:00:00Z'), deletedAt: null, status: 'ACTIVE',
      capacityNow: 16, capacityHistory: [], window: W,
    },
  ],
  groups: [],
  courses: new Map(),
};

describe('CenterActivityService', () => {
  const loader = { load: jest.fn().mockResolvedValue(facts) };
  const service = new CenterActivityService(loader as never);

  beforeEach(() => loader.load.mockClear());

  it('refuses an empty scope before reading anything', async () => {
    await expect(service.overview(1001, [], {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('refuses a bad month and a future month', async () => {
    await expect(service.overview(1001, null, { oy: '2026-04' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.overview(1001, null, { oy: '2999-01' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reads the whole range once and answers', async () => {
    const out = await service.overview(1001, [1], { oy: '2026-09' });
    expect(out.month).toBe('2026-09');
    expect(loader.load).toHaveBeenCalledTimes(1);
    const [company, scope, firstAt, lastAt] = loader.load.mock.calls[0];
    expect(company).toBe(1001);
    expect(scope).toEqual([1]);
    // 2026-05 starts 2026-04-30T19:00Z in Tashkent; 2026-09 ends 2026-09-30T18:59:59.999Z
    expect(firstAt.toISOString()).toBe('2026-04-30T19:00:00.000Z');
    expect(lastAt.toISOString()).toBe('2026-09-30T18:59:59.999Z');
    expect(out.months.map((m) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  });

  it('turns an unknown branch into 400', async () => {
    await expect(service.overview(1001, [1], { oy: '2026-09', filial: 99 })).rejects.toEqual(
      new BadRequestException("Bu filial tanlangan qamrovda yo'q"),
    );
  });
});
```

- [ ] **Step 2: Yiqilishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-activity.service.spec.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Servis** (`center-activity.service.ts`)

```ts
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { tashkentMonthRangeUtc } from '../../common/date/tashkent';
import { isEmptyScope, type ReportBranchIds } from '../../common/finance/report-branch-scope';
import type { CenterFacts, CenterOverview } from './center-activity.types';
import { asOfForMonth, monthsUpTo, parseCenterMonth } from './center-activity-period';
import { CenterFactsLoader } from './center-facts.loader';
import { buildOverview } from './center-overview';
import type { CenterActivityQueryDto } from './dto/center-activity-query.dto';

/** «Markaz faoliyati» (spec B7b). One read, then pure functions; no cache. */
@Injectable()
export class CenterActivityService {
  constructor(private readonly loader: CenterFactsLoader) {}

  /** `GET /reports/center-activity/overview`. */
  async overview(
    companyId: number,
    scope: ReportBranchIds,
    q: CenterActivityQueryDto,
  ): Promise<CenterOverview> {
    const { facts, month, now } = await this.read(companyId, scope, q);
    try {
      return buildOverview(facts, month, now, q.filial);
    } catch (e) {
      if (e instanceof RangeError) {
        throw new BadRequestException("Bu filial tanlangan qamrovda yo'q");
      }
      throw e;
    }
  }

  /** The facts for the month and the bars before it — shared by the page and the Excel. */
  async read(
    companyId: number,
    scope: ReportBranchIds,
    q: CenterActivityQueryDto,
  ): Promise<{ facts: CenterFacts; month: string; now: Date }> {
    if (isEmptyScope(scope)) {
      throw new ForbiddenException("Bu filial hisobotini ko'rish huquqingiz yo'q");
    }
    const now = new Date();
    const month = parseCenterMonth(q.oy, now);
    const firstAt = tashkentMonthRangeUtc(monthsUpTo(month)[0]).gte;
    const facts = await this.loader.load(companyId, scope, firstAt, asOfForMonth(month, now));
    return { facts, month, now };
  }
}
```

(`isEmptyScope` — `report-branch-scope.ts`da mavjud; imzosini tasdiqla: `grep -n "export function isEmptyScope" src/common/finance/report-branch-scope.ts`.)

- [ ] **Step 4: Kontroller testi** (`center-activity.controller.spec.ts`)

```ts
import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { CenterActivityController } from './center-activity.controller';
import { CenterActivityService } from './center-activity.service';

describe('CenterActivityController', () => {
  const service = { overview: jest.fn().mockResolvedValue({}) };
  let controller: CenterActivityController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CenterActivityController],
      providers: [{ provide: CenterActivityService, useValue: service }],
    }).compile();
    controller = module.get(CenterActivityController);
  });

  it('overview is gated by reports.students and admits CEO and Branch Director only', () => {
    expect(routeAccess(CenterActivityController, 'overview')).toEqual({
      kind: 'can',
      keys: ['reports.students'],
    });
    expect(defaultRolesOf(CenterActivityController, 'overview')).toEqual([
      'Branch Director',
      'CEO',
    ]);
  });

  it('overview passes the company, the resolved scope and the query', async () => {
    const q = { oy: '2026-09', filial: 2 };
    await controller.overview(q, 1001, [3, 7]);
    expect(service.overview).toHaveBeenCalledWith(1001, [3, 7], q);
  });
});
```

- [ ] **Step 5: Kontroller** (`center-activity.controller.ts`) — hozircha faqat `overview` (Excel Task 8'da qo'shiladi)

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import { CenterActivityService } from './center-activity.service';
import { CenterActivityQueryDto } from './dto/center-activity-query.dto';

/**
 * «Markaz faoliyati» (spec B7b §5). The header branch (`@BranchScope()`) as a
 * list: several branches without a pick are added up; an empty scope is refused
 * in the service. Not listed in `branch-route-policy.ts`.
 */
@Controller('reports/center-activity')
export class CenterActivityController {
  constructor(private readonly service: CenterActivityService) {}

  /** Cards, free-rooms table, rooms, groups with free seats, month bars. CEO and Branch Director (`reports.students`). */
  @Get('overview')
  @Can('reports.students')
  overview(
    @Query() q: CenterActivityQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.overview(companyId, scope, q);
  }
}
```

- [ ] **Step 6: Yangi yo'lni ulash va eskisini olib tashlash**

1. `reports.module.ts`: `import { CenterActivityController } from './center-activity/center-activity.controller'; import { CenterActivityService } from './center-activity/center-activity.service'; import { CenterFactsLoader } from './center-activity/center-facts.loader';` qo'sh; `controllers` ga `CenterActivityController`, `providers` ga `CenterActivityService`, `CenterFactsLoader` qo'sh; `ReportsCenterActivityService` importi va provider'ini o'chir.
2. `reports.controller.ts`: `getCenterActivity` metodi (`@Get('center-activity')`) va `CenterActivityQueryDto` importini o'chir.
3. `reports.service.ts`: `ReportsCenterActivityService` importi, konstruktor parametri `private centerActivity`, `CenterActivityQueryDto` importi va `getCenterActivity` metodini o'chir. `reports.service.spec.ts` va `reports.controller.spec.ts`dan shu servis/metodga havolalarni (import, provider, test) o'chir.
4. `git rm src/reports/reports-center-activity.service.ts src/reports/reports-center-activity.service.spec.ts src/reports/dto/center-activity-query.dto.ts`.
5. `rooms/rooms.service.ts`: `invalidateActivityCache` ichidagi `patterns` dan `` `reports:center-activity:${companyId}:*` `` qatorini o'chir (`reports:room-util:*` qoladi — moliyaviy Excel o'qiydi).
6. `route-access.snapshot.json`: `"GET /reports/center-activity"` qatorini olib tashla va uning o'rniga bitta qator qo'sh: `"GET /reports/center-activity/overview": ["Branch Director","CEO"]` (`excel` qatori Task 8 da qo'shiladi; format: yuqoridagi `group-payments` qatorlari kabi, har bir rol alohida qatorda).
7. `intentional-access-changes.ts`: `'GET /reports/center-activity'` yozuvini o'chir (yangi yo'llar default bilan mos, Administrator hech qachon bo'lmagan, shuning uchun yozuv kerak emas).

- [ ] **Step 7: Tekshirish**

Run:
```bash
cd server && npx jest src/reports src/common/permissions src/rooms && npm run typecheck && npm run build
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd server && npx prettier --write src/reports src/rooms src/common/permissions && npx eslint src/reports src/rooms --quiet && cd .. && git add -A server && git commit -m "feat(center-activity): overview endpoint, old center-activity route removed

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Excel (`/excel`)

**Files:**
- Create: `server/src/reports/center-activity/center-activity.excel.ts`
- Create: `server/src/reports/center-activity/center-activity.excel.spec.ts`
- Modify: `server/src/reports/center-activity/center-activity.service.ts` (`excel`)
- Modify: `server/src/reports/center-activity/center-activity.controller.ts` (`excel`)
- Modify: `server/src/reports/center-activity/center-activity.controller.spec.ts`, `center-activity.service.spec.ts`
- Modify: `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: `CenterOverview`, `evaluateCenter` + `buildHeat` (har filial uchun), `asOfForMonth`.
- Produces:
  - `export interface CenterExcelInput { month: string; overview: CenterOverview; groups: GroupResult[]; heats: { branchName: string; heat: Heat }[] }`
  - `export async function centerActivityWorkbook(input: CenterExcelInput): Promise<Buffer>` — varaqlar: «Xonalar», «Guruhlar», «Soatlar», «Oylar».
  - `CenterActivityService.excel(companyId, scope, q): Promise<{ buffer: Buffer; filename: string }>`; fayl nomi `markaz-faoliyati-<oy>.xlsx`.

- [ ] **Step 1: Excel testi yoz** (`center-activity.excel.spec.ts`)

```ts
import { Workbook } from 'exceljs';
import { centerActivityWorkbook } from './center-activity.excel';
import { WEEK_DAYS } from './center-activity.types';
import type { CenterOverview } from './center-activity.types';

const overview = {
  month: '2026-09',
  asOf: '2026-09-30T18:59:59.999Z',
  current: false,
  branches: [{ id: 1, name: "Farg'ona", rooms: 1 }],
  cards: {
    occupancyPct: 27.4,
    lessonHoursPerWeek: 215,
    workWindow: { start: '08:00', end: '22:30' },
    seats: { pct: 69.6, enrolled: 472, capacity: 678 },
    free: { seats: 206, revenue: 93_000_000 },
  },
  heat: null,
  rooms: [
    { id: 'r1', name: '1-xona', branchId: 1, branchName: "Farg'ona", capacity: 16, groupCount: 3, lessonHours: 20, occupancyPct: 23 },
  ],
  groups: [],
  months: [{ month: '2026-08', pct: 25 }, { month: '2026-09', pct: 27.4 }],
  notes: { deletedLater: 2, unplaced: 1 },
} as CenterOverview;

describe('centerActivityWorkbook', () => {
  it('writes the four sheets with the page figures', async () => {
    const buffer = await centerActivityWorkbook({
      month: '2026-09',
      overview,
      groups: [
        {
          id: 'g1', name: 'A1-04', courseName: 'Standart', branchId: 1, roomId: 'r1',
          days: ['monday', 'wednesday'], start: '10:00', end: '11:30',
          enrolled: 7, capacity: 16, free: 9, overfull: false, monthlyPrice: 450_000,
        },
      ],
      heats: [
        {
          branchName: "Farg'ona",
          heat: {
            rooms: 1, days: [...WEEK_DAYS], hours: [8, 9],
            cells: WEEK_DAYS.map(() => [{ free: 1, tone: 'green' as const }, { free: 0, tone: 'red' as const }]),
          },
        },
      ],
    });
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Xonalar', 'Guruhlar', 'Soatlar', 'Oylar']);

    const rooms = wb.getWorksheet('Xonalar')!;
    expect(rooms.getRow(1).values).toEqual(
      expect.arrayContaining(['Xona', 'Filial', "O'rin", 'Guruhlar', 'Dars soati (hafta)', 'Bandlik, %']),
    );
    expect(rooms.getRow(2).getCell(1).value).toBe('1-xona');

    const groups = wb.getWorksheet('Guruhlar')!;
    expect(groups.getRow(2).getCell(1).value).toBe('A1-04');
    expect(groups.getRow(2).getCell(3).value).toBe('Du-Chor 10:00–11:30');

    const hours = wb.getWorksheet('Soatlar')!;
    expect(hours.getRow(1).getCell(1).value).toBe("Farg'ona");
    const months = wb.getWorksheet('Oylar')!;
    expect(months.getRow(3).getCell(1).value).toBe('2026-09');
    expect(months.getRow(3).getCell(2).value).toBe(27.4);
  });
});
```

(Birinchi qatordan keyingi tartib: «Xonalar» sarlavha qatori 1, qatorlar 2 dan. «Soatlar»: A1 = filial nomi, 2-qator = soatlar sarlavhasi, keyin kunlar. «Oylar»: 1-qator sarlavha, 2-qator oy bo'yicha birinchi, shuning uchun `2026-08` 2-qatorda va `2026-09` 3-qatorda.)

- [ ] **Step 2: Yiqilishini ko'r**

Run: `cd server && npx jest src/reports/center-activity/center-activity.excel.spec.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Implementatsiya** (`center-activity.excel.ts`)

```ts
import { Workbook } from 'exceljs';
import { DAY_SHORT, type CenterOverview } from './center-activity.types';
import type { Heat } from './center-heat';
import type { GroupResult } from './center-metrics';

export interface CenterExcelInput {
  month: string;
  overview: CenterOverview;
  /** Every open group with a counted seat, free or full. */
  groups: GroupResult[];
  heats: { branchName: string; heat: Heat }[];
}

const daysLabel = (days: GroupResult['days']) => days.map((d) => DAY_SHORT[d]).join('-');

function header(sheet: import('exceljs').Worksheet, titles: [string, number][]) {
  sheet.columns = titles.map(([title, width]) => ({ header: title, width }));
  sheet.getRow(1).font = { bold: true };
}

/** The workbook of the page (spec B7b §5): rooms, groups, free-rooms table per branch, months. */
export async function centerActivityWorkbook(input: CenterExcelInput): Promise<Buffer> {
  const wb = new Workbook();

  const rooms = wb.addWorksheet('Xonalar');
  header(rooms, [['Xona', 22], ['Filial', 20], ["O'rin", 10], ['Guruhlar', 10], ['Dars soati (hafta)', 18], ['Bandlik, %', 12]]);
  for (const r of input.overview.rooms) {
    rooms.addRow([r.name, r.branchName, r.capacity ?? '', r.groupCount, r.lessonHours, r.occupancyPct ?? '']);
  }

  const groups = wb.addWorksheet('Guruhlar');
  header(groups, [['Guruh', 22], ['Kurs', 22], ['Jadval', 24], ["O'quvchi", 10], ["O'rin", 10], ["Bo'sh", 10], ['Holat', 18]]);
  for (const g of input.groups) {
    groups.addRow([
      g.name, g.courseName,
      `${daysLabel(g.days)} ${g.start ?? ''}${g.end ? `–${g.end}` : ''}`.trim(),
      g.enrolled, g.capacity, g.free, g.overfull ? "sig'imdan oshgan" : '',
    ]);
  }

  const hours = wb.addWorksheet('Soatlar');
  hours.columns = [{ width: 16 }, ...Array.from({ length: 24 }, () => ({ width: 6 }))];
  for (const { branchName, heat } of input.heats) {
    hours.addRow([branchName]).font = { bold: true };
    hours.addRow(['', ...heat.hours.map((h) => `${String(h).padStart(2, '0')}:00`)]).font = { bold: true };
    heat.days.forEach((day, di) => {
      hours.addRow([DAY_SHORT[day], ...heat.cells[di].map((c) => c.free)]);
    });
    hours.addRow([]);
  }

  const months = wb.addWorksheet('Oylar');
  header(months, [['Oy', 12], ['Bandlik, %', 12]]);
  for (const m of input.overview.months) months.addRow([m.month, m.pct ?? '']);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

- [ ] **Step 4: Servis va kontrollerga `excel` qo'sh**

`center-activity.service.ts`ga:

```ts
import { evaluateCenter } from './center-metrics';
import { buildHeat } from './center-heat';
import { centerActivityWorkbook } from './center-activity.excel';
import { tashkentMonthKey } from '../../common/date/tashkent';

  /** `GET /reports/center-activity/excel`: the page's figures, every branch's free-rooms table, every open group. */
  async excel(
    companyId: number,
    scope: ReportBranchIds,
    q: CenterActivityQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { facts, month, now } = await this.read(companyId, scope, q);
    const overview = buildOverview(facts, month, now);
    const at = asOfForMonth(month, now);
    const ev = evaluateCenter(facts, at, month === tashkentMonthKey(now));
    const heats = overview.branches.map((b) => ({
      branchName: b.name,
      heat: buildHeat(ev.rooms.filter((r) => r.branchId === b.id)),
    }));
    const buffer = await centerActivityWorkbook({ month, overview, groups: ev.groups, heats });
    return { buffer, filename: `markaz-faoliyati-${month}.xlsx` };
  }
```

`center-activity.controller.ts`ga (importlar: `Res` from `@nestjs/common`, `type Response` from `express`):

```ts
  /** The workbook of the same month (same scope, no page). */
  @Get('excel')
  @Can('reports.students')
  async excel(
    @Query() q: CenterActivityQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.service.excel(companyId, scope, q);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
```

Kontroller spec'ga `excel` uchun marker testi va javob sarlavhalari testini `group-payments.controller.spec.ts` dagi kabi qo'sh (`routeAccess(..., 'excel')` → `reports.students`, `defaultRolesOf` → `['Branch Director','CEO']`, `res.setHeader` uch marta, `res.end(buffer)`); servis spec'ga `excel` testi qo'sh (`loader.load` mock'idan keyin `filename` `markaz-faoliyati-2026-09.xlsx` va `buffer` bo'sh emasligini tekshir). `route-access.snapshot.json`ga `"GET /reports/center-activity/excel": ["Branch Director","CEO"]` qatorini `overview` qatoridan keyin qo'sh.

- [ ] **Step 5: Tekshirish**

Run:
```bash
cd server && npx jest src/reports/center-activity src/common/permissions && npm run typecheck && npm run build
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd server && npx prettier --write src/reports/center-activity src/common/permissions && npx eslint src/reports/center-activity --quiet && cd .. && git add -A server && git commit -m "feat(center-activity): Excel workbook

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Mijoz — turlar, URL, format, so'rov (sof qism)

**Files:**
- Create: `client/src/components/reports/center-activity/center-activity-types.ts`
- Create: `client/src/components/reports/center-activity/center-activity-url.ts`
- Create: `client/src/components/reports/center-activity/center-activity-format.ts`
- Create: `client/src/components/reports/center-activity/center-activity-format.test.ts`
- Create: `client/src/components/reports/center-activity/center-activity-queries.ts`

**Interfaces:**
- Consumes: server javobi (`CenterOverview`, Task 5).
- Produces:
  - `center-activity-types.ts`: serverdagi `CenterOverview`, `RoomRow`, `GroupRow`, `OverviewBranch`, `Heat`, `HeatCell`, `HeatTone`, `HeatInsight`, `InsightSlot`, `WeekDay` ning mijoz nusxasi (faqat turlar; maydon nomlari aynan bir xil).
  - `center-activity-url.ts`: `CENTER_ACTIVITY_SCHEMA`, `CenterActivityFilters`, `CA_FIRST_MONTH = "2026-05"`, `pageMonth(oy, current)`, `overviewParams(f, current)`, `excelParams`, `excelFileName(month)`.
  - `center-activity-format.ts`: `pctText(n: number | null): string`, `daysLabel(days: WeekDay[]): string`, `scheduleText(g: Pick<GroupRow,'days'|'start'>): string`, `insightSentences(i: HeatInsight): { quiet: string[]; busy: string | null }`, `mlnText(n: number): string`, `hourLabel(h: number): string`, `HEAT_CLASS: Record<HeatTone, string>`.
  - `center-activity-queries.ts`: `useCenterOverview(params)`.

- [ ] **Step 1: Turlar** (`center-activity-types.ts`) — server `center-activity.types.ts` (`WeekDay`, `OverviewBranch`, `RoomRow`, `GroupRow`, `CenterOverview`) va `center-heat.ts` (`HeatTone`, `HeatCell`, `Heat`), `heat-insight.ts` (`InsightSlot`, `HeatInsight`) dagi interfeyslarni aynan ko'chir (importsiz, bitta fayl). `WeekDay` = `'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday'`.

- [ ] **Step 2: Yiqiladigan format testi yoz** (`center-activity-format.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import {
  daysLabel, HEAT_CLASS, hourLabel, insightSentences, mlnText, pctText, scheduleText,
} from "./center-activity-format";

describe("center-activity-format", () => {
  it("pctText rounds to a whole percent and shows a dash for no answer", () => {
    expect(pctText(27.4)).toBe("27%");
    expect(pctText(69.6)).toBe("70%");
    expect(pctText(null)).toBe("—");
  });

  it("daysLabel and scheduleText use the short Uzbek day names", () => {
    expect(daysLabel(["monday", "wednesday", "friday"])).toBe("Du-Chor-Ju");
    expect(scheduleText({ days: ["tuesday", "thursday", "saturday"], start: "17:00" })).toBe("Se-Pay-Sha 17:00");
    expect(scheduleText({ days: ["monday"], start: null })).toBe("Du");
  });

  it("mlnText: whole millions from a million, so'm below", () => {
    expect(mlnText(93_000_000)).toBe("93 mln");
    expect(mlnText(93_400_000)).toBe("93 mln");
    expect(mlnText(450_000)).toBe(`${formatNumber(450_000)} so'm`);
    expect(mlnText(0)).toBe("0 so'm");
  });

  it("hourLabel pads the hour", () => {
    expect(hourLabel(8)).toBe("08");
    expect(hourLabel(21)).toBe("21");
  });

  it("insightSentences speaks Uzbek and names the days and the free rooms", () => {
    const s = insightSentences({
      quiet: [{ days: ["tuesday", "thursday", "saturday"], fromHour: 17, toHour: 22, freeMin: 8, freeMax: 9 }],
      busy: { days: ["monday", "wednesday", "friday"], fromHour: 15, toHour: 17, freeMin: 1, freeMax: 1 },
    });
    expect(s.quiet).toEqual(["Se-Pay-Sha 17:00–22:00 (8–9 xona bo'sh)"]);
    expect(s.busy).toBe("Du-Chor-Ju 15:00–17:00 (1 ta xona bo'sh)");
    expect(insightSentences({ quiet: [], busy: null })).toEqual({ quiet: [], busy: null });
  });

  it("heat classes avoid the Lumio-only colours and the english enum words", () => {
    const all = Object.values(HEAT_CLASS).join(" ");
    expect(all).not.toMatch(/amber|sky|hsl\(/);
    expect(Object.keys(HEAT_CLASS).sort()).toEqual(["green", "light", "red", "yellow"]);
  });
});
```

- [ ] **Step 3: Yiqilishini ko'r**

Run: `cd client && npx vitest run src/components/reports/center-activity/center-activity-format.test.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 4: `center-activity-format.ts`**

```ts
import { formatNumber } from "@/lib/format-utils";
import type { GroupRow, HeatInsight, HeatTone, InsightSlot, WeekDay } from "./center-activity-types";

const DAY_SHORT: Record<WeekDay, string> = {
  monday: "Du", tuesday: "Se", wednesday: "Chor", thursday: "Pay", friday: "Ju", saturday: "Sha",
};

/** «27%»: the server's one-decimal figure shown whole; «—» when the server had none (no rooms, no seats). */
export const pctText = (n: number | null): string => (n === null ? "—" : `${Math.round(n)}%`);

export const daysLabel = (days: WeekDay[]): string => days.map((d) => DAY_SHORT[d]).join("-");

/** «Du-Chor-Ju 10:00» */
export const scheduleText = (g: Pick<GroupRow, "days" | "start">): string =>
  g.start ? `${daysLabel(g.days)} ${g.start}` : daysLabel(g.days);

/** «93 mln» from a million, «450 000 so'm» below. */
export const mlnText = (n: number): string =>
  n >= 1_000_000 ? `${Math.round(n / 1_000_000)} mln` : `${formatNumber(n)} so'm`;

export const hourLabel = (h: number): string => String(h).padStart(2, "0");

const hh = (h: number) => `${hourLabel(h)}:00`;
const freeText = (s: InsightSlot) =>
  s.freeMin === s.freeMax ? `${s.freeMin} ta xona bo'sh` : `${s.freeMin}–${s.freeMax} xona bo'sh`;
const slotText = (s: InsightSlot) => `${daysLabel(s.days)} ${hh(s.fromHour)}–${hh(s.toHour)} (${freeText(s)})`;

/** The two lines under the table; the server gives structure, the words are here. */
export function insightSentences(i: HeatInsight): { quiet: string[]; busy: string | null } {
  return { quiet: i.quiet.map(slotText), busy: i.busy ? slotText(i.busy) : null };
}

/** HTML cell colours (not SVG): the free share of rooms, from the server's tone. */
export const HEAT_CLASS: Record<HeatTone, string> = {
  green: "bg-emerald-600 text-white",
  light: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};
```

- [ ] **Step 5: O'tishini ko'r**

Run: `cd client && npx vitest run src/components/reports/center-activity/center-activity-format.test.ts`
Expected: PASS. (`insightSentences` testidagi «1 ta xona bo'sh» ikkala `freeMin===freeMax` holatida «1 ta xona bo'sh» chiqishi uchun `freeText` yuqoridagi kabi; test shuni tekshiradi.)

- [ ] **Step 6: URL va so'rov fayllari**

`center-activity-url.ts`:

```ts
import { clampMonth } from "@/components/payments/overview/overview-math";

/** The report starts with the reporting base (spec B7b §2). */
export const CA_FIRST_MONTH = "2026-05";
export const CA_PAGE_SIZES = [10, 20, 30, 40, 50];

/** URL keys; defaults are left out of the URL by `useUrlFilters`. */
export const CENTER_ACTIVITY_SCHEMA = {
  oy: { type: "string", defaultValue: "" },
  filial: { type: "number", defaultValue: 0 },
} as const;

export interface CenterActivityFilters {
  oy: string;
  filial: number;
}

/** The page's month: `?oy=` inside [2026-05, the current month]; empty or unreadable is the current month. */
export const pageMonth = (oy: string, current: string): string => clampMonth(oy || current, CA_FIRST_MONTH, current);

/** The server's parameters: the current month and «no branch picked» are not sent. */
export function overviewParams(f: CenterActivityFilters, current: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const month = pageMonth(f.oy, current);
  if (month !== current) out.oy = month;
  if (f.filial > 0) out.filial = f.filial;
  return out;
}

export const excelParams = overviewParams;
export const excelFileName = (month: string): string => `markaz-faoliyati-${month}.xlsx`;
```

`center-activity-queries.ts`:

```ts
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchId } from "@/components/payments/overview/queries";
import type { CenterOverview } from "./center-activity-types";

/** The whole page in one answer; a month or branch change keeps the old answer on screen until the new one lands. The header branch rides in the key (the server reads `X-Branch-Id`). */
export function useCenterOverview(params: Record<string, string | number>) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["center-activity-overview", branchId, params],
    queryFn: () => api.get<CenterOverview>("/reports/center-activity/overview", { params }).then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}
```

(`clampMonth` imzosini tasdiqla: `grep -n "export function clampMonth" client/src/components/payments/overview/overview-math.ts`; imzo `(month, min, max)` bo'lmasa group-payments-url.ts dagi chaqiruv bilan moslang.)

- [ ] **Step 7: Tekshirish**

Run: `cd client && npx vitest run src/components/reports/center-activity && npx tsc --noEmit -p .`
Expected: PASS. (Eski komponentlar hali turibdi; tsc ularni ham o'qiydi, xato bo'lsa Task 10 da o'chadi.)

- [ ] **Step 8: Commit**

```bash
git add client/src/components/reports/center-activity && git commit -m "feat(center-activity): client types, URL, format helpers and query

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Mijoz — komponentlar, sahifa, eskisini olib tashlash

**Files:**
- Create: `client/src/components/reports/center-activity/center-activity-cards.tsx`, `center-activity-heat.tsx`, `center-activity-rooms.tsx`, `center-activity-groups.tsx`, `center-activity-months.tsx`, `center-activity-page.tsx`
- Modify: `client/src/app/(dashboard)/reports/activity/page.tsx`, `client/src/lib/reports-nav.ts`, `client/src/lib/breadcrumb-routes.ts`, `client/src/lib/uzbek-only-texts.test.ts`
- Delete: `client/src/components/reports/center-activity/{bulk-room-capacity-dialog,center-activity-client,center-activity-diagnostics,center-activity-filter-bar,center-activity-kpi-cards,center-activity-trend-chart,edit-room-capacity-dialog,metric-helpers,metric-trend-dialog,potential-revenue-dialog,rooms-activity-table}.tsx|.ts`

**Interfaces:**
- Consumes: Task 9 fayllari; `MonthStepper` (`@/components/shared/month-stepper`), `PaymentsPager` (`@/components/payments/list/payments-table`), `useUrlFilters`, `downloadAuthedFile`, `getErrorMessage`, `useCan`, shadcn `Table`, `Skeleton`, `Card`, `Select`.
- Produces: `CenterActivityPage` (default eksport emas, nomli eksport), sahifa `/reports/activity` shuni chizadi.

- [ ] **Step 1: Kartalar** (`center-activity-cards.tsx`)

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-utils";
import { mlnText, pctText } from "./center-activity-format";
import type { CenterOverview } from "./center-activity-types";

function Stat({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export function CenterActivityCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

/** The three cards (spec B7b §4). Every number is the server's. */
export function CenterActivityCards({ cards }: { cards: CenterOverview["cards"] }) {
  const window = cards.workWindow ? ` · ish vaqti ${cards.workWindow.start}–${cards.workWindow.end}, du–sha` : "";
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Stat
        title="Xonalar bandligi"
        value={pctText(cards.occupancyPct)}
        sub={`haftasiga ${formatNumber(cards.lessonHoursPerWeek)} soat dars${window}`}
      />
      <Stat
        title="Guruhlar to'lganligi"
        value={pctText(cards.seats.pct)}
        sub={`${formatNumber(cards.seats.enrolled)} o'quvchi · ${formatNumber(cards.seats.capacity)} o'rin`}
      />
      <Stat
        title="Bo'sh o'rinlar"
        value={`${formatNumber(cards.free.seats)} ta`}
        sub={
          cards.free.revenue > 0
            ? `mavjud guruhlarda · to'lsa, oyiga taxminan ${mlnText(cards.free.revenue)} qo'shimcha`
            : "mavjud guruhlarda"
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Issiqlik jadvali** (`center-activity-heat.tsx`)

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { daysLabel, HEAT_CLASS, hourLabel, insightSentences } from "./center-activity-format";
import type { CenterOverview, HeatTone } from "./center-activity-types";

const DAY_HEAD = ["Du", "Se", "Chor", "Pay", "Ju", "Sha"];
const LEGEND: { tone: HeatTone; text: string }[] = [
  { tone: "green", text: "Ko'p bo'sh" },
  { tone: "light", text: "Yarmi" },
  { tone: "yellow", text: "Kam" },
  { tone: "red", text: "Deyarli to'la" },
];

/** «Qachon xona bo'sh» (spec B7b §4): free rooms per weekday and hour for one branch. */
export function CenterActivityHeat({
  data, branches, onBranch,
}: {
  data: NonNullable<CenterOverview["heat"]>;
  branches: CenterOverview["branches"];
  onBranch: (id: number) => void;
}) {
  const { heat, insight } = data;
  const sentences = insightSentences(insight);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-medium">Qachon xona bo&apos;sh — yangi guruh uchun</h3>
            <p className="text-sm text-muted-foreground">
              Katakdagi son — o&apos;sha soatda nechta xona bo&apos;sh ({heat.rooms} tadan).
            </p>
          </div>
          {branches.length > 1 && (
            <Select value={String(data.branchId)} onValueChange={(v) => onBranch(Number(v))}>
              <SelectTrigger className="w-[200px]" aria-label="Filial">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name} · {b.rooms} xona
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {LEGEND.map((l) => (
            <span key={l.tone} className={cn("rounded px-2 py-0.5", HEAT_CLASS[l.tone])}>
              {l.text}
            </span>
          ))}
        </div>

        {heat.hours.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Bu filialda xona yo&apos;q</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mx-auto border-separate border-spacing-0.5 text-xs">
              <thead>
                <tr>
                  <th />
                  {heat.hours.map((h) => (
                    <th key={h} className="px-1 font-normal text-muted-foreground">{hourLabel(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.days.map((day, di) => (
                  <tr key={day}>
                    <th className="pr-2 text-right font-normal text-muted-foreground">{DAY_HEAD[di]}</th>
                    {heat.cells[di].map((c, hi) => (
                      <td
                        key={heat.hours[hi]}
                        title={`${DAY_HEAD[di]} ${hourLabel(heat.hours[hi])}:00 — ${c.free} ta xona bo'sh`}
                        className={cn("h-7 w-8 rounded text-center font-semibold", HEAT_CLASS[c.tone])}
                      >
                        {c.free}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(sentences.quiet.length > 0 || sentences.busy) && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            {sentences.quiet.length > 0 && (
              <>
                Eng qulay vaqt: <b>{sentences.quiet.join(" va ")}</b>.{" "}
              </>
            )}
            {sentences.busy && (
              <>
                Eng tig&apos;iz: <b>{sentences.busy}</b>.
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export { daysLabel };
```

(Oxirgi qatordagi `export { daysLabel }` ni olib tashlang — keraksiz; faqat import ishlatilmasa importni ham o'chiring: `daysLabel` bu faylda ishlatilmaydi.)

- [ ] **Step 3: Ikki jadval** — `center-activity-rooms.tsx` va `center-activity-groups.tsx`

`center-activity-rooms.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { formatNumber } from "@/lib/format-utils";
import { pctText } from "./center-activity-format";
import { CA_PAGE_SIZES } from "./center-activity-url";
import type { RoomRow } from "./center-activity-types";

/** «Xonalar» (spec B7b §4). The server sends every room; the page only slices it. */
export function CenterActivityRooms({ rooms, showBranch }: { rooms: RoomRow[]; showBranch: boolean }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const slice = rooms.slice((page - 1) * pageSize, page * pageSize);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <h3 className="font-medium">Xonalar</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Xona</TableHead>
              <TableHead className="text-right">O&apos;rin</TableHead>
              <TableHead className="text-right">Guruh</TableHead>
              <TableHead>Bandligi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="border-r text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                <TableCell>
                  {r.name}
                  {showBranch && <span className="ml-1 text-xs text-muted-foreground">{r.branchName}</span>}
                </TableCell>
                <TableCell className="text-right">{r.capacity ?? "—"}</TableCell>
                <TableCell className="text-right">{r.groupCount}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, r.occupancyPct ?? 0)}%` }} />
                    </div>
                    <span className="whitespace-nowrap text-sm">
                      {pctText(r.occupancyPct)} · {formatNumber(r.lessonHours)} soat
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PaymentsPager
          page={page} pageSize={pageSize} total={rooms.length}
          onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
          sizes={CA_PAGE_SIZES} sizeLabel="Sahifadagi xonalar soni"
        />
      </CardContent>
    </Card>
  );
}
```

`center-activity-groups.tsx` (xuddi shu andoza): sarlavha «Bo'sh o'rni bor guruhlar», ustunlar `#`, «Guruh» (nom + kurs kichik yozuv, `overfull` bo'lmaydi chunki `free > 0`), «Jadval» (`scheduleText(g)`), «O'quvchi / o'rin» (`${g.enrolled} / ${g.capacity}`, o'ngga), «Bo'sh» (`<b>{g.free}</b>`, o'ngga); sahifalash `CA_PAGE_SIZES`, `sizeLabel="Sahifadagi guruhlar soni"`; bo'sh ro'yxatda «Bo'sh o'rni bor guruh yo'q» qatori; pastida `useCan("students.list")` bo'lsa `<Link href="/students?status=ungrouped">Guruhsiz o&apos;quvchilarni joylashtirish →</Link>`, bo'lmasa oddiy matn (`CanLink` ishlatish mumkin: `@/components/shared/can-link`, imzosini tasdiqlang: `grep -n "export function CanLink" -A8 client/src/components/shared/can-link.tsx`).

- [ ] **Step 4: Oylar** (`center-activity-months.tsx`)

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { pctText } from "./center-activity-format";
import type { CenterOverview } from "./center-activity-types";

const MONTH_NAME = ["yan", "fev", "mar", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];
const monthName = (key: string) => MONTH_NAME[Number(key.slice(5, 7)) - 1];

/** «Oylar bo'yicha bandlik» (spec B7b §4): the same figure as the card, month by month. */
export function CenterActivityMonths({ months, selected }: { months: CenterOverview["months"]; selected: string }) {
  const top = Math.max(1, ...months.map((m) => m.pct ?? 0));
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <h3 className="font-medium">Oylar bo&apos;yicha bandlik</h3>
        <div className="grid items-end gap-3" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))`, height: 150 }}>
          {months.map((m) => (
            <div key={m.month} className="flex h-full flex-col items-center justify-end gap-1">
              <span className="text-xs font-semibold">{pctText(m.pct)}</span>
              <div
                className={cn("w-full max-w-10 rounded-t-md", m.month === selected ? "bg-primary" : "bg-primary/35")}
                style={{ height: `${((m.pct ?? 0) / top) * 100}%`, minHeight: 2 }}
              />
              <span className="text-xs text-muted-foreground">{monthName(m.month)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          O&apos;tgan oylarda keyin yopilgan yoki o&apos;chirilgan guruhlar ham hisobga olinadi.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Sahifa** (`center-activity-page.tsx`)

Tuzilma `group-payments-page.tsx` kabi: `useUrlFilters(CENTER_ACTIVITY_SCHEMA)`; `current = currentMonthKey()`; `month = pageMonth(filters.oy, current)`; `params = overviewParams(filters, current)`; `{ data, isPending, isPlaceholderData, isError, refetch } = useCenterOverview(params)`; `fresh = data && !isPlaceholderData && data.month === month ? data : undefined`; sarlavha «Markaz faoliyati», `MonthStepper value={month} min={CA_FIRST_MONTH} max={current} onChange={(m) => setFilters({ oy: m === current ? "" : m, filial: 0 })}`, filial yozuvi (`fresh?.branches.length === 1 ? fresh.branches[0].name + " filiali · " + rooms + " xona"`), Excel tugmasi (`downloadAuthedFile(`/reports/center-activity/excel?${qs}`, excelFileName(month))`, `exporting` holati, `toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"))`).

Bloklar tartibi: xato → `<div className="rounded-md border p-6 text-center text-sm text-muted-foreground">Ma'lumotni yuklab bo'lmadi. <Button onClick={() => refetch()}>Qayta urinish</Button></div>`; aks holda `fresh ? <CenterActivityCards .../> : <CenterActivityCardsSkeleton />`, `fresh?.heat && <CenterActivityHeat data={fresh.heat} branches={fresh.branches} onBranch={(id) => setFilters({ filial: id })} />`, ikki jadval yonma-yon (`grid gap-4 lg:grid-cols-2`), `CenterActivityMonths`, izohlar: `fresh.notes.deletedLater > 0` → «shundan {n} ta guruh keyin o'chirilgan» (`text-xs text-muted-foreground`), `fresh.notes.unplaced > 0` → «{n} ta guruhga xona yoki o'rin soni belgilanmagan». Bo'sh holat: `fresh && fresh.rooms.length === 0` → «Bu oyda xonasi bor ochiq guruh yo'q — oyni o'zgartirib ko'ring» (kartalar o'rniga). Yangi kodda `space-y-*` yo'q: tashqi qatlam `flex flex-col gap-4`.

- [ ] **Step 6: Sahifani ulash va eski kodni o'chirish**

1. `app/(dashboard)/reports/activity/page.tsx`: `CenterActivityClient` o'rniga `CenterActivityPage` (`@/components/reports/center-activity/center-activity-page`), `<Suspense fallback={null}>` qoladi.
2. `git rm` bilan «Files → Delete» ro'yxatidagi 11 faylni o'chir.
3. `lib/reports-nav.ts`: `title: "Markaz faoliyat statistikasi"` → `"Markaz faoliyati"`. `lib/breadcrumb-routes.ts`: `activity` yorlig'i «Markaz faoliyati» (hozirgi qiymatni o'qib, shunga almashtir).
4. `lib/uzbek-only-texts.test.ts`: eski `KPI_TOOLTIPS`, `TABLE_TOOLTIPS` importini va ularga tegishli `["KPI_TOOLTIPS", …]`, `["TABLE_TOOLTIPS", …]` qatorlarini olib tashla; `center-activity-format.ts`ning `HEAT_CLASS` testi allaqachon Task 9 da bor. Yangi sahifa matnlari ingliz so'zlarini o'z ichiga olmasligi uchun shu testning `ENGLISH` regexini `center-activity` papkasining `*.tsx` fayllariga qo'llaydigan blok qo'sh (shu fayldagi boshqa papkalarni skanerlaydigan testning o'ziga o'xshab; mavjud andozani o'qing: `grep -n "readdirSync" -B3 -A12 client/src/lib/uzbek-only-texts.test.ts`).

- [ ] **Step 7: Tekshirish**

Run:
```bash
cd client && npx tsc --noEmit -p . && npx vitest run src/components/reports/center-activity src/lib && npx eslint src/components/reports/center-activity "src/app/(dashboard)/reports/activity" src/lib --quiet && git checkout -- AGENTS.md 2>/dev/null; true
```
Expected: tsc xatosiz, testlar PASS, eslint 0 xato.

- [ ] **Step 8: Commit**

```bash
git add -A client && git commit -m "feat(center-activity): the new page, old components removed

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Hujjatlar — ADR, qo'llanma, CLAUDE.md

**Files:**
- Create: `docs/adr/0098-markaz-faoliyati-bitta-malumot-toplami.md`
- Modify: `docs/adr/README.md`
- Create: `client/src/qollanma/kontent/hisobotlar/markaz-faoliyati.mdx`
- Modify: `client/src/qollanma/sahifalar/hisobotlar.ts`, `client/src/qollanma/yangiliklar.ts`
- Modify: `server/CLAUDE.md`, `client/CLAUDE.md`

- [ ] **Step 1: Shablonni o'qi**

Run: `cat docs/adr/0096-kpi-natijasi.md | head -60 && grep -n "0096\|0095" docs/adr/README.md && sed -n 1,40p client/src/qollanma/sahifalar/hisobotlar.ts && cat client/src/qollanma/kontent/hisobotlar/guruhlar-tolovi.mdx | head -30 && sed -n 1,20p client/src/qollanma/yangiliklar.ts`
Expected: ADR shabloni (bo'limlar: Holat, Sana, Kontekst, Qaror, Oqibatlar, Ma'lum cheklovlar), README jadval qatori formati, qo'llanma reyestri yozuvi va yangiliklar yozuvi shakli.

- [ ] **Step 2: ADR-0098 yoz** (o'zbekcha, ADR-0096 bo'limlari bilan). Mazmuni:
  - **Kontekst:** eski `/reports/activity` o'tgan oylarda yopilgan/o'chirilgan guruhlarni yo'qotardi (hozirgi holat), haftani 7 kun deb hisoblardi, «bo'sh o'rin»ni xona bo'yicha eng katta guruhdan olardi, kartalar takrorlanardi; «qachon xona bo'sh» savoliga javob yo'q edi.
  - **Qaror:** (1) bitta ma'lumot to'plami `CenterFacts` + sof `evaluateCenter`; hamma blok shundan. (2) `asOf` = oy oxiri/hozir; guruh ochiqligi `StatusHistory` + `deletedAt` + sanalar bo'yicha, shuning uchun keyin yopilgan/o'chirilgan guruhlar o'tgan oyda hisobga kiradi. (3) Hafta du–sha, ish vaqti filial sozlamasidan; bayram odatiy haftani o'zgartirmaydi. (4) Dars soati 30 daqiqalik to'plam, ish oynasiga qirqiladi. (5) O'rin guruh bo'yicha: `Σ min(o'quvchi, sig'im)`. (6) Tushum taxmini faqat oylik kurslar, shu kundagi narx. (7) Eski `GET /reports/center-activity` olib tashlandi; yangi `overview` va `excel`, `reports.students`, `@BranchScope()`; kesh yo'q. (8) Sig'im tahriri Sozlamalar → Xonalar'da qoladi.
  - **Ma'lum cheklovlar:** guruhning xona tarixi yozilmaydi (hozirgi `roomId` olinadi); xona holati tarixi yo'q (o'tgan oy uchun faqat mavjudlik); snapshot bo'lmasa hozirgi qiymat; moliyaviy Excel'ning «Xonalar bandligi»/«Guruhlar to'ldirilishi» varaqlari (`getRoomUtilization`) o'z ta'rifida qoladi va bu hisobotdan farq qilishi mumkin; `endDate` kuni guruh oy oxiri soniyasida yopiq hisoblanadi.
  - Holat: «Qabul qilindi», sana 2026-10-17. README jadvaliga mos qator qo'sh (0097 mavjud bo'lmasa ham 0098 qatori alifbo/raqam tartibida; 7a'ning 0097 qatori boshqa PR'da — qator qo'shishda konflikt bo'lsa merge paytida hal qilinadi).

- [ ] **Step 3: Qo'llanma sahifasi** (`markaz-faoliyati.mdx`, `guruhlar-tolovi.mdx` uslubida, `# h1` YO'Q, `{ } <` belgilarisiz). Mazmun: sahifa nima ko'rsatadi (3 karta, «qachon xona bo'sh» jadvali va uni qanday o'qish, xonalar, bo'sh o'rni bor guruhlar, oylar); qoidalar (hafta du–sha, ish vaqti filial sozlamasidan; bandlik = dars soati / ish soati; to'lganlik o'quvchi / o'rin; o'chirilgan guruhlar o'tgan oylarda hisobga kirishi; taxminiy tushum faqat oylik kurslar); «Guruhsiz o'quvchilarni joylashtirish» havolasi qayerga olib borishi; xona sig'imini Sozlamalar → Xonalar'da o'zgartirish. Hech qanday haqiqiy raqam yozilmaydi. Reyestr yozuvi: `sahifalar/hisobotlar.ts` ga qo'shni yozuv (`guruhlar-tolovi`) shaklida yangi yozuv (`yollar: ["/reports/activity"]`, `adr: ["0098"]`, `yangilangan: "2026-10-17"`, `qisqacha` bir jumla, rollar `guruhlar-tolovi` bilan bir xil emas: CEO va filial direktori, `kpi`/`ketgan` yozuvidagi rollar maydonini andoza qil). `yangiliklar.ts` ga bitta yozuv: «Markaz faoliyati hisoboti yangilandi: bo'sh xonalar jadvali, o'tgan oylar to'liq».

- [ ] **Step 4: CLAUDE.md yangilash**
  - `server/CLAUDE.md`: «Activity Report Snapshots» bo'limidagi «Powers the `/reports/activity` page» va «Reads» (`reports-center-activity.service.ts — loadSnapshots()`...) paragrafini yangi `reports/center-activity/center-facts.loader.ts` + `center-points.ts` ga moslab o'zgartir (snapshot jadvallari va yozuv hooklari o'zgarmaydi); «Holidays» bo'limidagi `buildHolidayDateSetsByBranch` tavsifidan «`/reports/activity`» ni olib tashla; «Reports Module» ostiga bitta bandli bo'lim qo'sh: «**Markaz faoliyati (`GET /reports/center-activity/overview|excel`, `reports.students`, `@BranchScope()`, bo'sh qamrov 403, ADR-0098)** — `reports/center-activity/`: `CenterFactsLoader` bir marta o'qiydi, `evaluateCenter` sof funksiya, `buildOverview` hamma blokni bitta natijadan yig'adi (parite testi). …» (qoidalar: `asOf`, guruh ochiqligi, hafta du–sha, o'rin guruh bo'yicha, kesh yo'q, eski yo'l olib tashlangan, moliyaviy Excel varaqlari o'z ta'rifida).
  - `client/CLAUDE.md`: yangi bo'lim «### Center activity report (`/reports/activity`, ADR-0098)» — fayllar ro'yxati, URL kalitlari (`oy`, `filial`), bitta so'rov, hech narsa hisoblanmaydi, jadvallar sahifalanadi, sig'im tahriri bu sahifada yo'q (Sozlamalar → Xonalar). «Charts» bo'limidagi eski `center-activity` havolasi bo'lsa olib tashla.

- [ ] **Step 5: Tekshirish**

Run:
```bash
cd client && npx vitest run src/qollanma && npx tsc --noEmit -p .
```
Expected: PASS (reyestr testlari: `yollar` haqiqiy marshrutga mos, `# h1` yo'q, `adr` ro'yxati mavjud ADR'ga ishora qiladi).

- [ ] **Step 6: Commit**

```bash
git add -A docs client server/CLAUDE.md && git commit -m "docs: ADR-0098, guide page and CLAUDE.md for the center-activity report

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Yakuniy tekshiruv va soxta API bilan ko'rik

**Files:** yo'q (tekshiruv). Skrinshotlar scratchpad'da.

- [ ] **Step 1: Server hammasi (parallel EMAS: avval build, keyin test)**

```bash
cd server && npm run typecheck && npm run build && npx eslint src --quiet && npx jest --runInBand 2>&1 | tail -20
```
Expected: typecheck/build xatosiz, eslint 0 xato, testlar PASS (ma'lum beqaror: `payments-list.service.spec` «exactly 20 000 rows» yuk ostida; yolg'iz o'tadi — u bilan bog'liq emas).

- [ ] **Step 2: Mijoz hammasi**

```bash
cd client && npx tsc --noEmit -p . && npx vitest run && npx eslint src --quiet 2>&1 | tail -5; git checkout -- AGENTS.md 2>/dev/null; true
```
Expected: PASS, eslint `0 errors`.

- [ ] **Step 3: Soxta API bilan brauzer tekshiruvi**

`/private/tmp/claude-501/.../scratchpad/b7b-mock/` da (7a'dagi `b7a-mock` andozasi: `mock.js` + `shots.js`, Playwright `~/.npm/_npx/6bcb61ec6d5aea22/node_modules/playwright-core`) soxta API (port 4119, CORS `x-branch-id` ruxsati bilan) `GET /reports/center-activity/overview` ga to'qilgan javob bersin (9 xona, issiqlik matritsasi, 12 guruh, 5 oy; ism va raqamlar to'qilgan), `/permissions/me`, `/branches`, `/notifications*` shu andozada. `next dev` 3119 da. Skrinshotlar: joriy oy, o'tgan oy (`?oy=2026-09`), ikki filial (tanlagich bilan), telefon, qorong'u, xato (500). Playwright `console.error`/`pageerror` bo'lmasligini tekshir. Serverlarni to'xtat, `client/AGENTS.md` ni `git checkout` bilan tikla.

- [ ] **Step 4: Parite izi** — soxta javobda kartadagi soat = jadval yig'indisi ekanini brauzerda `javascript_tool`/Playwright bilan bir marta tekshir (kartadagi «N soat» vs jadvaldagi soatlar yig'indisi).

- [ ] **Step 5: Tozalash va xotira**

Worktree toza (`git status`), SDD ish papkasi o'chiriladi (agar ishlatilgan bo'lsa), xotira yangilanadi (`project_b_toplam_sahifalar.md`, `MEMORY.md`). CEO'ga skrinshotlar yuboriladi, «PR ochaymi?» deb so'raladi. Push, PR, merge, deploy — faqat CEO «ha» dagandan keyin.
