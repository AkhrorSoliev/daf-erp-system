# Ketgan o'quvchi — yagona ta'rif (1-bosqich): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «Ketgan o'quvchi» ni bitta sof funksiya (ADR-0035) bilan hisoblash va
`/reports/departed-students`, bosh sahifa «O'quvchilar» kartasi hamda Excel
«KPI paneli» ni shu bitta manbaga o'tkazish.

**Architecture:** `EnrollmentStateLog` va `StatusHistory` → `loadDepartures`
(yuklovchi, filial qamrovi zanjir shaklida) → `buildDepartureEpisodes` (sof,
Prisma'siz) → iste'molchilar (`summary`, `dynamics`, `list`, `by-status`,
`group-by`, `getKpis`). Migratsiya yo'q. Client'da faqat turlar, yozuvlar,
tooltiplar va bitta «kutilmoqda» belgisi o'zgaradi.

**Tech Stack:** NestJS + Prisma 7.5 (PostgreSQL, `@prisma/adapter-pg`), Jest
(ts-jest, `isolatedModules`), supertest; Next.js 16 + React 19 + TanStack Query,
vitest (client, faqat `node` muhiti).

**Spec:** [2026-09-25-ketgan-oquvchi-tarifi-design.md](../specs/2026-09-25-ketgan-oquvchi-tarifi-design.md)

## Global Constraints

- **Til:** yangi kod izohlari, test nomlari, commit xabarlari, PR matni — **inglizcha** (foydalanuvchi qoidasi, 22.09). UI, Excel va ADR matni — lotin o'zbekcha. Reja matni o'zbekcha.
- **Ish joyi:** `/Users/a1111/Desktop/daf-erp-system`, shox `feat/ketganlar-tarifi`. Server buyruqlari `server/` ichidan, client buyruqlari `client/` ichidan.
- **Har commit** oxirida `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Faqat aniq fayllar `git add` qilinadi — `git add -A` / `git add .` ishlatilmaydi.
- **Migratsiya yo'q.** `prisma/schema.prisma` ga tegilmaydi.
- **N:** `DEPARTURE_GRACE_DAYS = 14` (vaqtincha, Task 0 da prod o'lchovi bilan tasdiqlanadi). UI va Excel matnlarida raqam yozilmaydi — `graceDays` / `departureGraceDays` / `leftGraceDays` dan olinadi.
- **Filial qamrovi:** ketganlar endpointlari `ReportBranchIds` (ro'yxat) oladi; bo'sh qamrov → `403 "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q"`.
- **Vaqt:** kun va oy chegaralari faqat `common/date/tashkent` orqali. `setHours(23, 59, 59, …)`, `'T23:59:59.999Z'`, `new Date(query.startDate)` taqiqlangan (`tashkent.single-source.spec.ts`).
- **O'zgarmaydi:** ustoz almashishi endpointlari (`teacher-changes-list`, `departed-after-change`), sabablar endpointlari, «O'quvchilar oqimi» (`getStudentFlow`), Telegram 21:00, `getKpis` dagi boshqa oylik ko'rsatkichlar.
- **Tekshiruv darvozasi (har task oxirida):** tegilgan spec'lar yashil; `npm run typecheck` toza. Oxirida (Task 9): server `npm test`, `npm run typecheck`, `npx eslint src` — 0 error, `npm run build`; client `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Fayl xaritasi

| Fayl | Nima | Task |
|---|---|---|
| `server/src/students/shared/enrollment-status-on.ts` (+ `.spec.ts`) | Yozuvning berilgan paytdagi statusi — yagona funksiya | 1 |
| `server/src/reports/reports-center-activity.service.ts` | `statusOn` yangi funksiyani chaqiradi | 1 |
| `server/src/students/shared/departure-episodes.ts` (+ `.spec.ts`) | Ta'rif: hodisalar → epizodlar; `departuresInRange`, `openEpisodes` | 2 |
| `server/src/reports/shared/departures.loader.ts` (+ `.spec.ts`) | Jurnallar → hodisalar → epizodlar, `activeAtStart` | 3 |
| `server/src/reports/reports-departed-students.service.ts` (+ yangi `.spec.ts`) | `summary`, `dynamics`, ustoz metrikasi qamrovi | 4, 6 |
| `server/src/reports/dto/departed-students-range-query.dto.ts` | `dynamics` DTO (sana oralig'i) | 4 |
| `server/src/reports/reports-departed-lists.service.ts` (+ yangi `.spec.ts`) | `list`, `by-status`, `group-by` — ochiq epizodlar | 5 |
| `server/src/reports/shared/departed-status-labels.ts` | Status yorliqlari (dataset'dan ko'chiriladi) | 5 |
| `server/src/reports/shared/departed-students-dataset.ts` (+ `.spec.ts`) | **O'chiriladi** | 5 |
| `server/src/reports/reports.service.ts`, `reports.controller.ts` (+ spec'lar) | Fasad imzolari, qamrov, DTO | 4, 5 |
| `server/src/reports/reports-overview.service.ts` | `getKpis`: `churnedThisMonth`, `pendingDepartures`, `departureGraceDays` | 6 |
| `server/src/reports/reports-excel.operational-sheets.ts` | «KPI paneli» qatorlari | 6 |
| `server/src/dashboard/dashboard-summary.{types,service}.ts` (+ spec) | `leftPending`, `leftGraceDays` | 6 |
| `client/src/components/reports/departed-students/*` | Turlar, yozuvlar, dinamika davri, «kutilmoqda» | 7 |
| `client/src/components/dashboard/{dashboard-summary-types.ts,home-people-stats.tsx}` | Karta izohi | 7 |
| `docs/adr/0035-ketgan-oquvchi-tarifi.md`, `docs/adr/README.md`, `CONTEXT.md` | Hujjatlar | 8 |

---

### Task 0: Tayyorgarlik

**Files:** yo'q (holat tekshiruvi).

- [ ] **Step 1: #552 birlashtirilganini tekshirish**

Run: `gh pr view 552 --json state -q .state`
Expected: `MERGED`. Agar `OPEN` bo'lsa — to'xtang va foydalanuvchidan birlashtirishni so'rang (ikkalasi ham `reports.controller.ts` ga tegadi).

- [ ] **Step 2: Shoxni yangilash**

```bash
cd /Users/a1111/Desktop/daf-erp-system && git fetch origin && git rebase origin/main
```

Expected: konfliktsiz; `git log --oneline -3` da dizayn va reja commit'lari `origin/main` ustida.

- [ ] **Step 3: Prisma client va boshlang'ich holat**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server && npx prisma generate && npm test 2>&1 | tail -5 && npm run typecheck
```

Expected: hamma test yashil (suite/test sonini yozib qo'ying), typecheck toza.

- [ ] **Step 4: N ni tasdiqlash**

Foydalanuvchi prod'da ishga tushirgan `scripts/_probe-departure-gaps.ts` natijasini oling. Qoida: `2)` jadvalidagi `kaskad = false`, `chegaradan keyin` qatorlaridan — **qaytganlar** (`z) qaytmagan` dan boshqa hamma bucket) ichida jamlanma ulush 90% ga yetgan eng kichik bucket chegarasini toping (`a)` → 1, `b)` → 3, `c)` → 7, `d)` → 14, `e)` → 30, `f)` → 60 kun). `3)` jadvalidagi `keyingi_status = ACTIVE` qatorlari uchun ham shunday. Ikkalasining kattasini 7 / 14 / 21 / 30 dan yuqoriga yaxlitlang.
Natija 14 dan farq qilsa, Task 2 Step 3 dagi `DEPARTURE_GRACE_DAYS` qiymatini shu songa qo'ying (testlar 7…30 oralig'idagi har qanday N da ishlaydigan qilib yozilgan). Hisoblangan ulushlarni Task 8 uchun yozib qo'ying. Natija hali bo'lmasa — 14 bilan davom eting, Task 8 da qayta ko'riladi.

---

### Task 1: `enrollmentStatusOn` — yagona funksiya

**Files:**
- Create: `server/src/students/shared/enrollment-status-on.ts`
- Create: `server/src/students/shared/enrollment-status-on.spec.ts`
- Modify: `server/src/reports/reports-center-activity.service.ts` (`private statusOn`, ~942-qator)

**Interfaces:**
- Produces: `enrollmentStatusOn(events: readonly EnrollmentStatusEvent[] | undefined, date: Date, fallback: EnrollmentStatusFallback): string | null`; `interface EnrollmentStatusEvent { status: string; transitionAt: Date }`; `interface EnrollmentStatusFallback { createdAt: Date; statusChangedAt: Date | null; status: string }`.

- [ ] **Step 1: Yiqiladigan test**

`server/src/students/shared/enrollment-status-on.spec.ts`:

```ts
import { enrollmentStatusOn } from './enrollment-status-on';

const at = (s: string) => new Date(s);

describe('enrollmentStatusOn', () => {
  const events = [
    { status: 'ACTIVE', transitionAt: at('2026-05-01T09:00:00Z') },
    { status: 'FROZEN', transitionAt: at('2026-06-10T09:00:00Z') },
    { status: 'ACTIVE', transitionAt: at('2026-06-20T09:00:00Z') },
  ];
  const unused = {
    createdAt: at('2000-01-01T00:00:00Z'),
    statusChangedAt: null,
    status: 'ACTIVE',
  };

  it('reads the latest logged status at or before the instant', () => {
    expect(enrollmentStatusOn(events, at('2026-06-15T00:00:00Z'), unused)).toBe('FROZEN');
    expect(enrollmentStatusOn(events, at('2026-07-01T00:00:00Z'), unused)).toBe('ACTIVE');
  });

  it('counts a transition logged exactly at the instant', () => {
    expect(enrollmentStatusOn(events, at('2026-06-10T09:00:00Z'), unused)).toBe('FROZEN');
  });

  it('returns null before the first logged transition', () => {
    expect(enrollmentStatusOn(events, at('2026-04-30T00:00:00Z'), unused)).toBeNull();
  });

  describe('an enrollment with no log rows', () => {
    const legacy = {
      createdAt: at('2026-05-01T09:00:00Z'),
      statusChangedAt: at('2026-06-01T09:00:00Z'),
      status: 'DROPPED',
    };

    it('does not exist before it was created', () => {
      expect(enrollmentStatusOn([], at('2026-04-01T00:00:00Z'), legacy)).toBeNull();
    });

    it('is ACTIVE between creation and its status change', () => {
      expect(enrollmentStatusOn(undefined, at('2026-05-15T00:00:00Z'), legacy)).toBe('ACTIVE');
    });

    it('has its current status from the status change on', () => {
      expect(enrollmentStatusOn(undefined, at('2026-06-01T09:00:00Z'), legacy)).toBe('DROPPED');
    });

    it('stays ACTIVE when it never recorded when it closed', () => {
      expect(
        enrollmentStatusOn(undefined, at('2026-09-01T00:00:00Z'), {
          ...legacy,
          statusChangedAt: null,
        }),
      ).toBe('ACTIVE');
    });
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `npx jest src/students/shared/enrollment-status-on.spec.ts`
Expected: FAIL — `Cannot find module './enrollment-status-on'`.

- [ ] **Step 3: Funksiya**

`server/src/students/shared/enrollment-status-on.ts`:

```ts
/**
 * The status an enrollment had at a given instant — the one implementation.
 *
 * Source: `EnrollmentStateLog` rows, ascending by `transitionAt`. A legacy
 * enrollment with no log rows falls back to its own columns: ACTIVE from
 * `createdAt`, then its current status from `statusChangedAt`. A closed
 * enrollment that never recorded `statusChangedAt` therefore reads as ACTIVE
 * forever; that is the activity report's long-standing behaviour and is kept
 * here, not changed.
 *
 * Shared by the activity report and the departures loader so the two cannot
 * disagree about who was in a group on a given day.
 */
export interface EnrollmentStatusEvent {
  status: string;
  transitionAt: Date;
}

export interface EnrollmentStatusFallback {
  createdAt: Date;
  statusChangedAt: Date | null;
  status: string;
}

export function enrollmentStatusOn(
  events: readonly EnrollmentStatusEvent[] | undefined,
  date: Date,
  fallback: EnrollmentStatusFallback,
): string | null {
  if (events && events.length > 0) {
    let last: string | null = null;
    for (const e of events) {
      if (e.transitionAt.getTime() <= date.getTime()) last = e.status;
      else break;
    }
    return last;
  }
  if (fallback.createdAt.getTime() > date.getTime()) return null;
  if (
    fallback.status !== 'ACTIVE' &&
    fallback.statusChangedAt &&
    fallback.statusChangedAt.getTime() <= date.getTime()
  ) {
    return fallback.status;
  }
  return 'ACTIVE';
}
```

- [ ] **Step 4: Test o'tadi**

Run: `npx jest src/students/shared/enrollment-status-on.spec.ts`
Expected: PASS (8 test).

- [ ] **Step 5: `center-activity` ni ulash**

`server/src/reports/reports-center-activity.service.ts` — importlarga qo'shing:

```ts
import {
  enrollmentStatusOn,
  type EnrollmentStatusFallback,
} from '../students/shared/enrollment-status-on';
```

`private statusOn(...)` ni butunlay almashtiring (izohi bilan birga):

```ts
  /** Status active on `date`; see `enrollmentStatusOn` for the legacy fallback. */
  private statusOn(
    enrollmentId: string,
    date: Date,
    snaps: SnapshotMaps,
    fallback: EnrollmentStatusFallback,
  ): string | null {
    return enrollmentStatusOn(
      snaps.enrollmentEvents.get(enrollmentId),
      date,
      fallback,
    );
  }
```

- [ ] **Step 6: Faoliyat hisoboti yashil**

Run: `npx jest src/reports/reports-center-activity.service.spec.ts src/students/shared/enrollment-status-on.spec.ts && npm run typecheck`
Expected: PASS, typecheck toza.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system && git add server/src/students/shared/enrollment-status-on.ts server/src/students/shared/enrollment-status-on.spec.ts server/src/reports/reports-center-activity.service.ts && git commit -m "$(cat <<'EOF'
Share the enrollment status-on-date rule with the departures loader

Moves the activity report's private statusOn, legacy fallback included, into
students/shared so the departures loader reads group membership the same way.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Ta'rif — `buildDepartureEpisodes`

**Files:**
- Create: `server/src/students/shared/departure-episodes.ts`
- Create: `server/src/students/shared/departure-episodes.spec.ts`

**Interfaces:**
- Produces:
  - `const DEPARTURE_GRACE_DAYS = 14`
  - `type StopKind = 'EXPELLED' | 'ARCHIVED' | 'FROZEN' | 'LEFT_GROUP'`
  - `type StudentEvent = { studentId: number; at: Date; type: 'STOP'; kind: StopKind } | { studentId: number; at: Date; type: 'RETURN' }`
  - `interface DepartureEpisode { studentId: number; startedAt: Date; stopKind: StopKind; state: 'pending' | 'confirmed'; confirmedAt: Date | null; returnedAt: Date | null }`
  - `buildDepartureEpisodes(events: readonly StudentEvent[], opts: { graceDays: number; now: Date }): DepartureEpisode[]`
  - `departuresInRange(episodes: readonly DepartureEpisode[], range: { gte: Date; lt: Date }, floor: Date | null): DepartureEpisode[]` — tasdiqlangan, `startedAt` oraliqda va chegaradan keyin; har o'quvchidan eng erta bittasi.
  - `openEpisodes(episodes: readonly DepartureEpisode[]): DepartureEpisode[]` — `returnedAt === null`.

- [ ] **Step 1: Yiqiladigan testlar**

`server/src/students/shared/departure-episodes.spec.ts`:

```ts
import {
  buildDepartureEpisodes,
  departuresInRange,
  openEpisodes,
  type DepartureEpisode,
  type StopKind,
  type StudentEvent,
} from './departure-episodes';

const at = (s: string) => new Date(s);
const GRACE = 14;
const NOW = at('2026-09-25T12:00:00Z');

const stop = (studentId: number, when: string, kind: StopKind): StudentEvent => ({
  studentId,
  at: at(when),
  type: 'STOP',
  kind,
});
const back = (studentId: number, when: string): StudentEvent => ({
  studentId,
  at: at(when),
  type: 'RETURN',
});
const build = (events: StudentEvent[]) =>
  buildDepartureEpisodes(events, { graceDays: GRACE, now: NOW });

describe('buildDepartureEpisodes', () => {
  it('counts an expulsion on its own day', () => {
    expect(build([stop(1, '2026-09-01T10:00:00Z', 'EXPELLED')])).toEqual([
      {
        studentId: 1,
        startedAt: at('2026-09-01T10:00:00Z'),
        stopKind: 'EXPELLED',
        state: 'confirmed',
        confirmedAt: at('2026-09-01T10:00:00Z'),
        returnedAt: null,
      },
    ]);
  });

  it('counts archiving an active student on its own day', () => {
    const [episode] = build([stop(1, '2026-09-24T10:00:00Z', 'ARCHIVED')]);
    expect(episode.state).toBe('confirmed');
    expect(episode.confirmedAt).toEqual(at('2026-09-24T10:00:00Z'));
  });

  it('keeps a group leaver pending while the grace period runs', () => {
    expect(build([stop(1, '2026-09-20T10:00:00Z', 'LEFT_GROUP')])).toEqual([
      {
        studentId: 1,
        startedAt: at('2026-09-20T10:00:00Z'),
        stopKind: 'LEFT_GROUP',
        state: 'pending',
        confirmedAt: null,
        returnedAt: null,
      },
    ]);
  });

  it('confirms a group leaver who did not come back within the grace period', () => {
    const [episode] = build([stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP')]);
    expect(episode.state).toBe('confirmed');
    expect(episode.confirmedAt).toEqual(at('2026-09-15T10:00:00Z'));
  });

  it('forgets a stop the student came back from within the grace period', () => {
    expect(
      build([
        stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP'),
        back(1, '2026-09-04T10:00:00Z'),
      ]),
    ).toEqual([]);
  });

  it('keeps a late return as a departure and records when they came back', () => {
    expect(
      build([
        stop(1, '2026-08-01T10:00:00Z', 'LEFT_GROUP'),
        back(1, '2026-08-21T10:00:00Z'),
      ]),
    ).toEqual([
      {
        studentId: 1,
        startedAt: at('2026-08-01T10:00:00Z'),
        stopKind: 'LEFT_GROUP',
        state: 'confirmed',
        confirmedAt: at('2026-08-15T10:00:00Z'),
        returnedAt: at('2026-08-21T10:00:00Z'),
      },
    ]);
  });

  it('treats a return exactly at the end of the grace period as a departure', () => {
    const [episode] = build([
      stop(1, '2026-08-01T10:00:00Z', 'FROZEN'),
      back(1, '2026-08-15T10:00:00Z'),
    ]);
    expect(episode.state).toBe('confirmed');
    expect(episode.returnedAt).toEqual(at('2026-08-15T10:00:00Z'));
  });

  it('forgets a freeze the student came back from one second before the end', () => {
    expect(
      build([
        stop(1, '2026-08-01T10:00:00Z', 'FROZEN'),
        back(1, '2026-08-15T09:59:59Z'),
      ]),
    ).toEqual([]);
  });

  it('merges stops before a return: dated by the first, named by the strongest', () => {
    expect(
      build([
        stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP'),
        stop(1, '2026-09-05T10:00:00Z', 'EXPELLED'),
      ]),
    ).toEqual([
      {
        studentId: 1,
        startedAt: at('2026-09-01T10:00:00Z'),
        stopKind: 'EXPELLED',
        state: 'confirmed',
        confirmedAt: at('2026-09-05T10:00:00Z'),
        returnedAt: null,
      },
    ]);
  });

  it('confirms an open freeze the moment the student is archived', () => {
    const [episode] = build([
      stop(1, '2026-09-20T10:00:00Z', 'FROZEN'),
      stop(1, '2026-09-22T10:00:00Z', 'ARCHIVED'),
    ]);
    expect(episode.startedAt).toEqual(at('2026-09-20T10:00:00Z'));
    expect(episode.stopKind).toBe('ARCHIVED');
    expect(episode.confirmedAt).toEqual(at('2026-09-22T10:00:00Z'));
  });

  it('ignores joining a first group', () => {
    const episodes = build([
      back(1, '2026-03-01T10:00:00Z'),
      stop(1, '2026-06-01T10:00:00Z', 'LEFT_GROUP'),
    ]);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].startedAt).toEqual(at('2026-06-01T10:00:00Z'));
  });

  it('keeps every episode of a student who left twice', () => {
    const episodes = build([
      stop(1, '2026-05-01T10:00:00Z', 'LEFT_GROUP'),
      back(1, '2026-06-01T10:00:00Z'),
      stop(1, '2026-08-01T10:00:00Z', 'FROZEN'),
    ]);
    expect(
      episodes.map((e) => [e.startedAt.toISOString(), e.returnedAt?.toISOString() ?? null]),
    ).toEqual([
      ['2026-05-01T10:00:00.000Z', '2026-06-01T10:00:00.000Z'],
      ['2026-08-01T10:00:00.000Z', null],
    ]);
  });

  it('cancels a stop and a return logged at the same instant', () => {
    expect(
      build([
        back(1, '2026-09-01T10:00:00Z'),
        stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP'),
      ]),
    ).toEqual([]);
  });

  it('counts an expulsion even when the student is re-admitted quickly', () => {
    const [episode] = build([
      stop(1, '2026-09-01T10:00:00Z', 'EXPELLED'),
      back(1, '2026-09-03T10:00:00Z'),
    ]);
    expect(episode.state).toBe('confirmed');
    expect(episode.confirmedAt).toEqual(at('2026-09-01T10:00:00Z'));
    expect(episode.returnedAt).toEqual(at('2026-09-03T10:00:00Z'));
  });

  it('builds each student independently', () => {
    const episodes = build([
      stop(1, '2026-09-01T10:00:00Z', 'LEFT_GROUP'),
      stop(2, '2026-09-02T10:00:00Z', 'EXPELLED'),
      back(1, '2026-09-03T10:00:00Z'),
    ]);
    expect(episodes.map((e) => e.studentId)).toEqual([2]);
  });
});

describe('departuresInRange', () => {
  const episode = (
    studentId: number,
    startedAt: string,
    state: 'pending' | 'confirmed' = 'confirmed',
  ): DepartureEpisode => ({
    studentId,
    startedAt: at(startedAt),
    stopKind: 'LEFT_GROUP',
    state,
    confirmedAt: state === 'confirmed' ? at(startedAt) : null,
    returnedAt: null,
  });
  // September 2026 in Tashkent.
  const september = {
    gte: at('2026-08-31T19:00:00Z'),
    lt: at('2026-09-30T19:00:00Z'),
  };

  it('counts confirmed departures started inside the range, once per student', () => {
    const result = departuresInRange(
      [
        episode(1, '2026-09-02T10:00:00Z'),
        episode(1, '2026-09-20T10:00:00Z'),
        episode(2, '2026-09-10T10:00:00Z'),
      ],
      september,
      null,
    );
    expect(result.map((e) => [e.studentId, e.startedAt.toISOString()])).toEqual([
      [1, '2026-09-02T10:00:00.000Z'],
      [2, '2026-09-10T10:00:00.000Z'],
    ]);
  });

  it('leaves out pending departures', () => {
    expect(
      departuresInRange([episode(1, '2026-09-20T10:00:00Z', 'pending')], september, null),
    ).toEqual([]);
  });

  it('includes the range start and excludes its exclusive end', () => {
    const result = departuresInRange(
      [episode(1, '2026-08-31T19:00:00Z'), episode(2, '2026-09-30T19:00:00Z')],
      september,
      null,
    );
    expect(result.map((e) => e.studentId)).toEqual([1]);
  });

  it('drops departures before the reporting floor', () => {
    const result = departuresInRange(
      [episode(1, '2026-09-02T10:00:00Z'), episode(2, '2026-09-20T10:00:00Z')],
      september,
      at('2026-09-15T00:00:00Z'),
    );
    expect(result.map((e) => e.studentId)).toEqual([2]);
  });
});

describe('openEpisodes', () => {
  it('keeps only the episodes the student has not come back from', () => {
    const open: DepartureEpisode = {
      studentId: 1,
      startedAt: at('2026-09-01T10:00:00Z'),
      stopKind: 'LEFT_GROUP',
      state: 'confirmed',
      confirmedAt: at('2026-09-15T10:00:00Z'),
      returnedAt: null,
    };
    const returned: DepartureEpisode = {
      ...open,
      studentId: 2,
      returnedAt: at('2026-09-20T10:00:00Z'),
    };
    expect(openEpisodes([open, returned])).toEqual([open]);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `npx jest src/students/shared/departure-episodes.spec.ts`
Expected: FAIL — `Cannot find module './departure-episodes'`.

- [ ] **Step 3: Ta'rif**

`server/src/students/shared/departure-episodes.ts`:

```ts
/**
 * What "a departed student" means — the one definition (ADR-0035).
 *
 * Expulsion and archiving count on the day. Leaving the last group and being
 * frozen count on the day they happened, unless the student is back within
 * the grace period; then there was no departure. Stops before a return belong
 * to one episode, dated by the first and named by the strongest.
 *
 * This file only turns events into episodes and reads nothing:
 * `reports/shared/departures.loader.ts` collects the events from the logs.
 * The report, the home card and the Excel KPI sheet all read this function;
 * do not restate the rule anywhere else.
 */

export const DEPARTURE_GRACE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type StopKind = 'EXPELLED' | 'ARCHIVED' | 'FROZEN' | 'LEFT_GROUP';

export type StudentEvent =
  | { studentId: number; at: Date; type: 'STOP'; kind: StopKind }
  | { studentId: number; at: Date; type: 'RETURN' };

export interface DepartureEpisode {
  studentId: number;
  /** The first stop — the departure date. */
  startedAt: Date;
  /** The strongest stop in the episode. */
  stopKind: StopKind;
  state: 'pending' | 'confirmed';
  confirmedAt: Date | null;
  returnedAt: Date | null;
}

/** These do not wait for the grace period. */
const IMMEDIATE: ReadonlySet<StopKind> = new Set(['EXPELLED', 'ARCHIVED']);

/** When one episode holds several stops, the heaviest names it. */
const WEIGHT: Record<StopKind, number> = {
  LEFT_GROUP: 1,
  FROZEN: 2,
  EXPELLED: 3,
  ARCHIVED: 4,
};

interface OpenEpisode {
  studentId: number;
  startedAt: Date;
  stopKind: StopKind;
  immediateAt: Date | null;
}

export function buildDepartureEpisodes(
  events: readonly StudentEvent[],
  opts: { graceDays: number; now: Date },
): DepartureEpisode[] {
  const graceMs = opts.graceDays * DAY_MS;
  const byStudent = new Map<number, StudentEvent[]>();
  for (const e of events) {
    const list = byStudent.get(e.studentId);
    if (list) list.push(e);
    else byStudent.set(e.studentId, [e]);
  }

  const episodes: DepartureEpisode[] = [];
  for (const list of byStudent.values()) {
    // At one instant a stop sorts before a return, so the return closes it.
    const sorted = [...list].sort(
      (a, b) =>
        a.at.getTime() - b.at.getTime() ||
        (a.type === b.type ? 0 : a.type === 'STOP' ? -1 : 1),
    );
    let open: OpenEpisode | null = null;
    for (const ev of sorted) {
      if (ev.type === 'STOP') {
        if (!open) {
          open = {
            studentId: ev.studentId,
            startedAt: ev.at,
            stopKind: ev.kind,
            immediateAt: IMMEDIATE.has(ev.kind) ? ev.at : null,
          };
        } else {
          if (WEIGHT[ev.kind] > WEIGHT[open.stopKind]) open.stopKind = ev.kind;
          if (!open.immediateAt && IMMEDIATE.has(ev.kind)) {
            open.immediateAt = ev.at;
          }
        }
        continue;
      }
      if (!open) continue; // joining a first group opens nothing
      const graceEnd = new Date(open.startedAt.getTime() + graceMs);
      if (open.immediateAt) {
        episodes.push(closed(open, open.immediateAt, ev.at));
      } else if (ev.at.getTime() >= graceEnd.getTime()) {
        episodes.push(closed(open, graceEnd, ev.at));
      }
      // Otherwise the student came back in time: no departure.
      open = null;
    }
    if (open) {
      const graceEnd = new Date(open.startedAt.getTime() + graceMs);
      const confirmedAt =
        open.immediateAt ??
        (opts.now.getTime() >= graceEnd.getTime() ? graceEnd : null);
      episodes.push({
        studentId: open.studentId,
        startedAt: open.startedAt,
        stopKind: open.stopKind,
        state: confirmedAt ? 'confirmed' : 'pending',
        confirmedAt,
        returnedAt: null,
      });
    }
  }
  return episodes;
}

function closed(
  open: OpenEpisode,
  confirmedAt: Date,
  returnedAt: Date,
): DepartureEpisode {
  return {
    studentId: open.studentId,
    startedAt: open.startedAt,
    stopKind: open.stopKind,
    state: 'confirmed',
    confirmedAt,
    returnedAt,
  };
}

/**
 * Confirmed departures that started in `[gte, lt)` and not before the
 * reporting floor (ADR-0005). One per student — the earliest.
 */
export function departuresInRange(
  episodes: readonly DepartureEpisode[],
  range: { gte: Date; lt: Date },
  floor: Date | null,
): DepartureEpisode[] {
  const from = Math.max(range.gte.getTime(), floor?.getTime() ?? -Infinity);
  const first = new Map<number, DepartureEpisode>();
  for (const e of episodes) {
    if (e.state !== 'confirmed') continue;
    const t = e.startedAt.getTime();
    if (t < from || t >= range.lt.getTime()) continue;
    const seen = first.get(e.studentId);
    if (!seen || t < seen.startedAt.getTime()) first.set(e.studentId, e);
  }
  return [...first.values()];
}

/** Episodes the student has not come back from; at most one per student. */
export function openEpisodes(
  episodes: readonly DepartureEpisode[],
): DepartureEpisode[] {
  return episodes.filter((e) => e.returnedAt === null);
}
```

- [ ] **Step 4: Testlar o'tadi**

Run: `npx jest src/students/shared/departure-episodes.spec.ts && npm run typecheck`
Expected: PASS (21 test), typecheck toza.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system && git add server/src/students/shared/departure-episodes.ts server/src/students/shared/departure-episodes.spec.ts && git commit -m "$(cat <<'EOF'
Define a departed student in one pure function

Expulsion and archiving count on the day; leaving the last group and freezing
count on the day they happened unless the student is back within the grace
period. Stops before a return form one episode.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Yuklovchi — `loadDepartures`

**Files:**
- Create: `server/src/reports/shared/departures.loader.ts`
- Create: `server/src/reports/shared/departures.loader.spec.ts`

**Interfaces:**
- Consumes: Task 1 `enrollmentStatusOn`, `EnrollmentStatusEvent`; Task 2 `buildDepartureEpisodes`, `DEPARTURE_GRACE_DAYS`, `DepartureEpisode`, `StopKind`, `StudentEvent`; `getSystemStartDate` (`common/finance/system-start-date.ts`); `studentBranchWhere`, `ReportBranchIds` (`common/finance/report-branch-scope.ts`).
- Produces: `loadDepartures(prisma: PrismaService | Prisma.TransactionClient, companyId: number, scope: ReportBranchIds, opts?: { activeAt?: Date; now?: Date }): Promise<LoadedDepartures>`; `interface LoadedDepartures { episodes: DepartureEpisode[]; activeAtStart: number; floor: Date | null; graceDays: number }`. `activeAtStart` — `max(activeAt, floor)` paytida `ACTIVE` yozuvi bor o'quvchilar; `activeAt` berilmasa `0`.

- [ ] **Step 1: Yiqiladigan testlar**

`server/src/reports/shared/departures.loader.spec.ts`:

```ts
import { PrismaService } from '../../prisma/prisma.service';
import { DEPARTURE_GRACE_DAYS } from '../../students/shared/departure-episodes';
import { loadDepartures } from './departures.loader';

const at = (s: string) => new Date(s);
const NOW = at('2026-11-20T12:00:00Z');
const MAY = '2026-05-01T09:00:00.000Z';

interface Fixture {
  students?: { id: number; status: string; statusChangedAt: Date | null }[];
  enrollments?: {
    id: string;
    studentId: number;
    status: string;
    createdAt: Date;
    statusChangedAt: Date | null;
  }[];
  logs?: { enrollmentId: string; status: string; transitionAt: Date }[];
  history?: {
    entityId: string;
    fromStatus: string | null;
    toStatus: string;
    createdAt: Date;
  }[];
  systemStartDate?: Date | null;
}

function fakePrisma(f: Fixture) {
  return {
    company: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ systemStartDate: f.systemStartDate ?? null }),
    },
    student: { findMany: jest.fn().mockResolvedValue(f.students ?? []) },
    enrollment: { findMany: jest.fn().mockResolvedValue(f.enrollments ?? []) },
    enrollmentStateLog: { findMany: jest.fn().mockResolvedValue(f.logs ?? []) },
    statusHistory: { findMany: jest.fn().mockResolvedValue(f.history ?? []) },
  };
}

const student = (id: number, status = 'ACTIVE', statusChangedAt: string | null = null) => ({
  id,
  status,
  statusChangedAt: statusChangedAt ? at(statusChangedAt) : null,
});
const enrollment = (
  id: string,
  studentId: number,
  status: string,
  statusChangedAt: string | null,
  createdAt = MAY,
) => ({
  id,
  studentId,
  status,
  createdAt: at(createdAt),
  statusChangedAt: statusChangedAt ? at(statusChangedAt) : null,
});
const log = (enrollmentId: string, status: string, when: string) => ({
  enrollmentId,
  status,
  transitionAt: at(when),
});
const history = (studentId: number, fromStatus: string | null, toStatus: string, when: string) => ({
  entityId: String(studentId),
  fromStatus,
  toStatus,
  createdAt: at(when),
});

async function episodesOf(f: Fixture) {
  const prisma = fakePrisma(f);
  const result = await loadDepartures(prisma as unknown as PrismaService, 1001, null, { now: NOW });
  return result.episodes.map((e) => ({
    studentId: e.studentId,
    startedAt: e.startedAt.toISOString(),
    stopKind: e.stopKind,
    state: e.state,
  }));
}

describe('loadDepartures', () => {
  it('reads students through the branch scope, never PROSPECT or deleted cards', async () => {
    const prisma = fakePrisma({});
    await loadDepartures(prisma as unknown as PrismaService, 1001, [3, 7], { now: NOW });
    expect(prisma.student.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 1001,
        deletedAt: null,
        status: { not: 'PROSPECT' },
        branches: { some: { branchId: { in: [3, 7] } } },
      },
      select: { id: true, status: true, statusChangedAt: true },
    });
  });

  it('stops after the student query when nobody is in scope', async () => {
    const prisma = fakePrisma({});
    const result = await loadDepartures(prisma as unknown as PrismaService, 1001, null, { now: NOW });
    expect(result).toEqual({
      episodes: [],
      activeAtStart: 0,
      floor: null,
      graceDays: DEPARTURE_GRACE_DAYS,
    });
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    expect(prisma.statusHistory.findMany).not.toHaveBeenCalled();
  });

  it('chains every later query to the students it found', async () => {
    const prisma = fakePrisma({ students: [student(10001), student(10002)] });
    await loadDepartures(prisma as unknown as PrismaService, 1001, [3], { now: NOW });
    expect(prisma.enrollment.findMany.mock.calls[0][0].where).toEqual({
      studentId: { in: [10001, 10002] },
      deletedAt: null,
    });
    expect(prisma.enrollmentStateLog.findMany.mock.calls[0][0].where).toEqual({
      enrollment: { studentId: { in: [10001, 10002] }, deletedAt: null },
    });
    expect(prisma.statusHistory.findMany.mock.calls[0][0].where).toEqual({
      entityType: 'Student',
      entityId: { in: ['10001', '10002'] },
    });
  });

  it('turns leaving the last group into a departure', async () => {
    expect(
      await episodesOf({
        students: [student(10001)],
        enrollments: [enrollment('e1', 10001, 'DROPPED', '2026-08-01T09:00:00Z')],
        logs: [log('e1', 'ACTIVE', MAY), log('e1', 'DROPPED', '2026-08-01T09:00:00Z')],
      }),
    ).toEqual([
      { studentId: 10001, startedAt: '2026-08-01T09:00:00.000Z', stopKind: 'LEFT_GROUP', state: 'confirmed' },
    ]);
  });

  it('does not treat a transfer as leaving', async () => {
    expect(
      await episodesOf({
        students: [student(10001)],
        enrollments: [
          enrollment('e1', 10001, 'TRANSFERRED', '2026-06-01T09:00:00.000Z'),
          enrollment('e2', 10001, 'ACTIVE', null, '2026-06-01T09:00:00.005Z'),
        ],
        logs: [
          log('e1', 'ACTIVE', MAY),
          log('e1', 'TRANSFERRED', '2026-06-01T09:00:00.000Z'),
          log('e2', 'ACTIVE', '2026-06-01T09:00:00.005Z'),
        ],
      }),
    ).toEqual([]);
  });

  it('does not treat a finished group or archiving a graduate as leaving', async () => {
    expect(
      await episodesOf({
        students: [student(10001, 'ARCHIVED')],
        enrollments: [enrollment('e1', 10001, 'COMPLETED', '2026-07-01T09:00:00Z')],
        logs: [log('e1', 'ACTIVE', MAY), log('e1', 'COMPLETED', '2026-07-01T09:00:00Z')],
        history: [
          history(10001, 'ACTIVE', 'GRADUATED', '2026-07-01T09:00:01Z'),
          history(10001, 'GRADUATED', 'ARCHIVED', '2026-08-01T09:00:00Z'),
        ],
      }),
    ).toEqual([]);
  });

  it('names an expulsion by the status, not by the enrollment it closed', async () => {
    expect(
      await episodesOf({
        students: [student(10001, 'EXPELLED')],
        enrollments: [enrollment('e1', 10001, 'DROPPED', '2026-09-10T09:00:00.000Z')],
        logs: [log('e1', 'ACTIVE', MAY), log('e1', 'DROPPED', '2026-09-10T09:00:00.000Z')],
        history: [history(10001, 'ACTIVE', 'EXPELLED', '2026-09-10T09:00:00.100Z')],
      }),
    ).toEqual([
      { studentId: 10001, startedAt: '2026-09-10T09:00:00.000Z', stopKind: 'EXPELLED', state: 'confirmed' },
    ]);
  });

  it('forgets a freeze the student came back from within the grace period', async () => {
    expect(
      await episodesOf({
        students: [student(10001)],
        enrollments: [enrollment('e1', 10001, 'ACTIVE', '2026-08-06T09:00:00Z')],
        logs: [
          log('e1', 'ACTIVE', MAY),
          log('e1', 'FROZEN', '2026-08-01T09:00:00Z'),
          log('e1', 'ACTIVE', '2026-08-06T09:00:00Z'),
        ],
        history: [
          history(10001, 'ACTIVE', 'FROZEN', '2026-08-01T09:00:00Z'),
          history(10001, 'FROZEN', 'ACTIVE', '2026-08-06T09:00:00Z'),
        ],
      }),
    ).toEqual([]);
  });

  it('completes a log that never recorded the closing from the row', async () => {
    expect(
      await episodesOf({
        students: [student(10001)],
        enrollments: [enrollment('e1', 10001, 'DROPPED', '2026-08-01T09:00:00Z')],
        logs: [log('e1', 'ACTIVE', MAY)],
      }),
    ).toEqual([
      { studentId: 10001, startedAt: '2026-08-01T09:00:00.000Z', stopKind: 'LEFT_GROUP', state: 'confirmed' },
    ]);
  });

  it('reads an enrollment with no log rows from its columns', async () => {
    expect(
      await episodesOf({
        students: [student(10001)],
        enrollments: [enrollment('e1', 10001, 'DROPPED', '2026-08-01T09:00:00Z')],
      }),
    ).toEqual([
      { studentId: 10001, startedAt: '2026-08-01T09:00:00.000Z', stopKind: 'LEFT_GROUP', state: 'confirmed' },
    ]);
  });

  it('reads a legacy expulsion from the card when StatusHistory has no row', async () => {
    expect(
      await episodesOf({ students: [student(10001, 'EXPELLED', '2026-08-01T09:00:00Z')] }),
    ).toEqual([
      { studentId: 10001, startedAt: '2026-08-01T09:00:00.000Z', stopKind: 'EXPELLED', state: 'confirmed' },
    ]);
  });

  it('does not read a legacy ARCHIVED card as a departure', async () => {
    expect(
      await episodesOf({ students: [student(10001, 'ARCHIVED', '2026-08-01T09:00:00Z')] }),
    ).toEqual([]);
  });

  it('counts who was in a group at the start, moved up to the reporting floor', async () => {
    const prisma = fakePrisma({
      systemStartDate: at('2026-06-01T00:00:00Z'),
      students: [student(10001), student(10002)],
      enrollments: [
        enrollment('e1', 10001, 'DROPPED', '2026-06-10T09:00:00Z'),
        enrollment('e2', 10002, 'ACTIVE', null, '2026-06-05T09:00:00Z'),
      ],
      logs: [
        log('e1', 'ACTIVE', MAY),
        log('e1', 'DROPPED', '2026-06-10T09:00:00Z'),
        log('e2', 'ACTIVE', '2026-06-05T09:00:00Z'),
      ],
    });
    const result = await loadDepartures(prisma as unknown as PrismaService, 1001, null, {
      now: NOW,
      activeAt: at('2026-05-15T00:00:00Z'),
    });
    // At the floor (01.06) only 10001 is in a group; 10002 joins on 05.06.
    expect(result.activeAtStart).toBe(1);
    expect(result.floor).toEqual(at('2026-06-01T00:00:00Z'));
  });
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `npx jest src/reports/shared/departures.loader.spec.ts`
Expected: FAIL — `Cannot find module './departures.loader'`.

- [ ] **Step 3: Yuklovchi**

`server/src/reports/shared/departures.loader.ts`:

```ts
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ReportBranchIds,
  studentBranchWhere,
} from '../../common/finance/report-branch-scope';
import { getSystemStartDate } from '../../common/finance/system-start-date';
import {
  enrollmentStatusOn,
  type EnrollmentStatusEvent,
} from '../../students/shared/enrollment-status-on';
import {
  buildDepartureEpisodes,
  DEPARTURE_GRACE_DAYS,
  type DepartureEpisode,
  type StopKind,
  type StudentEvent,
} from '../../students/shared/departure-episodes';

type PrismaLike = PrismaService | Prisma.TransactionClient;

export interface LoadedDepartures {
  episodes: DepartureEpisode[];
  /** Students with an ACTIVE enrollment at `activeAt`, moved up to the floor; 0 when not asked. */
  activeAtStart: number;
  /** `Company.systemStartDate` (ADR-0005), or null. */
  floor: Date | null;
  graceDays: number;
}

interface StudentRow {
  id: number;
  status: string;
  statusChangedAt: Date | null;
}

interface EnrollmentRow {
  id: string;
  studentId: number;
  status: string;
  createdAt: Date;
  statusChangedAt: Date | null;
}

interface HistoryRow {
  entityId: string;
  fromStatus: string | null;
  toStatus: string;
  createdAt: Date;
}

/** An enrollment closing into one of these did not leave the student groupless. */
const NOT_A_STOP: ReadonlySet<string> = new Set(['COMPLETED', 'TRANSFERRED']);

/**
 * Departure episodes of every student in scope, built from the logs the
 * system already keeps (ADR-0035).
 *
 * Branch scoping is a chain: only the student query carries the branch
 * predicate; every later query reads the ids it returned.
 */
export async function loadDepartures(
  prisma: PrismaLike,
  companyId: number,
  scope: ReportBranchIds,
  opts: { activeAt?: Date; now?: Date } = {},
): Promise<LoadedDepartures> {
  const now = opts.now ?? new Date();
  const graceDays = DEPARTURE_GRACE_DAYS;
  const floor = await getSystemStartDate(prisma, companyId);

  const students: StudentRow[] = await prisma.student.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { not: StudentStatus.PROSPECT },
      ...studentBranchWhere(scope),
    },
    select: { id: true, status: true, statusChangedAt: true },
  });
  if (students.length === 0) {
    return { episodes: [], activeAtStart: 0, floor, graceDays };
  }
  const ids = students.map((s) => s.id);

  const [enrollments, logs, history] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: { in: ids }, deletedAt: null },
      select: {
        id: true,
        studentId: true,
        status: true,
        createdAt: true,
        statusChangedAt: true,
      },
    }),
    prisma.enrollmentStateLog.findMany({
      where: { enrollment: { studentId: { in: ids }, deletedAt: null } },
      select: { enrollmentId: true, status: true, transitionAt: true },
      orderBy: { transitionAt: 'asc' },
    }),
    prisma.statusHistory.findMany({
      where: { entityType: 'Student', entityId: { in: ids.map(String) } },
      select: {
        entityId: true,
        fromStatus: true,
        toStatus: true,
        createdAt: true,
      },
    }),
  ]);

  const logsByEnrollment = new Map<string, EnrollmentStatusEvent[]>();
  for (const l of logs) {
    const list = logsByEnrollment.get(l.enrollmentId);
    const event = { status: l.status, transitionAt: l.transitionAt };
    if (list) list.push(event);
    else logsByEnrollment.set(l.enrollmentId, [event]);
  }
  for (const list of logsByEnrollment.values()) {
    list.sort((a, b) => a.transitionAt.getTime() - b.transitionAt.getTime());
  }
  // Older writers could close an enrollment without logging it; the row still
  // says how and when, so the log is completed from it.
  for (const e of enrollments) {
    const own = logsByEnrollment.get(e.id);
    if (!own || own.length === 0 || !e.statusChangedAt) continue;
    const last = own[own.length - 1];
    if (
      last.status !== e.status &&
      e.statusChangedAt.getTime() >= last.transitionAt.getTime()
    ) {
      own.push({ status: e.status, transitionAt: e.statusChangedAt });
    }
  }

  const enrollmentsByStudent = groupByKey<EnrollmentRow, number>(
    enrollments,
    (e) => e.studentId,
  );
  const historyByStudent = groupByKey<HistoryRow, number>(history, (h) =>
    Number(h.entityId),
  );
  const activeAt =
    opts.activeAt && floor && floor.getTime() > opts.activeAt.getTime()
      ? floor
      : opts.activeAt;

  const events: StudentEvent[] = [];
  let activeAtStart = 0;
  for (const s of students) {
    const own = enrollmentsByStudent.get(s.id) ?? [];
    events.push(...membershipEvents(s.id, own, logsByEnrollment));
    events.push(...statusEvents(s, historyByStudent.get(s.id) ?? []));
    if (
      activeAt &&
      own.some(
        (e) =>
          enrollmentStatusOn(logsByEnrollment.get(e.id), activeAt, e) ===
          'ACTIVE',
      )
    ) {
      activeAtStart += 1;
    }
  }

  return {
    episodes: buildDepartureEpisodes(events, { graceDays, now }),
    activeAtStart,
    floor,
    graceDays,
  };
}

/**
 * Group membership as the union of the student's enrollments: a STOP when
 * the last ACTIVE enrollment closes, a RETURN when one is ACTIVE again.
 * Closing into COMPLETED (graduation) or TRANSFERRED (a new enrollment
 * opened with it) is not a stop.
 */
function membershipEvents(
  studentId: number,
  enrollments: readonly EnrollmentRow[],
  logs: ReadonlyMap<string, EnrollmentStatusEvent[]>,
): StudentEvent[] {
  const instants = new Set<number>();
  for (const e of enrollments) {
    const own = logs.get(e.id);
    if (own && own.length > 0) {
      for (const l of own) instants.add(l.transitionAt.getTime());
    } else {
      instants.add(e.createdAt.getTime());
      if (e.statusChangedAt) instants.add(e.statusChangedAt.getTime());
    }
  }

  const out: StudentEvent[] = [];
  let activeBefore: string[] = [];
  for (const t of [...instants].sort((a, b) => a - b)) {
    const at = new Date(t);
    const statusAt = new Map(
      enrollments.map((e) => [e.id, enrollmentStatusOn(logs.get(e.id), at, e)]),
    );
    const activeNow = enrollments
      .filter((e) => statusAt.get(e.id) === 'ACTIVE')
      .map((e) => e.id);
    if (activeBefore.length > 0 && activeNow.length === 0) {
      const leftForReal = activeBefore.some(
        (id) => !NOT_A_STOP.has(statusAt.get(id) ?? ''),
      );
      if (leftForReal) {
        out.push({ studentId, at, type: 'STOP', kind: 'LEFT_GROUP' });
      }
    } else if (activeBefore.length === 0 && activeNow.length > 0) {
      out.push({ studentId, at, type: 'RETURN' });
    }
    activeBefore = activeNow;
  }
  return out;
}

/** Status stops from StatusHistory, and from the card for legacy data. */
function statusEvents(
  student: StudentRow,
  history: readonly HistoryRow[],
): StudentEvent[] {
  const out: StudentEvent[] = [];
  for (const h of history) {
    const kind = stopKindFor(h.fromStatus, h.toStatus);
    if (kind) {
      out.push({ studentId: student.id, at: h.createdAt, type: 'STOP', kind });
    }
  }
  // A status set before StatusHistory existed. Only EXPELLED and FROZEN are
  // read back from the card: an old ARCHIVED card may be an archived
  // graduate, and its enrollments tell that story anyway.
  const logged = history.some((h) => h.toStatus === student.status);
  const legacyKind: StopKind | null =
    student.status === 'EXPELLED'
      ? 'EXPELLED'
      : student.status === 'FROZEN'
        ? 'FROZEN'
        : null;
  if (!logged && legacyKind && student.statusChangedAt) {
    out.push({
      studentId: student.id,
      at: student.statusChangedAt,
      type: 'STOP',
      kind: legacyKind,
    });
  }
  return out;
}

function stopKindFor(from: string | null, to: string): StopKind | null {
  if (to === 'EXPELLED') return 'EXPELLED';
  if (to === 'FROZEN' && (from === null || from === 'ACTIVE')) return 'FROZEN';
  if (to === 'ARCHIVED' && (from === 'ACTIVE' || from === 'FROZEN')) {
    return 'ARCHIVED';
  }
  return null;
}

function groupByKey<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}
```

- [ ] **Step 4: Testlar o'tadi**

Run: `npx jest src/reports/shared/departures.loader.spec.ts && npm run typecheck`
Expected: PASS (13 test), typecheck toza.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system && git add server/src/reports/shared/departures.loader.ts server/src/reports/shared/departures.loader.spec.ts && git commit -m "$(cat <<'EOF'
Load departure episodes from the enrollment and status logs

Group membership is the union of a student's enrollments; transfers and
finished groups are not stops. Legacy rows fall back to their own columns.
Branch scope is a chain from the student query.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `summary` va `dynamics`

**Files:**
- Create: `server/src/reports/dto/departed-students-range-query.dto.ts`
- Create: `server/src/reports/reports-departed-students.service.spec.ts`
- Modify: `server/src/reports/reports-departed-students.service.ts` (to'liq almashtiriladi)
- Modify: `server/src/reports/reports.service.ts` (`getDepartedStudentsSummary`, `getDepartedStudentsDynamics`)
- Modify: `server/src/reports/reports.controller.ts` (ikki endpoint + `departedScope`)
- Modify: `server/src/reports/reports.controller.spec.ts`
- Modify: `server/src/reports/reports.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 `departuresInRange`, `openEpisodes`; Task 3 `loadDepartures`.
- Produces:
  - `getDepartedStudentsSummary(companyId, { scope: ReportBranchIds; startDate: string; endDate: string })` → `{ departedCount, churnRate, activeAtStart, pendingCount, graceDays, lostRevenue, totalDebt, debtorCount, avgDurationMonths, totalTeacherChanges, departedAfterTeacherChange }`
  - `getDepartedStudentsDynamics(companyId, { scope; startDate; endDate })` → `{ data: { date: string /* 'YYYY-MM-01' */; count: number; provisional: boolean }[] }`
  - `ReportsController.departedScope(scope: ReportBranchIds): ReportBranchIds` (private; bo'sh → `ForbiddenException`)

- [ ] **Step 1: Servis testlari (yiqiladi)**

`server/src/reports/reports-departed-students.service.spec.ts`:

```ts
import { PrismaService } from '../prisma/prisma.service';
import { DEPARTURE_GRACE_DAYS } from '../students/shared/departure-episodes';
import { ReportsDepartedStudentsService } from './reports-departed-students.service';

const at = (s: string) => new Date(s);
const NOW = at('2026-11-20T12:00:00Z');
const MAY = '2026-05-01T09:00:00.000Z';

const student = (id: number, status = 'ACTIVE') => ({ id, status, statusChangedAt: null });
const enrollment = (
  id: string,
  studentId: number,
  status: string,
  statusChangedAt: string | null,
  createdAt = MAY,
) => ({
  id,
  studentId,
  status,
  createdAt: at(createdAt),
  statusChangedAt: statusChangedAt ? at(statusChangedAt) : null,
});
const log = (enrollmentId: string, status: string, when: string) => ({
  enrollmentId,
  status,
  transitionAt: at(when),
});
const statusChange = (studentId: number, toStatus: string, when: string) => ({
  entityId: String(studentId),
  fromStatus: 'ACTIVE',
  toStatus,
  createdAt: at(when),
});

// 10001 left its group 03.09, never back      → September departure
// 10002 expelled 20.09                         → September departure
// 10003 left its group 15.11                   → pending
// 10004 left its group 10.08                   → August departure
// 10005 left 05.09, joined another group 08.09 → no departure
// 10006 still studying
const FIXTURE = {
  students: [
    student(10001),
    student(10002, 'EXPELLED'),
    student(10003),
    student(10004),
    student(10005),
    student(10006),
  ],
  enrollments: [
    enrollment('e1', 10001, 'DROPPED', '2026-09-03T09:00:00.000Z'),
    enrollment('e2', 10002, 'DROPPED', '2026-09-20T09:00:00.000Z'),
    enrollment('e3', 10003, 'DROPPED', '2026-11-15T09:00:00.000Z'),
    enrollment('e4', 10004, 'DROPPED', '2026-08-10T09:00:00.000Z'),
    enrollment('e5', 10005, 'DROPPED', '2026-09-05T09:00:00.000Z'),
    enrollment('e6', 10005, 'ACTIVE', null, '2026-09-08T09:00:00.000Z'),
    enrollment('e7', 10006, 'ACTIVE', null),
  ],
  logs: [
    log('e1', 'ACTIVE', MAY),
    log('e1', 'DROPPED', '2026-09-03T09:00:00.000Z'),
    log('e2', 'ACTIVE', MAY),
    log('e2', 'DROPPED', '2026-09-20T09:00:00.000Z'),
    log('e3', 'ACTIVE', MAY),
    log('e3', 'DROPPED', '2026-11-15T09:00:00.000Z'),
    log('e4', 'ACTIVE', MAY),
    log('e4', 'DROPPED', '2026-08-10T09:00:00.000Z'),
    log('e5', 'ACTIVE', MAY),
    log('e5', 'DROPPED', '2026-09-05T09:00:00.000Z'),
    log('e6', 'ACTIVE', '2026-09-08T09:00:00.000Z'),
    log('e7', 'ACTIVE', MAY),
  ],
  history: [statusChange(10002, 'EXPELLED', '2026-09-20T09:00:00.100Z')],
};

function fakePrisma(
  f: Omit<typeof FIXTURE, 'history'> & {
    history: ReturnType<typeof statusChange>[];
    systemStartDate?: Date | null;
  },
) {
  return {
    company: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ systemStartDate: f.systemStartDate ?? null }),
    },
    student: {
      findMany: jest.fn().mockResolvedValue(f.students),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { balance: -80_000 }, _count: { _all: 2 } }),
      count: jest.fn().mockResolvedValue(0),
    },
    enrollment: {
      findMany: jest.fn().mockResolvedValue(f.enrollments),
      groupBy: jest.fn().mockResolvedValue([
        { studentId: 10001, _min: { startDate: at(MAY), createdAt: at(MAY) } },
        { studentId: 10002, _min: { startDate: at(MAY), createdAt: at(MAY) } },
      ]),
    },
    enrollmentStateLog: { findMany: jest.fn().mockResolvedValue(f.logs) },
    statusHistory: { findMany: jest.fn().mockResolvedValue(f.history) },
    contract: {
      findMany: jest.fn().mockResolvedValue([
        { totalAmount: 1_000_000, paidAmount: 600_000 },
        { totalAmount: 500_000, paidAmount: 700_000 },
      ]),
    },
    groupTeacherHistory: { findMany: jest.fn().mockResolvedValue([]) },
    group: { count: jest.fn().mockResolvedValue(0) },
    attendance: { groupBy: jest.fn().mockResolvedValue([]) },
    lead: { count: jest.fn().mockResolvedValue(0) },
  };
}

describe('ReportsDepartedStudentsService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  describe('getDepartedStudentsSummary', () => {
    it('counts September departures against who was in a group on 1 September', async () => {
      const prisma = fakePrisma(FIXTURE);
      const service = new ReportsDepartedStudentsService(prisma as unknown as PrismaService);

      const result = await service.getDepartedStudentsSummary(1001, {
        scope: null,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(result).toEqual({
        departedCount: 2,
        churnRate: 40,
        activeAtStart: 5,
        pendingCount: 1,
        graceDays: DEPARTURE_GRACE_DAYS,
        lostRevenue: 400_000,
        totalDebt: -80_000,
        debtorCount: 2,
        avgDurationMonths: 4.4,
        totalTeacherChanges: 0,
        departedAfterTeacherChange: 0,
      });
    });

    it('sums debt over the students who have not come back', async () => {
      const prisma = fakePrisma(FIXTURE);
      const service = new ReportsDepartedStudentsService(prisma as unknown as PrismaService);

      await service.getDepartedStudentsSummary(1001, {
        scope: null,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(prisma.student.aggregate).toHaveBeenCalledWith({
        where: { id: { in: [10001, 10002, 10003, 10004] }, balance: { lt: 0 } },
        _sum: { balance: true },
        _count: { _all: true },
      });
    });

    it('scopes teacher changes to the branch list', async () => {
      const prisma = fakePrisma(FIXTURE);
      const service = new ReportsDepartedStudentsService(prisma as unknown as PrismaService);

      await service.getDepartedStudentsSummary(1001, {
        scope: [3, 7],
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(prisma.groupTeacherHistory.findMany.mock.calls[0][0].where.group).toEqual({
        companyId: 1001,
        deletedAt: null,
        branchId: { in: [3, 7] },
      });
    });
  });

  describe('getDepartedStudentsDynamics', () => {
    it('buckets confirmed departures by the Tashkent month they started', async () => {
      const prisma = fakePrisma(FIXTURE);
      const service = new ReportsDepartedStudentsService(prisma as unknown as PrismaService);

      const result = await service.getDepartedStudentsDynamics(1001, {
        scope: null,
        startDate: '2026-07-01',
        endDate: '2026-09-30',
      });

      expect(result).toEqual({
        data: [
          { date: '2026-07-01', count: 0, provisional: false },
          { date: '2026-08-01', count: 1, provisional: false },
          { date: '2026-09-01', count: 2, provisional: false },
        ],
      });
    });

    it('marks the current month provisional and draws no future month', async () => {
      const prisma = fakePrisma(FIXTURE);
      const service = new ReportsDepartedStudentsService(prisma as unknown as PrismaService);

      const result = await service.getDepartedStudentsDynamics(1001, {
        scope: null,
        startDate: '2026-11-01',
        endDate: '2026-12-31',
      });

      expect(result).toEqual({
        data: [{ date: '2026-11-01', count: 0, provisional: true }],
      });
    });

    it('starts at the reporting floor', async () => {
      const prisma = fakePrisma({
        ...FIXTURE,
        systemStartDate: at('2026-08-15T00:00:00Z'),
      });
      const service = new ReportsDepartedStudentsService(prisma as unknown as PrismaService);

      const result = await service.getDepartedStudentsDynamics(1001, {
        scope: null,
        startDate: '2026-07-01',
        endDate: '2026-09-30',
      });

      expect(result).toEqual({
        data: [
          { date: '2026-08-01', count: 0, provisional: false },
          { date: '2026-09-01', count: 2, provisional: false },
        ],
      });
    });
  });
});
```

Run: `npx jest src/reports/reports-departed-students.service.spec.ts`
Expected: FAIL — eski servis `scope`/sanalarni e'tiborsiz qoldiradi va `loadDepartedStudents` shaklini kutadi (masalan `departedCount` 6, `activeAtStart` yo'q).

- [ ] **Step 2: Controller testlari (yiqiladi)**

`server/src/reports/reports.controller.spec.ts` — importlarga `DepartedStudentsSummaryQueryDto` qo'shing:

```ts
import { DepartedStudentsSummaryQueryDto } from './dto/departed-students-summary-query.dto';
```

`describe('branch scope resolver (private)', …)` blokidan oldin qo'shing:

```ts
  describe('departed students — branch scope', () => {
    const september = {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    } as DepartedStudentsSummaryQueryDto;

    it('hands the summary the branch list instead of narrowing it to one branch', async () => {
      await controller.getDepartedStudentsSummary(september, 1001, [3, 7]);
      expect(mockService.getDepartedStudentsSummary).toHaveBeenLastCalledWith(1001, {
        scope: [3, 7],
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });
    });

    it('hands the dynamics chart the date range', async () => {
      await controller.getDepartedStudentsDynamics(
        { startDate: '2026-07-01', endDate: '2026-09-30' },
        1001,
        null,
      );
      expect(mockService.getDepartedStudentsDynamics).toHaveBeenLastCalledWith(1001, {
        scope: null,
        startDate: '2026-07-01',
        endDate: '2026-09-30',
      });
    });

    it('refuses a caller whose scope resolved to no branch', () => {
      expect(() =>
        controller.getDepartedStudentsSummary(september, 1001, []),
      ).toThrow(ForbiddenException);
    });
  });
```

Run: `npx jest src/reports/reports.controller.spec.ts -t "departed students"`
Expected: FAIL — `[3, 7]` uchun `BadRequestException` ("Bir nechta filialga kirish huquqingiz bor…").

- [ ] **Step 3: DTO**

`server/src/reports/dto/departed-students-range-query.dto.ts`:

```ts
import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/** Query for the date-ranged departed-students charts (dynamics). */
export class DepartedStudentsRangeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;
}
```

- [ ] **Step 4: Servis**

`server/src/reports/reports-departed-students.service.ts` ni butunlay almashtiring:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportBranchIds } from '../common/finance/report-branch-scope';
import {
  addMonthsToMonthKey,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
  tashkentRangeUtc,
} from '../common/date/tashkent';
import {
  departuresInRange,
  openEpisodes,
  type DepartureEpisode,
} from '../students/shared/departure-episodes';
import { loadDepartures } from './shared/departures.loader';

const DAY_MS = 24 * 60 * 60 * 1000;
const MS_PER_MONTH = DAY_MS * 30.44;

@Injectable()
export class ReportsDepartedStudentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * KPI cards of /reports/departed-students (ADR-0035). The range decides
   * which departures count; debt and lost revenue describe the students who
   * have not come back, as of today.
   */
  async getDepartedStudentsSummary(
    companyId: number,
    params: { scope: ReportBranchIds; startDate: string; endDate: string },
  ) {
    const range = tashkentRangeUtc(params.startDate, params.endDate);
    const { episodes, activeAtStart, floor, graceDays } = await loadDepartures(
      this.prisma,
      companyId,
      params.scope,
      { activeAt: range.gte },
    );

    const departed = departuresInRange(episodes, range, floor);
    const departedCount = departed.length;
    const pendingCount = episodes.filter((e) => e.state === 'pending').length;
    const churnRate =
      activeAtStart > 0 ? (departedCount / activeAtStart) * 100 : 0;

    const openIds = [
      ...new Set(openEpisodes(episodes).map((e) => e.studentId)),
    ];
    const { totalDebt, debtorCount } = await this.debtOf(openIds);
    const lostRevenue = await this.lostRevenueOf(companyId, openIds);
    const avgDurationMonths = await this.averageStudyMonths(departed);

    const { totalTeacherChanges, departedAfterTeacherChange } =
      await this.getTeacherChangeRetentionMetrics(companyId, {
        scope: params.scope,
        start: range.gte,
        end: range.lt,
      });

    return {
      departedCount,
      churnRate: Math.round(churnRate * 10) / 10,
      activeAtStart,
      pendingCount,
      graceDays,
      lostRevenue,
      totalDebt,
      debtorCount,
      avgDurationMonths: Math.round(avgDurationMonths * 10) / 10,
      totalTeacherChanges,
      departedAfterTeacherChange,
    };
  }

  /**
   * "Ketish dinamikasi" — confirmed departures per Tashkent month of the
   * range. A month reaching into the last `graceDays` is provisional: stops
   * started there may still be confirmed.
   */
  async getDepartedStudentsDynamics(
    companyId: number,
    params: { scope: ReportBranchIds; startDate: string; endDate: string },
  ) {
    const now = new Date();
    const range = tashkentRangeUtc(params.startDate, params.endDate);
    const { episodes, floor, graceDays } = await loadDepartures(
      this.prisma,
      companyId,
      params.scope,
      { now },
    );

    const from = new Date(
      Math.max(range.gte.getTime(), floor?.getTime() ?? -Infinity),
    );
    const until = new Date(Math.min(range.lt.getTime() - 1, now.getTime()));
    if (from.getTime() > until.getTime()) return { data: [] };

    const provisionalAfter = now.getTime() - graceDays * DAY_MS;
    const lastKey = tashkentMonthKey(until);
    const data: { date: string; count: number; provisional: boolean }[] = [];
    for (
      let key = tashkentMonthKey(from);
      key <= lastKey;
      key = addMonthsToMonthKey(key, 1)
    ) {
      const month = tashkentMonthRangeUtc(key);
      const bucket = {
        gte: new Date(Math.max(month.gte.getTime(), range.gte.getTime())),
        lt: new Date(Math.min(month.lt.getTime(), range.lt.getTime())),
      };
      data.push({
        date: `${key}-01`,
        count: departuresInRange(episodes, bucket, floor).length,
        provisional: month.lt.getTime() > provisionalAfter,
      });
    }
    return { data };
  }

  private async debtOf(studentIds: number[]) {
    if (studentIds.length === 0) return { totalDebt: 0, debtorCount: 0 };
    const agg = await this.prisma.student.aggregate({
      where: { id: { in: studentIds }, balance: { lt: 0 } },
      _sum: { balance: true },
      _count: { _all: true },
    });
    return { totalDebt: agg._sum.balance ?? 0, debtorCount: agg._count._all };
  }

  /** Unpaid remainder of still-open contracts; stage 2 removes this card. */
  private async lostRevenueOf(companyId: number, studentIds: number[]) {
    if (studentIds.length === 0) return 0;
    const contracts = await this.prisma.contract.findMany({
      where: {
        companyId,
        deletedAt: null,
        studentId: { in: studentIds },
        status: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      select: { totalAmount: true, paidAmount: true },
    });
    let total = 0;
    for (const c of contracts) {
      const unpaid = c.totalAmount - c.paidAmount;
      if (unpaid > 0) total += unpaid;
    }
    return total;
  }

  /** From each student's very first enrollment to the day they left. */
  private async averageStudyMonths(departed: readonly DepartureEpisode[]) {
    if (departed.length === 0) return 0;
    const firsts = await this.prisma.enrollment.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: departed.map((d) => d.studentId) },
        deletedAt: null,
      },
      _min: { startDate: true, createdAt: true },
    });
    const firstById = new Map(
      firsts.map((f) => [f.studentId, f._min.startDate ?? f._min.createdAt]),
    );
    let sum = 0;
    let count = 0;
    for (const d of departed) {
      const first = firstById.get(d.studentId);
      if (!first) continue;
      const ms = d.startedAt.getTime() - first.getTime();
      if (ms > 0) {
        sum += ms;
        count += 1;
      }
    }
    return count > 0 ? sum / count / MS_PER_MONTH : 0;
  }

  /**
   * Counts teacher changes within the period and how many students "left"
   * within 5 lessons of one — where "left" means the enrollment went DROPPED
   * (guruhsiz qoldi) or FROZEN (muzlatildi). Unchanged in stage 1 apart from
   * taking the branch scope as a list.
   *
   * The 5th-lesson date is read from the distinct `Attendance` dates after
   * the change (the system has no separate Lesson model).
   */
  private async getTeacherChangeRetentionMetrics(
    companyId: number,
    // `end` is EXCLUSIVE: 00:00 Tashkent of the day after the range.
    params: { scope: ReportBranchIds; start: Date; end: Date },
  ) {
    const LESSON_WINDOW = 5;

    const groupWhere: Prisma.GroupWhereInput = {
      companyId,
      deletedAt: null,
    };
    if (params.scope) groupWhere.branchId = { in: params.scope };

    const changes = await this.prisma.groupTeacherHistory.findMany({
      where: {
        createdAt: { gte: params.start, lt: params.end },
        group: groupWhere,
      },
      select: { id: true, groupId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (changes.length === 0) {
      return { totalTeacherChanges: 0, departedAfterTeacherChange: 0 };
    }

    const affectedEnrollmentIds = new Set<string>();

    for (const change of changes) {
      const lessonDates = await this.prisma.attendance.findMany({
        where: {
          groupId: change.groupId,
          date: { gte: change.createdAt },
        },
        distinct: ['date'],
        select: { date: true },
        orderBy: { date: 'asc' },
        take: LESSON_WINDOW,
      });

      if (lessonDates.length === 0) continue;

      const cutoffDate = lessonDates[lessonDates.length - 1].date;

      const departed = await this.prisma.enrollment.findMany({
        where: {
          groupId: change.groupId,
          status: { in: ['DROPPED', 'FROZEN'] },
          deletedAt: null,
          createdAt: { lt: change.createdAt },
          statusChangedAt: { gte: change.createdAt, lte: cutoffDate },
          student: { companyId, deletedAt: null },
        },
        select: { id: true },
      });

      for (const e of departed) affectedEnrollmentIds.add(e.id);
    }

    return {
      totalTeacherChanges: changes.length,
      departedAfterTeacherChange: affectedEnrollmentIds.size,
    };
  }
}
```

- [ ] **Step 5: Fasad**

`server/src/reports/reports.service.ts` — ikki metodni almashtiring:

```ts
  getDepartedStudentsSummary(
    companyId: number,
    params: { scope: ReportBranchIds; startDate: string; endDate: string },
  ) {
    return this.departedStudents.getDepartedStudentsSummary(companyId, params);
  }
  getDepartedStudentsDynamics(
    companyId: number,
    params: { scope: ReportBranchIds; startDate: string; endDate: string },
  ) {
    return this.departedStudents.getDepartedStudentsDynamics(companyId, params);
  }
```

(`ReportBranchIds` fayl boshida allaqachon import qilingan.)

- [ ] **Step 6: Controller**

`server/src/reports/reports.controller.ts` — importlarga:

```ts
import { DepartedStudentsRangeQueryDto } from './dto/departed-students-range-query.dto';
```

`private scoped(...)` metodidan keyin qo'shing:

```ts
  /**
   * Departed-students reports take the resolved scope as a list (ADR-0035),
   * so a caller with several branches gets all of them rather than a 400.
   * An empty scope is refused, never served as zeros (ADR-0002).
   */
  private departedScope(scope: ReportBranchIds): ReportBranchIds {
    if (isEmptyScope(scope)) {
      throw new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      );
    }
    return scope;
  }
```

`getDepartedStudentsSummary` va `getDepartedStudentsDynamics` ni almashtiring:

```ts
  @Get('departed-students/summary')
  getDepartedStudentsSummary(
    @Query() query: DepartedStudentsSummaryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsSummary(companyId, {
      scope: this.departedScope(scope),
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('departed-students/dynamics')
  getDepartedStudentsDynamics(
    @Query() query: DepartedStudentsRangeQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.reportsService.getDepartedStudentsDynamics(companyId, {
      scope: this.departedScope(scope),
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }
```

- [ ] **Step 7: Eski testlarni moslashtirish**

`server/src/reports/reports.service.spec.ts`:

1. `prisma = { … }` ichida `student` qatorini almashtiring va ikki model qo'shing:

```ts
      student: {
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn(),
      },
      enrollmentStateLog: { findMany: jest.fn().mockResolvedValue([]) },
      statusHistory: { findMany: jest.fn().mockResolvedValue([]) },
```

2. `describe('getDepartedStudentsSummary', …)` ichida:
   - `baseParams` → `const baseParams = { scope: null, startDate: '2026-03-01', endDate: '2026-03-31' };` va uning ustidagi izohni `// Only the teacher-change metrics are covered here; departures have their own spec.` bilan almashtiring;
   - `makeDeparted` yordamchisini va quyidagi testlarni **o'chiring**: `'computes departedCount, churnRate, lostRevenue and avgDuration from the snapshot'`, `'sums debt from departed students with a negative balance'`, `'returns zeros when there are no departed students'`, `'scopes the snapshot and the studying count by branch'`, `'caps lost revenue at 0 for overpaid contracts'`;
   - ustoz almashishi testlari (`'counts teacher changes…'`, `'skips teacher changes…'`, `'dedupes students…'`) o'zgarmaydi.
3. `describe('getDepartedStudentsDynamics', …)` blokini butunlay **o'chiring** (yangi spec'da).

- [ ] **Step 8: Hammasi yashil**

Run: `npx jest src/reports/reports-departed-students.service.spec.ts src/reports/reports.controller.spec.ts src/reports/reports.service.spec.ts && npm run typecheck`
Expected: PASS, typecheck toza.

- [ ] **Step 9: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system && git add server/src/reports/dto/departed-students-range-query.dto.ts server/src/reports/reports-departed-students.service.ts server/src/reports/reports-departed-students.service.spec.ts server/src/reports/reports.service.ts server/src/reports/reports.controller.ts server/src/reports/reports.controller.spec.ts server/src/reports/reports.service.spec.ts && git commit -m "$(cat <<'EOF'
Departed report: summary and dynamics read the departure episodes

The KPI cards now count departures in the selected range against the students
in a group at its start; the dynamics chart covers the range and flags months
still inside the grace period. Both take the branch scope as a list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `list`, `by-status`, `group-by` — ochiq epizodlar

**Files:**
- Create: `server/src/reports/shared/departed-status-labels.ts`
- Create: `server/src/reports/reports-departed-lists.service.spec.ts`
- Modify: `server/src/reports/reports-departed-lists.service.ts` (uch metod + importlar; `getDepartedStudentsByReason` o'zgarmaydi)
- Modify: `server/src/reports/reports.service.ts` (uch fasad metodi)
- Modify: `server/src/reports/reports.controller.ts` (uch endpoint)
- Modify: `server/src/reports/reports.controller.spec.ts`
- Modify: `server/src/reports/reports.service.spec.ts`
- Delete: `server/src/reports/shared/departed-students-dataset.ts`, `server/src/reports/shared/departed-students-dataset.spec.ts`

**Interfaces:**
- Consumes: Task 2 `openEpisodes`, `DepartureEpisode`; Task 3 `loadDepartures`; Task 4 `departedScope`.
- Produces:
  - `getDepartedStudentsList(companyId, { scope; status?: StudentStatus; debtorsOnly?: boolean; page?: number; pageSize?: number })` → `{ data: Row[]; total; page; pageSize }`, `Row = { id: string; student: { id; fullName }; phone; status; balance; lastGroup: { id; name } | null; branch: { id; name } | null; course: { id; name } | null; teachers: { id; fullName }[]; departedAt: string; state: 'pending' | 'confirmed'; stopKind: StopKind }`
  - `getDepartedStudentsByStatus(companyId, { scope })` → `{ data: { status; label; count }[]; total }`
  - `getDepartedStudentsGroupBy(companyId, { scope; groupBy })` → `{ data: { id; name; total; segments }[]; uniqueTotal }`
  - `DEPARTED_STATUS_LABELS` (`reports/shared/departed-status-labels.ts`)

- [ ] **Step 1: Servis testlari (yiqiladi)**

`server/src/reports/reports-departed-lists.service.spec.ts`:

```ts
import { PrismaService } from '../prisma/prisma.service';
import { ReportsDepartedListsService } from './reports-departed-lists.service';

const at = (s: string) => new Date(s);
const NOW = at('2026-11-20T12:00:00Z');
const MAY = '2026-05-01T09:00:00.000Z';

const A1 = {
  id: 'g1',
  name: 'A1-01',
  branch: { id: 1, name: "Farg'ona" },
  course: { id: 'c1', name: 'A1' },
  teachers: [{ teacher: { id: 501, firstName: 'Ali', lastName: 'Valiyev' } }],
};
const A2 = {
  id: 'g2',
  name: 'A2-01',
  branch: { id: 1, name: "Farg'ona" },
  course: { id: 'c2', name: 'A2' },
  teachers: [
    { teacher: { id: 501, firstName: 'Ali', lastName: 'Valiyev' } },
    { teacher: { id: 502, firstName: 'Olim', lastName: 'Karimov' } },
  ],
};

// 10001 left 03.09 (confirmed), 10002 expelled 01.11, 10003 left 15.11 (pending),
// 10005 came back in 3 days, 10006 still studying.
const LOADER = {
  students: [10001, 10002, 10003, 10005, 10006].map((id) => ({
    id,
    status: id === 10002 ? 'EXPELLED' : 'ACTIVE',
    statusChangedAt: null,
  })),
  enrollments: [
    { id: 'e1', studentId: 10001, status: 'DROPPED', createdAt: at(MAY), statusChangedAt: at('2026-09-03T09:00:00.000Z') },
    { id: 'e2', studentId: 10002, status: 'DROPPED', createdAt: at(MAY), statusChangedAt: at('2026-11-01T09:00:00.000Z') },
    { id: 'e3', studentId: 10003, status: 'DROPPED', createdAt: at(MAY), statusChangedAt: at('2026-11-15T09:00:00.000Z') },
    { id: 'e5', studentId: 10005, status: 'DROPPED', createdAt: at(MAY), statusChangedAt: at('2026-09-05T09:00:00.000Z') },
    { id: 'e6', studentId: 10005, status: 'ACTIVE', createdAt: at('2026-09-08T09:00:00.000Z'), statusChangedAt: null },
    { id: 'e7', studentId: 10006, status: 'ACTIVE', createdAt: at(MAY), statusChangedAt: null },
  ],
  history: [
    { entityId: '10002', fromStatus: 'ACTIVE', toStatus: 'EXPELLED', createdAt: at('2026-11-01T09:00:00.100Z') },
  ],
};

const DETAILS = [
  { id: 10001, balance: -50_000, status: 'ACTIVE', group: A1 },
  { id: 10002, balance: 0, status: 'EXPELLED', group: A2 },
  { id: 10003, balance: -10_000, status: 'ACTIVE', group: A1 },
].map((s) => ({
  id: s.id,
  firstName: 'Test',
  lastName: String(s.id),
  phone: '901234567',
  status: s.status,
  balance: s.balance,
  enrollments: [{ group: s.group }],
}));

function fakePrisma(loaderStudents = LOADER.students) {
  return {
    company: { findUnique: jest.fn().mockResolvedValue({ systemStartDate: null }) },
    student: {
      // The loader asks for ids and statuses; the lists ask for details.
      findMany: jest.fn((args: { select: object; where: { id?: { in: number[] } } }) =>
        Promise.resolve(
          'firstName' in args.select
            ? DETAILS.filter((d) => args.where.id?.in.includes(d.id))
            : loaderStudents,
        ),
      ),
    },
    enrollment: { findMany: jest.fn().mockResolvedValue(LOADER.enrollments) },
    enrollmentStateLog: { findMany: jest.fn().mockResolvedValue([]) },
    statusHistory: { findMany: jest.fn().mockResolvedValue(LOADER.history) },
  };
}

const service = (prisma: ReturnType<typeof fakePrisma>) =>
  new ReportsDepartedListsService(prisma as unknown as PrismaService);

describe('ReportsDepartedListsService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  describe('getDepartedStudentsList', () => {
    it('lists the students who have not come back, latest departure first', async () => {
      const result = await service(fakePrisma()).getDepartedStudentsList(1001, { scope: null });

      expect(result.total).toBe(3);
      expect(result.data.map((r) => r.id)).toEqual(['10003', '10002', '10001']);
      expect(result.data[0]).toEqual({
        id: '10003',
        student: { id: 10003, fullName: 'Test 10003' },
        phone: '901234567',
        status: 'ACTIVE',
        balance: -10_000,
        lastGroup: { id: 'g1', name: 'A1-01' },
        branch: { id: 1, name: "Farg'ona" },
        course: { id: 'c1', name: 'A1' },
        teachers: [{ id: 501, fullName: 'Ali Valiyev' }],
        departedAt: '2026-11-15T09:00:00.000Z',
        state: 'pending',
        stopKind: 'LEFT_GROUP',
      });
      expect(result.data[1]).toMatchObject({
        departedAt: '2026-11-01T09:00:00.000Z',
        state: 'confirmed',
        stopKind: 'EXPELLED',
      });
    });

    it('filters by status and by debt', async () => {
      const prisma = fakePrisma();
      const ids = async (params: object) =>
        (await service(prisma).getDepartedStudentsList(1001, { scope: null, ...params })).data.map((r) => r.id);

      expect(await ids({ status: 'EXPELLED' })).toEqual(['10002']);
      expect(await ids({ debtorsOnly: true })).toEqual(['10003', '10001']);
      expect(await ids({ status: 'EXPELLED', debtorsOnly: true })).toEqual([]);
    });

    it('pages after filtering', async () => {
      const result = await service(fakePrisma()).getDepartedStudentsList(1001, {
        scope: null,
        page: 2,
        pageSize: 2,
      });
      expect(result).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(result.data.map((r) => r.id)).toEqual(['10001']);
    });

    it('asks for no details when everyone is in a group', async () => {
      const prisma = fakePrisma(
        LOADER.students.filter((s) => s.id === 10006),
      );
      const result = await service(prisma).getDepartedStudentsList(1001, { scope: null });
      expect(result).toEqual({ data: [], total: 0, page: 1, pageSize: 10 });
      expect(prisma.student.findMany).toHaveBeenCalledTimes(1);
    });
  });

  it('breaks the open departures down by student status', async () => {
    expect(
      await service(fakePrisma()).getDepartedStudentsByStatus(1001, { scope: null }),
    ).toEqual({
      data: [
        { status: 'ACTIVE', label: 'Faol (guruhsiz)', count: 2 },
        { status: 'EXPELLED', label: 'Chetlatilgan', count: 1 },
      ],
      total: 3,
    });
  });

  it('groups the open departures by course of the last group', async () => {
    expect(
      await service(fakePrisma()).getDepartedStudentsGroupBy(1001, {
        scope: null,
        groupBy: 'course',
      }),
    ).toEqual({
      data: [
        { id: 'c1', name: 'A1', total: 2, segments: [{ status: 'ACTIVE', label: 'Faol (guruhsiz)', count: 2 }] },
        { id: 'c2', name: 'A2', total: 1, segments: [{ status: 'EXPELLED', label: 'Chetlatilgan', count: 1 }] },
      ],
      uniqueTotal: 3,
    });
  });

  it('counts a student under every teacher of their last group', async () => {
    const result = await service(fakePrisma()).getDepartedStudentsGroupBy(1001, {
      scope: null,
      groupBy: 'teacher',
    });
    expect(result.data.map((b) => [b.name, b.total])).toEqual([
      ['Ali Valiyev', 3],
      ['Olim Karimov', 1],
    ]);
    expect(result.uniqueTotal).toBe(3);
  });
});
```

Run: `npx jest src/reports/reports-departed-lists.service.spec.ts`
Expected: FAIL — eski metodlar `branchId` kutadi va `departedAt`/`state`/`stopKind` qaytarmaydi.

- [ ] **Step 2: Controller testi (yiqiladi)**

`server/src/reports/reports.controller.spec.ts` — importga `DepartedStudentsListQueryDto` qo'shing:

```ts
import { DepartedStudentsListQueryDto } from './dto/departed-students-list-query.dto';
```

`describe('departed students — branch scope', …)` ichiga:

```ts
    it('hands the list the branch list and its own filters', async () => {
      await controller.getDepartedStudentsList(
        {
          status: 'FROZEN',
          debtorsOnly: true,
          page: 2,
          pageSize: 20,
        } as DepartedStudentsListQueryDto,
        1001,
        [3, 7],
      );
      expect(mockService.getDepartedStudentsList).toHaveBeenLastCalledWith(1001, {
        scope: [3, 7],
        status: 'FROZEN',
        debtorsOnly: true,
        page: 2,
        pageSize: 20,
      });
    });
```

Run: `npx jest src/reports/reports.controller.spec.ts -t "departed students"`
Expected: FAIL — `BadRequestException` (bir nechta filial).

- [ ] **Step 3: Yorliqlar**

`server/src/reports/shared/departed-status-labels.ts`:

```ts
import { StudentStatus } from '@prisma/client';

/** Uzbek labels for a departed student's status. ACTIVE here means "active but groupless". */
export const DEPARTED_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Faol (guruhsiz)',
  FROZEN: 'Muzlatilgan',
  EXPELLED: 'Chetlatilgan',
  INACTIVE: 'Nofaol',
  GRADUATED: 'Bitirgan',
  ARCHIVED: 'Arxivlangan',
  PROSPECT: 'Mock orqali kelgan',
};
```

- [ ] **Step 4: Servis**

`server/src/reports/reports-departed-lists.service.ts`:

Importlar bo'limini shunday qiling (`buildDepartedEnrollmentWhere` va `tashkentRangeUtc` `getDepartedStudentsByReason` uchun qoladi):

```ts
import { Injectable } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportBranchIds } from '../common/finance/report-branch-scope';
import { buildDepartedEnrollmentWhere } from './shared/departed-filter';
import { DEPARTED_STATUS_LABELS } from './shared/departed-status-labels';
import { loadDepartures } from './shared/departures.loader';
import { openEpisodes } from '../students/shared/departure-episodes';
import { tashkentRangeUtc } from '../common/date/tashkent';
```

`getDepartedStudentsList` (izohi bilan) ni almashtiring:

```ts
  /**
   * "Qaytmagan ketganlar" — every open departure episode (ADR-0035): the
   * students who stopped and have not come back, pending ones included.
   * Filtered by branch, status and debt; not by the date range.
   */
  async getDepartedStudentsList(
    companyId: number,
    params: {
      scope: ReportBranchIds;
      status?: StudentStatus;
      debtorsOnly?: boolean;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 10));
    // GRADUATED is never a departure, so it is not a valid filter either.
    const status =
      params.status && params.status !== StudentStatus.GRADUATED
        ? params.status
        : undefined;

    const rows = (await this.openRows(companyId, params.scope))
      .filter((r) => !status || r.student.status === status)
      .filter((r) => !params.debtorsOnly || r.student.balance < 0)
      .sort(
        (a, b) =>
          b.episode.startedAt.getTime() - a.episode.startedAt.getTime() ||
          b.student.id - a.student.id,
      );

    const data = rows
      .slice((page - 1) * pageSize, page * pageSize)
      .map(({ episode, student }) => {
        const g = student.enrollments[0]?.group ?? null;
        return {
          id: String(student.id),
          student: {
            id: student.id,
            fullName: `${student.firstName} ${student.lastName}`,
          },
          phone: student.phone,
          status: student.status,
          balance: student.balance,
          lastGroup: g ? { id: g.id, name: g.name } : null,
          branch: g?.branch ?? null,
          course: g?.course ?? null,
          teachers:
            g?.teachers.map((t) => ({
              id: t.teacher.id,
              fullName: `${t.teacher.firstName} ${t.teacher.lastName}`,
            })) ?? [],
          departedAt: episode.startedAt.toISOString(),
          state: episode.state,
          stopKind: episode.stopKind,
        };
      });

    return { data, total: rows.length, page, pageSize };
  }
```

`getDepartedStudentsByStatus` va `getDepartedStudentsGroupBy` ni (izohlari bilan) almashtiring va fayl oxiriga `openRows` ni qo'shing:

```ts
  /** "Holat bo'yicha" — open departures by the student's current status. */
  async getDepartedStudentsByStatus(
    companyId: number,
    params: { scope: ReportBranchIds },
  ) {
    const rows = await this.openRows(companyId, params.scope);
    const counts = new Map<StudentStatus, number>();
    for (const { student } of rows) {
      counts.set(student.status, (counts.get(student.status) ?? 0) + 1);
    }
    const data = [...counts.entries()]
      .map(([status, count]) => ({
        status,
        label: DEPARTED_STATUS_LABELS[status] ?? status,
        count,
      }))
      .sort((a, b) => b.count - a.count);
    return { data, total: rows.length };
  }

  /**
   * "Kesim bo'yicha" — open departures bucketed by the last group's course /
   * teacher / branch, each bucket split by student status. A student sits
   * under every teacher of that group, so `uniqueTotal` is the real count.
   */
  async getDepartedStudentsGroupBy(
    companyId: number,
    params: { scope: ReportBranchIds; groupBy: 'course' | 'teacher' | 'branch' },
  ) {
    const rows = await this.openRows(companyId, params.scope);
    const buckets = new Map<
      string,
      { name: string; segments: Map<StudentStatus, number> }
    >();
    const add = (id: string, name: string, status: StudentStatus) => {
      let bucket = buckets.get(id);
      if (!bucket) {
        bucket = { name, segments: new Map() };
        buckets.set(id, bucket);
      }
      bucket.segments.set(status, (bucket.segments.get(status) ?? 0) + 1);
    };

    for (const { student } of rows) {
      const g = student.enrollments[0]?.group;
      if (!g) continue;
      if (params.groupBy === 'course') {
        add(g.course.id, g.course.name, student.status);
      } else if (params.groupBy === 'branch') {
        add(String(g.branch.id), g.branch.name, student.status);
      } else {
        for (const t of g.teachers) {
          add(
            String(t.teacher.id),
            `${t.teacher.firstName} ${t.teacher.lastName}`,
            student.status,
          );
        }
      }
    }

    const data = [...buckets.entries()]
      .map(([id, bucket]) => {
        const segments = [...bucket.segments.entries()]
          .map(([status, count]) => ({
            status,
            label: DEPARTED_STATUS_LABELS[status] ?? status,
            count,
          }))
          .sort((a, b) => b.count - a.count);
        const total = segments.reduce((sum, s) => sum + s.count, 0);
        return { id, name: bucket.name, total, segments };
      })
      .sort((a, b) => b.total - a.total);

    return { data, uniqueTotal: rows.length };
  }

  /** Open departure episodes with the card and last group of each student. */
  private async openRows(companyId: number, scope: ReportBranchIds) {
    const { episodes } = await loadDepartures(this.prisma, companyId, scope);
    const open = openEpisodes(episodes);
    if (open.length === 0) return [];
    const students = await this.prisma.student.findMany({
      where: { id: { in: open.map((e) => e.studentId) } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        balance: true,
        // The last group the student belonged to.
        enrollments: {
          where: { deletedAt: null },
          orderBy: [
            { statusChangedAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
          take: 1,
          select: {
            group: {
              select: {
                id: true,
                name: true,
                branch: { select: { id: true, name: true } },
                course: { select: { id: true, name: true } },
                teachers: {
                  select: {
                    teacher: {
                      select: { id: true, firstName: true, lastName: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const byId = new Map(students.map((s) => [s.id, s]));
    return open.flatMap((episode) => {
      const student = byId.get(episode.studentId);
      return student ? [{ episode, student }] : [];
    });
  }
```

- [ ] **Step 5: Fasad va controller**

`server/src/reports/reports.service.ts` — uch metodni almashtiring:

```ts
  getDepartedStudentsList(
    companyId: number,
    params: {
      scope: ReportBranchIds;
      status?: StudentStatus;
      debtorsOnly?: boolean;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.departedLists.getDepartedStudentsList(companyId, params);
  }
```

```ts
  getDepartedStudentsByStatus(
    companyId: number,
    params: { scope: ReportBranchIds },
  ) {
    return this.departedLists.getDepartedStudentsByStatus(companyId, params);
  }
  getDepartedStudentsGroupBy(
    companyId: number,
    params: {
      scope: ReportBranchIds;
      groupBy: 'course' | 'teacher' | 'branch';
    },
  ) {
    return this.departedLists.getDepartedStudentsGroupBy(companyId, params);
  }
```

`server/src/reports/reports.controller.ts` — uch endpoint tanasini almashtiring (dekoratorlar va parametrlar o'zgarmaydi).

`getDepartedStudentsByStatus` tanasi:

```ts
    return this.reportsService.getDepartedStudentsByStatus(companyId, {
      scope: this.departedScope(scope),
    });
```

`getDepartedStudentsList` tanasi:

```ts
    return this.reportsService.getDepartedStudentsList(companyId, {
      scope: this.departedScope(scope),
      status: query.status,
      debtorsOnly: query.debtorsOnly,
      page: query.page,
      pageSize: query.pageSize,
    });
```

`getDepartedStudentsGroupBy` tanasi:

```ts
    return this.reportsService.getDepartedStudentsGroupBy(companyId, {
      scope: this.departedScope(scope),
      groupBy: query.groupBy,
    });
```

- [ ] **Step 6: Eski dataset va testlar**

```bash
cd /Users/a1111/Desktop/daf-erp-system && git rm -q server/src/reports/shared/departed-students-dataset.ts server/src/reports/shared/departed-students-dataset.spec.ts
```

`server/src/reports/reports.service.spec.ts` — `describe('getDepartedStudentsList', …)`, `describe('getDepartedStudentsByStatus', …)`, `describe('getDepartedStudentsGroupBy', …)` bloklarini butunlay **o'chiring** (yangi spec'da). `getDepartedStudentsReasons`, `getDepartedStudentsByReason`, `getDepartedAfterTeacherChangeList` bloklari qoladi.

Run: `grep -rn "departed-students-dataset\|loadDepartedStudents" /Users/a1111/Desktop/daf-erp-system/server/src`
Expected: hech narsa.

- [ ] **Step 7: Hammasi yashil**

Run: `npx jest src/reports && npm run typecheck`
Expected: PASS, typecheck toza.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system && git add server/src/reports/shared/departed-status-labels.ts server/src/reports/reports-departed-lists.service.ts server/src/reports/reports-departed-lists.service.spec.ts server/src/reports/reports.service.ts server/src/reports/reports.controller.ts server/src/reports/reports.controller.spec.ts server/src/reports/reports.service.spec.ts && git commit -m "$(cat <<'EOF'
Departed report: the list and its charts show open departure episodes

Students who stopped and have not come back, pending ones flagged, instead of
everyone currently without a group — so a student who never joined a group
is no longer a departure. Replaces the student snapshot dataset.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

(`git rm` bilan o'chirilgan fayllar commit'ga o'zi kiradi.)

---

### Task 6: Bosh sahifa kartasi, Excel KPI, moslik testi

**Files:**
- Modify: `server/src/reports/reports-overview.service.ts` (`getKpis`)
- Modify: `server/src/reports/reports-excel.operational-sheets.ts` (`kpiSheet`)
- Modify: `server/src/dashboard/dashboard-summary.types.ts`, `server/src/dashboard/dashboard-summary.service.ts`, `server/src/dashboard/dashboard-summary.service.spec.ts`
- Modify: `server/src/reports/reports.service.spec.ts` (`getKpis` testlari)
- Modify: `server/src/reports/reports-departed-students.service.spec.ts` (moslik testi)

**Interfaces:**
- Consumes: Task 2 `departuresInRange`, `DEPARTURE_GRACE_DAYS`; Task 3 `loadDepartures`.
- Produces: `getKpis()` qaytaradi `churnedThisMonth` (joriy Toshkent oyidagi tasdiqlangan ketishlar), `pendingDepartures`, `departureGraceDays`; `DashboardPeople.leftPending`, `DashboardPeople.leftGraceDays`.

- [ ] **Step 1: Moslik testi (yiqiladi)**

`server/src/reports/reports-departed-students.service.spec.ts` — importlarga qo'shing:

```ts
import { Workbook } from 'exceljs';
import { RedisService } from '../redis/redis.service';
import { ReportsOverviewService } from './reports-overview.service';
import { kpiSheet } from './reports-excel.operational-sheets';
```

Fayl oxiriga:

```ts
describe('one departure count on every surface', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  // November 2026 is the current month: 10011 expelled 05.11, 10012 archived
  // 10.11, 10013 left its group 18.11 (pending), 10014 left in August.
  const NOVEMBER = {
    students: [
      student(10011, 'EXPELLED'),
      student(10012, 'ARCHIVED'),
      student(10013),
      student(10014),
    ],
    enrollments: [
      enrollment('n1', 10011, 'DROPPED', '2026-11-05T09:00:00.000Z'),
      enrollment('n2', 10012, 'DROPPED', '2026-11-10T09:00:00.000Z'),
      enrollment('n3', 10013, 'DROPPED', '2026-11-18T09:00:00.000Z'),
      enrollment('n4', 10014, 'DROPPED', '2026-08-10T09:00:00.000Z'),
    ],
    logs: [
      log('n1', 'ACTIVE', MAY),
      log('n1', 'DROPPED', '2026-11-05T09:00:00.000Z'),
      log('n2', 'ACTIVE', MAY),
      log('n2', 'DROPPED', '2026-11-10T09:00:00.000Z'),
      log('n3', 'ACTIVE', MAY),
      log('n3', 'DROPPED', '2026-11-18T09:00:00.000Z'),
      log('n4', 'ACTIVE', MAY),
      log('n4', 'DROPPED', '2026-08-10T09:00:00.000Z'),
    ],
    history: [
      statusChange(10011, 'EXPELLED', '2026-11-05T09:00:00.100Z'),
      statusChange(10012, 'ARCHIVED', '2026-11-10T09:00:00.100Z'),
    ],
  };

  it('shows the same November figure on the report, the home card and the Excel sheet', async () => {
    const prisma = fakePrisma(NOVEMBER) as unknown as PrismaService;

    const summary = await new ReportsDepartedStudentsService(prisma).getDepartedStudentsSummary(1001, {
      scope: null,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    const kpis = await new ReportsOverviewService(prisma, {} as RedisService).getKpis(1001, {});
    const wb = new Workbook();
    kpiSheet(wb, kpis, 'Noyabr 2026');
    const row = wb
      .getWorksheet('KPI paneli')!
      .getRows(1, 100)!
      .find((r) => r.getCell(1).value === 'Shu oy ketganlar');

    expect(summary.departedCount).toBe(2);
    expect(kpis.churnedThisMonth).toBe(2);
    expect(row?.getCell(2).value).toBe(2);
    expect(kpis.pendingDepartures).toBe(1);
  });
});
```

Run: `npx jest src/reports/reports-departed-students.service.spec.ts -t "every surface"`
Expected: FAIL — `kpis.churnedThisMonth` eski formula bo'yicha (`0 + 0`), Excel qatori «Shu oy ketganlar (churn)» deb nomlangan (`row` topilmaydi).

- [ ] **Step 2: `getKpis`**

`server/src/reports/reports-overview.service.ts`:

Importlarni shunday qiling:

```ts
import {
  tashkentMonthKey,
  tashkentMonthRangeUtc,
  tashkentRangeFilter,
} from '../common/date/tashkent';
import { departuresInRange } from '../students/shared/departure-episodes';
import { loadDepartures } from './shared/departures.loader';
```

`getKpis` ichida: `Promise.all` natijalar ro'yxatidan `expelledThisMonth,` va `droppedThisMonth,` ni, massivdan esa ularga mos ikki so'rovni (`status: 'EXPELLED'` li `student.count` va `status: 'DROPPED'` li `enrollment.count`) **o'chiring**. `Promise.all` dan keyin qo'shing:

```ts
    // "Shu oy ketganlar" — the one definition of a departure (ADR-0035),
    // counted over the Tashkent month. The other monthly KPIs keep their
    // process-local month start; they are outside this change.
    const departures = await loadDepartures(
      this.prisma,
      companyId,
      query.branchId ? [query.branchId] : null,
      { now },
    );
    const churnedThisMonth = departuresInRange(
      departures.episodes,
      tashkentMonthRangeUtc(tashkentMonthKey(now)),
      departures.floor,
    ).length;
    const pendingDepartures = departures.episodes.filter(
      (e) => e.state === 'pending',
    ).length;
```

Qaytarilayotgan obyektda `churnedThisMonth: expelledThisMonth + droppedThisMonth,` ni almashtiring:

```ts
      churnedThisMonth,
      pendingDepartures,
      departureGraceDays: departures.graceDays,
```

- [ ] **Step 3: Excel «KPI paneli»**

`server/src/reports/reports-excel.operational-sheets.ts` — importga:

```ts
import { DEPARTURE_GRACE_DAYS } from '../students/shared/departure-episodes';
```

`kpiSheet` ichidagi `'Shu oy ketganlar (churn)'` qatorini almashtiring:

```ts
  // Departures follow ADR-0035; the grace period comes with the figures.
  const grace = kpis.departureGraceDays ?? DEPARTURE_GRACE_DAYS;
  kvNum(
    ws,
    'Shu oy ketganlar',
    kpis.churnedThisMonth ?? 0,
    `Chetlatilgan, arxivlangan yoki ${grace} kun ichida qaytmagan (guruhdan chiqarilgan, muzlatilgan).`,
  );
  kvNum(
    ws,
    'Qaytishi kutilmoqda',
    kpis.pendingDepartures ?? 0,
    `Guruhsiz qolgan yoki muzlatilgan, ${grace} kun hali o'tmagan.`,
  );
```

- [ ] **Step 4: Bosh sahifa**

`server/src/dashboard/dashboard-summary.types.ts` — `DashboardPeople` ichida `leftThisMonth: number;` ni almashtiring:

```ts
  /** Departures confirmed this Tashkent month (ADR-0035). */
  leftThisMonth: number;
  /** Stopped within the grace period and not back yet. */
  leftPending: number;
  leftGraceDays: number;
```

`server/src/dashboard/dashboard-summary.service.ts` — `leftThisMonth: kpis.churnedThisMonth,` dan keyin:

```ts
      leftPending: kpis.pendingDepartures,
      leftGraceDays: kpis.departureGraceDays,
```

`server/src/dashboard/dashboard-summary.service.spec.ts` — `kpis` mock'ida `churnedThisMonth: 19,` dan keyin:

```ts
  pendingDepartures: 4,
  departureGraceDays: 14,
```

va `expect(res.people!.activeStudents).toBe(842);` dan keyin:

```ts
    expect(res.people!.leftPending).toBe(4);
    expect(res.people!.leftGraceDays).toBe(14);
```

- [ ] **Step 5: `getKpis` testlarini moslashtirish**

`server/src/reports/reports.service.spec.ts` — importlarga qo'shing:

```ts
import { DEPARTURE_GRACE_DAYS } from '../students/shared/departure-episodes';
```

`describe('getKpis', …)`, birinchi test:
- `.mockResolvedValueOnce(2); // expelled` qatorini o'chiring (`.mockResolvedValueOnce(5); // new students` oxirgisi bo'ladi, nuqta-vergul bilan);
- `prisma.enrollment.count.mockResolvedValue(1);` qatorini o'chiring;
- kutilgan obyektda `churnedThisMonth: 3,` ni almashtiring:

```ts
        churnedThisMonth: 0,
        pendingDepartures: 0,
        departureGraceDays: DEPARTURE_GRACE_DAYS,
```

- [ ] **Step 6: Hammasi yashil**

Run: `npx jest src/reports src/dashboard && npm run typecheck`
Expected: PASS, typecheck toza.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system && git add server/src/reports/reports-overview.service.ts server/src/reports/reports-excel.operational-sheets.ts server/src/dashboard/dashboard-summary.types.ts server/src/dashboard/dashboard-summary.service.ts server/src/dashboard/dashboard-summary.service.spec.ts server/src/reports/reports.service.spec.ts server/src/reports/reports-departed-students.service.spec.ts && git commit -m "$(cat <<'EOF'
Home card and Excel KPI count departures the same way as the report

churnedThisMonth used to add expelled students to dropped enrollment rows,
counting one expulsion twice (audit H30). It now reads the departure
episodes over the Tashkent month, with the pending count alongside. A parity
spec pins the report, the home card and the Excel row to one number.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Client — turlar, yozuvlar, «kutilmoqda»

**Files:**
- Modify: `client/src/components/reports/departed-students/departed-students-kpi-cards.tsx`
- Modify: `client/src/components/reports/departed-students/departed-students-dynamics-chart.tsx` (to'liq almashtiriladi)
- Modify: `client/src/components/reports/departed-students/departed-students-client.tsx`
- Modify: `client/src/components/reports/departed-students/departed-students-table.tsx`
- Modify: `client/src/components/reports/departed-students/departed-students-status-chart.tsx` (tooltip matni)
- Modify: `client/src/components/reports/departed-students/departed-students-group-by-chart.tsx` (tooltip matni)
- Modify: `client/src/components/dashboard/dashboard-summary-types.ts`, `client/src/components/dashboard/home-people-stats.tsx`

**Interfaces:**
- Consumes: Task 4–6 API shakllari (`summary.activeAtStart`, `pendingCount`, `graceDays`; `dynamics.data[].provisional`; list qatori `departedAt`, `state`, `stopKind`; `people.leftPending`, `leftGraceDays`).

Client'da bu komponentlar uchun render testlari yo'q (`vitest.config.mts` — faqat `node`). Darvoza: `npm run typecheck` (turlar API bilan mos) va `npm run lint`.

- [ ] **Step 1: KPI kartalari**

`departed-students-kpi-cards.tsx`:

`DepartedStudentsSummary` ni almashtiring:

```ts
export interface DepartedStudentsSummary {
  churnRate: number;
  departedCount: number;
  /** Students in a group at the start of the range — the churn denominator. */
  activeAtStart: number;
  /** Stopped within the grace period and not back yet. */
  pendingCount: number;
  graceDays: number;
  lostRevenue: number;
  totalDebt: number;
  debtorCount: number;
  avgDurationMonths: number;
  totalTeacherChanges: number;
  departedAfterTeacherChange: number;
}
```

Tooltiplarni almashtiring (`lostRevenueTooltip` o'zgarmaydi):

```ts
  const churnTooltip =
    "Ketish koeffitsienti = Davrda ketganlar ÷ Davr boshida guruhda bo'lganlar × 100.\n" +
    `Misol: ${data.departedCount} ÷ ${data.activeAtStart} → ${data.churnRate.toFixed(1)}%.`;

  const departedTooltip =
    "Tanlangan davrda ketgan o'quvchilar, har biri bir marta.\n" +
    "Chetlatilgan yoki arxivlangan kuni sanaladi. Guruhdan chiqqan yoki muzlatilgan o'quvchi " +
    `${data.graceDays} kun ichida qaytmasa, to'xtagan kuni sanaladi.\n` +
    `Yana ${data.pendingCount} nafari ${data.graceDays} kun ichida qaytmasa qo'shiladi.`;

  const avgDurationTooltip =
    "Davrda ketganlar markazda o'rtacha necha oy o'qigani: birinchi guruhga qo'shilgan kundan ketgan kungacha.";

  const debtTooltip =
    "Hozir qaytmagan ketganlarning markazga qarzi (balansi manfiy bo'lganlar).\n" +
    `${data.debtorCount} ta o'quvchida qarz bor.`;
```

Birinchi kartaning `label="Ketganlar soni"` ni `label="Davrda ketganlar"` ga almashtiring. «Ketish koeffitsienti» kartasidan `valueColor={…}` prop'ini butunlay olib tashlang.

- [ ] **Step 2: Dinamika diagrammasi**

`departed-students-dynamics-chart.tsx` ni butunlay almashtiring:

```tsx
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/lib/api";
import { ChartCard } from "@/components/shared/chart-card";

interface DynamicsPoint {
  date: string;
  count: number;
  /** The month reaches into the grace period; its departures may still grow. */
  provisional: boolean;
}

interface DynamicsResponse {
  data: DynamicsPoint[];
}

interface Props {
  branchId: number | null;
  startDate: string;
  endDate: string;
}

const BAR_COLOR = "#ef4444"; // red-500 — literal so SVG renders reliably
const BAR_COLOR_HOVER = "#dc2626"; // red-600

export function DepartedStudentsDynamicsChart({
  branchId,
  startDate,
  endDate,
}: Props) {
  const params = { branchId: branchId ?? undefined, startDate, endDate };

  const { data, isLoading } = useQuery<DynamicsResponse>({
    queryKey: ["departed-students-dynamics", params],
    queryFn: () =>
      api
        .get<DynamicsResponse>("/reports/departed-students/dynamics", {
          params,
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const { chartData, total, peakLabel, peakCount } = useMemo(() => {
    const rows = (data?.data ?? []).map((d) => {
      const parsed = new Date(d.date + "T00:00:00");
      return {
        ...d,
        label: format(parsed, "MM.yyyy"),
        fullLabel: format(parsed, "MMMM yyyy"),
      };
    });
    const t = rows.reduce((s, r) => s + r.count, 0);
    let peak = { label: "", count: 0 };
    for (const r of rows) {
      if (r.count > peak.count) peak = { label: r.fullLabel, count: r.count };
    }
    return {
      chartData: rows,
      total: t,
      peakLabel: peak.label,
      peakCount: peak.count,
    };
  }, [data]);

  const isEmpty = chartData.length === 0 || chartData.every((d) => d.count === 0);

  return (
    <ChartCard
      title="Ketish dinamikasi"
      subtitle={`Oylik kesim${total > 0 ? ` — jami ${total} ta` : ""}${
        peakCount > 0 ? `, eng yuqori: ${peakLabel} (${peakCount} ta)` : ""
      }`}
      tooltip={
        "Har oyda nechta o'quvchi ketgani — to'xtagan oyi bo'yicha.\n" +
        "Oxirgi kunlarga tushgan oy dastlabki: u yerdagi to'xtashlar hali tasdiqlanmagan.\n" +
        "Tanlangan davr va filialga bo'ysunadi."
      }
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="Tanlangan davrda ketganlar yo'q — davrni kengaytirib ko'ring"
      bodyHeightClass="h-[260px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#e2e8f0"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            cursor={{ fill: "rgba(239, 68, 68, 0.08)" }}
            content={(props) => <DynamicsTooltip {...props} />}
          />
          <Bar
            dataKey="count"
            fill={BAR_COLOR}
            radius={[4, 4, 0, 0]}
            activeBar={{ fill: BAR_COLOR_HOVER }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DynamicsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  // Recharts injects its own loosely-typed payload here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: ReadonlyArray<any>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as
    | { count?: number; fullLabel?: string; provisional?: boolean }
    | undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border bg-popover text-popover-foreground px-3 py-2 text-xs shadow-md min-w-[180px]">
      <div className="text-muted-foreground mb-1">Oy: {row.fullLabel}</div>
      <div className="flex items-center gap-2">
        <span
          className="size-2.5 rounded-full shrink-0"
          style={{ backgroundColor: BAR_COLOR }}
        />
        <span className="flex-1">Ketganlar</span>
        <span className="font-semibold tabular-nums">{row.count ?? 0} ta</span>
      </div>
      {row.provisional && (
        <div className="mt-1 text-muted-foreground">
          Dastlabki — oxirgi kunlardagi to&apos;xtashlar hali tasdiqlanmagan
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Sahifa**

`departed-students-client.tsx`:

`<DepartedStudentsDynamicsChart branchId={filter.branchId} />` ni almashtiring:

```tsx
        <DepartedStudentsDynamicsChart
          branchId={filter.branchId}
          startDate={summaryParams.startDate}
          endDate={summaryParams.endDate}
        />
```

`// The "Ketgan o'quvchilar" list is a student-level snapshot — …` izohini (4 qator) almashtiring:

```tsx
  // The list shows open departure episodes (ADR-0035): students who stopped
  // and have not come back, pending ones included. It is filtered by branch,
  // status and debtors, not by the date range / course / teacher.
```

- [ ] **Step 4: Jadval**

`departed-students-table.tsx`:

`DepartedStudentRow` ichidagi `leftAt` maydonini (izohi bilan) almashtiring:

```ts
  /** The day the student stopped (ADR-0035). */
  departedAt: string;
  /** `pending`: still inside the grace period; coming back cancels it. */
  state: "pending" | "confirmed";
  stopKind: "EXPELLED" | "ARCHIVED" | "FROZEN" | "LEFT_GROUP";
```

Sarlavha: `Ketgan o&apos;quvchilar ro&apos;yxati` → `Qaytmagan ketganlar`.
Ustun: `<TableHead>Guruhsiz qoldi</TableHead>` → `<TableHead>Ketgan sana</TableHead>`.

Bo'sh holat matnini almashtiring:

```tsx
                  {debtorsOnly
                    ? "Qarzdor qaytmagan ketgan topilmadi"
                    : statusFilter === "all"
                      ? "Qaytmagan ketgan o'quvchilar yo'q"
                      : "Bu holat bo'yicha qaytmagan ketgan topilmadi — boshqa holatni tanlang"}
```

Oxirgi katakni (`row.leftAt ? format(…) : "—"`) almashtiring:

```tsx
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {format(new Date(row.departedAt), "dd.MM.yyyy")}
                        {row.state === "pending" && (
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                            title="Qaytish muddati hali tugamagan — qaytsa, ketgan sanalmaydi"
                          >
                            kutilmoqda
                          </Badge>
                        )}
                      </div>
                    </TableCell>
```

- [ ] **Step 5: Diagramma tooltiplari**

`departed-students-status-chart.tsx` — `tooltip={…}` ni almashtiring:

```tsx
      tooltip={
        "Qaytmagan ketganlar holati bo'yicha: guruhsiz faollar, muzlatilganlar, " +
        "chetlatilganlar va arxivlanganlar.\n" +
        "Filial filtriga bo'ysunadi."
      }
```

`departed-students-group-by-chart.tsx` — `tooltip={…}` ning birinchi qatorini almashtiring:

```tsx
          "Tanlangan kesim bo'yicha qaytmagan ketganlar, ichida holat (guruhsiz / muzlatilgan / chetlatilgan) bo'yicha segmentlarga bo'lingan.\n" +
```

- [ ] **Step 6: Bosh sahifa kartasi**

`client/src/components/dashboard/dashboard-summary-types.ts` — `DashboardPeople` ichida `leftThisMonth` ni (izohi bilan) almashtiring:

```ts
  /** Departures confirmed this month (ADR-0035). */
  leftThisMonth: number;
  /** Stopped within the grace period and not back yet. */
  leftPending: number;
  leftGraceDays: number;
```

`client/src/components/dashboard/home-people-stats.tsx`:

`PeopleStatProps` ga `hintTitle?: string;` qo'shing; funksiya imzosini `function PeopleStat({ icon: Icon, label, value, hint, hintTitle, href }: PeopleStatProps)` qiling; izoh `<span>` iga `title={hintTitle}` qo'shing:

```tsx
            <span
              className="ml-1.5 text-xs font-normal text-muted-foreground"
              title={hintTitle}
            >
              {hint}
            </span>
```

«Aktiv o'quvchilar» kartasiga:

```tsx
        hintTitle={
          `Shu oy: +${people.newThisMonth} yangi, −${people.leftThisMonth} ketgan.` +
          (people.leftPending > 0
            ? ` Yana ${people.leftPending} nafari ${people.leftGraceDays} kun ichida qaytmasa qo'shiladi.`
            : "")
        }
```

- [ ] **Step 7: Tekshiruv**

Run: `cd /Users/a1111/Desktop/daf-erp-system/client && grep -rn "leftAt\|totalStudents" src/components/reports/departed-students src/components/dashboard; npm run typecheck && npm run lint && npm test`
Expected: `grep` hech narsa topmaydi; typecheck toza; lint'da yangi xato yo'q; vitest yashil.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system && git add client/src/components/reports/departed-students/departed-students-kpi-cards.tsx client/src/components/reports/departed-students/departed-students-dynamics-chart.tsx client/src/components/reports/departed-students/departed-students-client.tsx client/src/components/reports/departed-students/departed-students-table.tsx client/src/components/reports/departed-students/departed-students-status-chart.tsx client/src/components/reports/departed-students/departed-students-group-by-chart.tsx client/src/components/dashboard/dashboard-summary-types.ts client/src/components/dashboard/home-people-stats.tsx && git commit -m "$(cat <<'EOF'
Departed report UI: new meanings, period dynamics, pending badge

KPI tooltips describe the new formulas, the churn colours are gone, the
dynamics chart follows the selected range and marks provisional months, and
the list flags departures still inside the grace period. The home card
explains its departure count on hover.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: ADR-0035 va CONTEXT.md

**Files:**
- Create: `docs/adr/0035-ketgan-oquvchi-tarifi.md`
- Modify: `docs/adr/README.md` (indeks)
- Modify: `CONTEXT.md`

- [ ] **Step 1: N ni yakunlash**

Task 0 Step 4 natijasi bo'yicha `DEPARTURE_GRACE_DAYS` to'g'ri ekanini tekshiring. O'zgargan bo'lsa: `server/src/students/shared/departure-episodes.ts` dagi konstantani yangilang va `cd server && npx jest src/students src/reports src/dashboard` — yashil bo'lishi kerak (testlar 7…30 oralig'ida N dan mustaqil).

- [ ] **Step 2: ADR**

`docs/adr/0035-ketgan-oquvchi-tarifi.md` (`<…>` joylariga Task 0 Step 4 dagi o'lchov sonlarini yozing):

```markdown
# ADR-0035 — O'quvchi to'xtagan kuni ketgan sanaladi; guruhsizlik va pauzada N kun kutiladi

**Holati:** Qabul qilindi
**Sana:** 2026-09-25
**Bog'liq:** ADR-0002, ADR-0005, `server/src/students/shared/departure-episodes.ts`, `server/src/reports/shared/departures.loader.ts`, `docs/superpowers/specs/2026-09-25-ketgan-oquvchi-tarifi-design.md`

## Kontekst

«Ketgan» to'rt joyda to'rt xil sanalardi: hisobot sahifasi — hozir guruhsiz
hamma (hech qachon guruhga qo'shilmaganlar, muzlatilganlar va `PROSPECT` ham);
bosh sahifa kartasi va Excel «KPI paneli» — chetlatilganlar + `DROPPED`
qatorlar (iyul 2026: 158, haqiqatda 117 — audit H30); «O'quvchilar oqimi» —
status o'tishlari, bitiruvchilar ham; Telegram 21:00 — bugungi `DROPPED`.
Sahifaning «Ketish koeffitsienti» butun tarixdagi to'plamni joriy o'quvchilarga
bo'lardi va vaqt o'tgan sari faqat o'sardi.

## Qaror

- Chetlatish (`ACTIVE → EXPELLED`) va faol yoki muzlatilgan o'quvchini
  arxivlash — **o'sha kuni** ketgan.
- Oxirgi faol yozuvning yopilishi (guruhdan chiqarish, guruh bekor qilinishi)
  va muzlatish — **N kun ichida** faol yozuv qaytmasa, to'xtagan kuni ketgan;
  qaytsa, ketish bo'lmagan. **N = <N> kun.** Prod o'lchovi (2026-09-<kun>):
  guruhdan chiqib qaytganlarning <X>% i <Y> kun ichida, muzlatishdan
  qaytganlarning <Z>% i <W> kun ichida qaytgan.
- Qaytishgacha bo'lgan to'xtashlar — bitta epizod; sanasi — birinchi to'xtash.
- Bitiruv (`COMPLETED`, `GRADUATED`) va `TRANSFERRED` — ketish emas.
- Qoida faqat `departure-episodes.ts` da yashaydi. Hisobot sahifasi, bosh
  sahifa kartasi va Excel «KPI paneli» uni `loadDepartures` orqali o'qiydi.

Taqiqlanadi:
- «Ketgan»ni boshqa joyda `DROPPED` qatorlari yoki `EXPELLED` statusidan
  sanash — H30 aynan shunday paydo bo'lgan.

## Ko'rib chiqilgan muqobillar

- **Faqat status** — guruhdan chiqarilib faol qolganlar hech qachon sanalmaydi.
- **Har qanday `DROPPED`** — guruh almashtirish ham ketish bo'lib qoladi.
- **Muzlatilgan kuni darhol** — qisqa pauzalar churn'ni sun'iy oshiradi.
- **`StudentDeparture` jadvali + cron** — migratsiya, eski ma'lumotni to'ldirish
  va 5 dan ortiq yozish joyi; bittasi unutilsa son jimgina kamayadi.

## Oqibatlari

**Yutuq:** bir oy — bir son (sahifa, karta, Excel); N ichidagilar
«kutilmoqda» — qo'ng'iroq qilinadigan ro'yxat.

**Narx:** oxirgi N kun dastlabki — oy natijasi N kun kechikib yakunlanadi.
«O'quvchilar oqimi» va Telegram 21:00 **ataylab** o'zgartirilmadi: ular
boshqa savolga javob beradi (status o'tishlari; bugungi xom hodisalar).
Oqim diagrammasining «Batafsil» havolasi boshqa son ko'rsatadigan sahifaga
olib boradi.

**Endi taqiqlangan:** «ketgan» sonini `departure-episodes.ts` dan
boshqa joyda hisoblash.
```

- [ ] **Step 3: Indeks**

`docs/adr/README.md` — 0034 qatoridan keyin:

```markdown
| [0035](0035-ketgan-oquvchi-tarifi.md) | O'quvchi to'xtagan kuni ketgan sanaladi; guruhsizlik va pauzada N kun kutiladi | Qabul qilindi | 2026-09-25 |
```

- [ ] **Step 4: CONTEXT.md**

«Faol o'quvchi» yozuvidan keyin qo'shing:

```markdown
**Ketgan o'quvchi** — o'qishni to'xtatib qaytmagan o'quvchi. Chetlatilgan yoki
arxivlangan kuni ketgan; oxirgi guruhidan chiqqan yoki muzlatilgan bo'lsa —
N kun ichida qaytmasa, to'xtagan kuni ketgan, qaytsa ketish bo'lmagan.
Bitiruvchi ketgan emas. Hisobot sahifasi, bosh sahifa kartasi va Excel «KPI
paneli» shu bitta ta'rifdan o'qiydi; «O'quvchilar oqimi» va Telegram 21:00
boshqa savolga javob beradi.
`students/shared/departure-episodes.ts` · `docs/adr/0035-ketgan-oquvchi-tarifi.md`
```

«Ketish sababi» yozuvidagi ikkinchi jumlani (`Hisobotdagi «ketganlar» **enrollment** larni sanaydi …` bilan boshlanib `… ikki marta sanaladi.` bilan tugaydigan) almashtiring:

```markdown
Sabab guruhdan chiqarish yozuvida saqlanadi; «ketgan» esa o'quvchi bo'yicha
sanaladi — «Ketgan o'quvchi» ga qarang.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system && git add docs/adr/0035-ketgan-oquvchi-tarifi.md docs/adr/README.md CONTEXT.md && git commit -m "$(cat <<'EOF'
ADR-0035: a student departs on the day they stop

Records the definition, the grace period and why the flow chart and the
Telegram line keep their own meaning; CONTEXT.md gets the term.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

(Agar Step 1 da konstanta o'zgargan bo'lsa, `server/src/students/shared/departure-episodes.ts` ni ham shu commit'ga qo'shing.)

---

### Task 9: Yakuniy tekshiruv va PR

**Files:** `server/scripts/_probe-departure-gaps.ts` (lokal, `.gitignore` da — commit qilinmaydi).

- [ ] **Step 1: Server**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server && npm test 2>&1 | tail -5 && npm run typecheck && npx eslint src 2>&1 | tail -3 && npm run build
```

Expected: hamma test yashil (Task 0 dagi sondan ko'p), typecheck toza, eslint `0 errors`, build muvaffaqiyatli.

- [ ] **Step 2: Client**

```bash
cd /Users/a1111/Desktop/daf-erp-system/client && npm run typecheck && npm run lint && npm test && npm run build
```

Expected: hammasi toza.

- [ ] **Step 3: Prod'da yuklovchini SQL bilan solishtirish**

`server/scripts/_probe-departure-gaps.ts` — importlarga:

```ts
import { loadDepartures } from '../src/reports/shared/departures.loader';
import { departuresInRange } from '../src/students/shared/departure-episodes';
import {
  addMonthsToMonthKey,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../src/common/date/tashkent';
```

`console.table(monthly);` dan keyin (tranzaksiya ichida) qo'shing:

```ts
      // ── 5) Yuklovchi (src) — 4-jadvaldagi n<N> bilan solishtiring ──────
      const loaded = await loadDepartures(tx, companies[0].id, null, {});
      const rows: { oy: string; yuklovchi: number }[] = [];
      for (
        let key = tashkentMonthKey(floor);
        key <= tashkentMonthKey(new Date());
        key = addMonthsToMonthKey(key, 1)
      ) {
        rows.push({
          oy: key,
          yuklovchi: departuresInRange(
            loaded.episodes,
            tashkentMonthRangeUtc(key),
            loaded.floor,
          ).length,
        });
      }
      console.log(`\n5) Yuklovchi, N = ${loaded.graceDays}:`);
      console.table(rows);
```

Foydalanuvchidan `railway run npx ts-node --transpile-only scripts/_probe-departure-gaps.ts` (`server/` ichidan) natijasini so'rang. `5)` jadvali `4)` jadvalidagi `n<N>` ustuni bilan oyma-oy mos kelishi kerak (so'nggi N kun dastlabki bo'lgani uchun joriy oy farq qilishi mumkin). Boshqa oyda farq bo'lsa — to'xtang va farqni foydalanuvchiga ko'rsating (qaysi oy, qancha).

- [ ] **Step 4: PR (foydalanuvchi tasdig'i bilan)**

Foydalanuvchi tasdiqlagandan keyin:

```bash
cd /Users/a1111/Desktop/daf-erp-system && git push -u origin feat/ketganlar-tarifi
```

PR tavsifi inglizcha, `## Why / ## What / ## Tests` shaklida; «Deploy» bo'limida oldin/keyin sonlari (probe'ning `1)` va `5)` jadvallaridan) va «deploydan keyin bosh sahifa kartasidagi −N kamayadi — kutilgan» ogohlantirishi; oxirida `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. PR ochilgach `ccd_pr` `get_status` bilan bog'lang.
