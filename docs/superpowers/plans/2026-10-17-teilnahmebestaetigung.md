# Teilnahmebestätigung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An administrator gives a student who finished a level a one-page German «Teilnahmebestätigung» PDF with a QR code, but only when the student's attendance (and, where the Student App has material for the level, the app progress) meets the CEO's thresholds.

**Architecture:** A new `server/src/participation-certificates/` module. Pure functions (`participation-rules.ts`) count attendance rows and app lessons and decide eligibility; a read-only facts service loads those inputs for one student and level; a service freezes the result into a `ParticipationCertificate` row (snapshot) and numbers it `TB-YYYY-NNNN`; a `pdfmake` template draws the document from the snapshot (Plex Serif + Plex Sans) with a QR to a public `/t/<uuid>` page. Thresholds live in the existing `Setting` registry. The client gets a «Hujjatlar» tab on the student card, a CEO settings page and the public verification page.

**Tech Stack:** NestJS + Prisma 7 + Jest + `pdfmake` 0.2 + `qrcode` (server); Next.js + React Query 5 + Vitest + shadcn (client). One migration, four font files, no new npm dependency.

**Spec:** `docs/superpowers/specs/2026-10-17-teilnahmebestaetigung-design.md` (read it first; this plan follows it section by section).

## Global Constraints

- Worktree root: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/feat-teilnahmebestaetigung` (branch `worktree-feat-teilnahmebestaetigung`). Every command runs inside it; never `cd` into the main checkout. A fresh worktree has no `node_modules`: Task 1 Step 1 installs them.
- Server tests: `cd server && npx jest <path>`. Typecheck: `npm run typecheck` AND `npm run build` (ts-jest is transpile-only). Lint: `npx eslint <files>`. Format: `npx prettier --write <touched server .ts files>` before every commit. **Never run prettier on `client/`.**
- Client checks: `cd client && npx tsc --noEmit -p . && npx vitest run <path>`; `npx eslint src` must have 0 errors; `npm run build` before the last task ends.
- Commit messages: English, conventional (`feat(participation): …`), ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- UI text: Uzbek, Latin script, no English words on screen. German text only inside the PDF.
- Counting rule (spec 3.1). From a student's own `Attendance` rows of the level: `PRESENT` → attended; `LATE` → attended and `late + 1`; `ABSENT` → absent; `EXCUSED` with a `cancellationId` → left out; `EXCUSED` with a `PlannedAbsence` of kind `SABABSIZ` on the same group and day → absent; any other `EXCUSED` → left out. `counted = attended + absent`.
- Percent is `floor(attended × 100 / counted)` for display; eligibility is integer arithmetic `attended × 100 ≥ min × counted` — 79,9 % never passes 80. `counted = 0` → not eligible.
- Thresholds (settings keys, company level, CEO writes): `participation.minAttendancePercent` default 80; `participation.minAppPercent.A1|A2|B1` default 100; each 0–100 integer. The app threshold applies only when the level is A1/A2/B1 AND it has open lessons (`open > 0`).
- An «open» app lesson: a `DafLesson` of a unit with `retiredAt = null` and `unit.level` = the level, that has exercises (`_count.exercises > 0`), or is `kind = UNIT_TEST` and its unit has at least one lesson with exercises. App progress = `DafLessonProgress.completedAt != null` over the open lessons.
- No new capability key. `GET …/preview` and `GET …/pdf`: `@Can('students.details')`; `POST /students/:id/participation-certificates`: `@Can('students.manage')`; settings: `@CeoOnly()`; verify: `@Public()` + `@UseGuards(IpThrottlerGuard)`. A non-eligible student gets a certificate only through `exemptReason`, and only a caller whose DATABASE roles hold the CEO role may use it (403 otherwise).
- The document is issued in the name of «DaF Sprachzentrum». It never prints a branch, «Kursleitung», «Zentrumsleitung», «Stempel» or a place name. The only line under the GER scale is «Ausgestellt am dd.MM.yyyy». The public page shows no branch, no date of birth, no percentages.
- QR address: `publicBaseUrl(config) + '/t/' + id` where `id` is the row's UUID (never the sequential number).
- Every figure the PDF prints comes from the stored snapshot, never from live data: a later attendance fix must not change an issued document.
- `participation-rules.ts` is the ONE place that counts and decides. The preview endpoint, the issue endpoint and the PDF all read its results; no other file re-implements a count or a threshold comparison.
- Fonts: `IBMPlexSerif-SemiBold.ttf` (title, level badge, field values, result numbers), `IBMPlexSans-Regular.ttf`, `IBMPlexSans-SemiBold.ttf`, `IBMPlexSans-Italic.ttf` in `server/assets/fonts/`. Colours: navy `#17375E`, gold `#B8924A`, ink `#101828`, muted `#667085`, line `#C9CED6`, table head `#EEF2F7`.
- Before touching any PDF code, invoke the `pdf` skill (project rule, `client/CLAUDE.md`).

---

### Task 1: Pure rules, shared types, number and snapshot

**Files:**
- Create: `server/src/participation-certificates/participation-rules.ts`
- Create: `server/src/participation-certificates/participation-rules.spec.ts`
- Create: `server/src/participation-certificates/participation-types.ts`
- Create: `server/src/participation-certificates/participation-number.ts`
- Create: `server/src/participation-certificates/participation-number.spec.ts`
- Create: `server/src/participation-certificates/participation-snapshot.ts`
- Create: `server/src/participation-certificates/participation-snapshot.spec.ts`

**Interfaces:**
- Produces (`participation-rules.ts`): `GER_LEVELS`, `GerLevel`, `APP_LEVELS`, `AppLevel`, `normalizeLevel(raw): GerLevel | null`, `isAppLevel(level): level is AppLevel`, `AttendanceRow`, `AttendanceTally`, `tallyAttendance(rows)`, `AppTally`, `tallyApp(done, open)`, `Thresholds { attendance: number; app: number | null }`, `meetsPercent(numerator, denominator, minPercent)`, `Verdict`, `evaluate(attendance, app, thresholds)`.
- Produces (`participation-types.ts`): `LevelFacts`, `StudentFacts`, `CertificateSnapshot`, `IssuedView`, `LevelPreview`, `CertificatePreview`, `VerifyView`.
- Produces: `certificateNumber(year, seq): string`, `buildSnapshot(student, facts, thresholds, exempt): CertificateSnapshot`.

- [ ] **Step 1: Install dependencies and generate the Prisma client**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/feat-teilnahmebestaetigung/server && npm install && npx prisma generate
cd ../client && npm install
```
Expected: both installs finish; `prisma generate` prints «Generated Prisma Client».

- [ ] **Step 2: Write the failing rules spec**

Create `server/src/participation-certificates/participation-rules.spec.ts`:

```ts
import { AttendanceStatus } from '@prisma/client';
import {
  evaluate,
  isAppLevel,
  meetsPercent,
  normalizeLevel,
  tallyApp,
  tallyAttendance,
  type AttendanceRow,
} from './participation-rules';

const row = (
  status: AttendanceStatus,
  extra: Partial<AttendanceRow> = {},
): AttendanceRow => ({
  status,
  cancellationId: null,
  plannedUnexcused: false,
  ...extra,
});

describe('tallyAttendance (spec 3.1)', () => {
  it('counts PRESENT and LATE as attended, ABSENT as absent, LATE also as late', () => {
    const t = tallyAttendance([
      row(AttendanceStatus.PRESENT),
      row(AttendanceStatus.LATE),
      row(AttendanceStatus.ABSENT),
    ]);
    expect(t).toEqual({
      attended: 2,
      late: 1,
      absent: 1,
      counted: 3,
      percent: 66,
    });
  });

  it('leaves an excused absence out of both sides', () => {
    const t = tallyAttendance([
      row(AttendanceStatus.PRESENT),
      row(AttendanceStatus.EXCUSED),
    ]);
    expect(t.counted).toBe(1);
    expect(t.absent).toBe(0);
    expect(t.percent).toBe(100);
  });

  it('leaves a cancelled lesson out, even when it was announced as unexcused', () => {
    const t = tallyAttendance([
      row(AttendanceStatus.PRESENT),
      row(AttendanceStatus.EXCUSED, {
        cancellationId: 'c1',
        plannedUnexcused: true,
      }),
    ]);
    expect(t.counted).toBe(1);
  });

  it('counts an announced «sababsiz» absence as absent', () => {
    const t = tallyAttendance([
      row(AttendanceStatus.PRESENT),
      row(AttendanceStatus.EXCUSED, { plannedUnexcused: true }),
    ]);
    expect(t).toMatchObject({ attended: 1, absent: 1, counted: 2, percent: 50 });
  });

  it('has no percent without a counted lesson', () => {
    expect(tallyAttendance([])).toEqual({
      attended: 0,
      late: 0,
      absent: 0,
      counted: 0,
      percent: null,
    });
    expect(tallyAttendance([row(AttendanceStatus.EXCUSED)]).percent).toBeNull();
  });

  it('floors the displayed percent: 79,6 shows 79', () => {
    const rows = [
      ...Array.from({ length: 398 }, () => row(AttendanceStatus.PRESENT)),
      ...Array.from({ length: 102 }, () => row(AttendanceStatus.ABSENT)),
    ];
    expect(tallyAttendance(rows).percent).toBe(79);
  });
});

describe('meetsPercent', () => {
  it('passes exactly at the threshold', () => {
    expect(meetsPercent(4, 5, 80)).toBe(true);
  });
  it('does not round 79,6 up to 80', () => {
    expect(meetsPercent(398, 500, 80)).toBe(false);
  });
  it('never passes an empty denominator', () => {
    expect(meetsPercent(0, 0, 0)).toBe(false);
  });
  it('accepts a zero threshold when something was counted', () => {
    expect(meetsPercent(0, 3, 0)).toBe(true);
  });
});

describe('tallyApp', () => {
  it('does not apply without open lessons', () => {
    expect(tallyApp(0, 0)).toEqual({
      applies: false,
      done: 0,
      open: 0,
      percent: null,
    });
    expect(tallyApp(5, 0).applies).toBe(false);
  });
  it('floors the percent and never exceeds the open lessons', () => {
    expect(tallyApp(99, 100).percent).toBe(99);
    expect(tallyApp(120, 100)).toEqual({
      applies: true,
      done: 100,
      open: 100,
      percent: 100,
    });
  });
});

describe('evaluate (spec 3.3)', () => {
  const att = (attended: number, counted: number) =>
    tallyAttendance([
      ...Array.from({ length: attended }, () => row(AttendanceStatus.PRESENT)),
      ...Array.from({ length: counted - attended }, () =>
        row(AttendanceStatus.ABSENT),
      ),
    ]);

  it('is eligible on attendance alone when the app does not apply', () => {
    const v = evaluate(att(4, 5), tallyApp(0, 0), { attendance: 80, app: null });
    expect(v).toEqual({
      attendanceOk: true,
      appOk: null,
      eligible: true,
      reasons: [],
    });
  });

  it('is not eligible below the attendance threshold and says why', () => {
    const v = evaluate(att(37, 50), tallyApp(0, 0), { attendance: 80, app: null });
    expect(v.eligible).toBe(false);
    expect(v.reasons).toEqual(['Davomat 74%, kerak 80%']);
  });

  it('says there is no data when nothing was counted', () => {
    const v = evaluate(att(0, 0), tallyApp(0, 0), { attendance: 80, app: null });
    expect(v.reasons).toEqual(["Davomat ma'lumoti yo'q"]);
  });

  it('needs the app threshold too when the level has open lessons', () => {
    const th = { attendance: 80, app: 100 };
    expect(evaluate(att(5, 5), tallyApp(99, 100), th).eligible).toBe(false);
    expect(evaluate(att(5, 5), tallyApp(99, 100), th).reasons).toEqual([
      'Ilova 99%, kerak 100%',
    ]);
    expect(evaluate(att(5, 5), tallyApp(100, 100), th).eligible).toBe(true);
  });

  it('ignores the app threshold on a level without an app threshold', () => {
    const v = evaluate(att(5, 5), tallyApp(1, 100), { attendance: 80, app: null });
    expect(v.appOk).toBeNull();
    expect(v.eligible).toBe(true);
  });

  it('lists both reasons when both fail', () => {
    const v = evaluate(att(1, 2), tallyApp(1, 2), { attendance: 80, app: 100 });
    expect(v.reasons).toEqual(['Davomat 50%, kerak 80%', 'Ilova 50%, kerak 100%']);
  });
});

describe('levels', () => {
  it('normalizes a group level and rejects free text', () => {
    expect(normalizeLevel(' a1 ')).toBe('A1');
    expect(normalizeLevel('C2')).toBe('C2');
    expect(normalizeLevel('Beginner')).toBeNull();
    expect(normalizeLevel(null)).toBeNull();
  });
  it('knows which levels the app teaches', () => {
    expect(isAppLevel('A1')).toBe(true);
    expect(isAppLevel('B1')).toBe(true);
    expect(isAppLevel('B2')).toBe(false);
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd server && npx jest src/participation-certificates/participation-rules.spec.ts`
Expected: FAIL — `Cannot find module './participation-rules'`.

- [ ] **Step 4: Implement the rules**

Create `server/src/participation-certificates/participation-rules.ts`:

```ts
import { AttendanceStatus } from '@prisma/client';

/**
 * The ONE place that counts a student's level and decides whether a
 * Teilnahmebestätigung may be given (spec 3.1–3.3). The preview, the issue
 * endpoint and the PDF all read what this file returns; no other file keeps a
 * second copy of a count or of a threshold comparison.
 */

export const GER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type GerLevel = (typeof GER_LEVELS)[number];

/** The levels the Student App has (or will have) material for. */
export const APP_LEVELS = ['A1', 'A2', 'B1'] as const;
export type AppLevel = (typeof APP_LEVELS)[number];

/** `Group.level` is free text; only the six GER levels count. */
export function normalizeLevel(
  raw: string | null | undefined,
): GerLevel | null {
  const value = (raw ?? '').trim().toUpperCase();
  return (GER_LEVELS as readonly string[]).includes(value)
    ? (value as GerLevel)
    : null;
}

export function isAppLevel(level: string): level is AppLevel {
  return (APP_LEVELS as readonly string[]).includes(level);
}

export interface AttendanceRow {
  status: AttendanceStatus;
  cancellationId: string | null;
  /** A `PlannedAbsence` of kind SABABSIZ exists for this group and day. */
  plannedUnexcused: boolean;
}

export interface AttendanceTally {
  attended: number;
  late: number;
  absent: number;
  counted: number;
  /** Floored, so the screen never shows more than the student earned. */
  percent: number | null;
}

export function tallyAttendance(rows: readonly AttendanceRow[]): AttendanceTally {
  let attended = 0;
  let late = 0;
  let absent = 0;
  for (const r of rows) {
    switch (r.status) {
      case AttendanceStatus.PRESENT:
        attended += 1;
        break;
      case AttendanceStatus.LATE:
        attended += 1;
        late += 1;
        break;
      case AttendanceStatus.ABSENT:
        absent += 1;
        break;
      case AttendanceStatus.EXCUSED:
        // A cancelled lesson is nobody's absence; an announced «sababsiz»
        // absence lands as EXCUSED but is not excused (AbsenceStreakService
        // reads it the same way).
        if (r.cancellationId === null && r.plannedUnexcused) absent += 1;
        break;
    }
  }
  const counted = attended + absent;
  return {
    attended,
    late,
    absent,
    counted,
    percent: counted > 0 ? Math.floor((attended * 100) / counted) : null,
  };
}

export interface AppTally {
  applies: boolean;
  done: number;
  open: number;
  percent: number | null;
}

export function tallyApp(done: number, open: number): AppTally {
  if (open <= 0) return { applies: false, done: 0, open: 0, percent: null };
  const d = Math.min(Math.max(done, 0), open);
  return { applies: true, done: d, open, percent: Math.floor((d * 100) / open) };
}

export interface Thresholds {
  attendance: number;
  /** null: this level has no app threshold (not A1/A2/B1). */
  app: number | null;
}

/** `numerator / denominator ≥ minPercent`, in integers: 79,6 % never passes 80. */
export function meetsPercent(
  numerator: number,
  denominator: number,
  minPercent: number,
): boolean {
  return denominator > 0 && numerator * 100 >= minPercent * denominator;
}

export interface Verdict {
  attendanceOk: boolean;
  /** null: the app condition does not apply to this level. */
  appOk: boolean | null;
  eligible: boolean;
  reasons: string[];
}

export function evaluate(
  attendance: AttendanceTally,
  app: AppTally,
  thresholds: Thresholds,
): Verdict {
  const attendanceOk = meetsPercent(
    attendance.attended,
    attendance.counted,
    thresholds.attendance,
  );
  const appRequired = app.applies && thresholds.app !== null;
  const appOk = appRequired
    ? meetsPercent(app.done, app.open, thresholds.app ?? 0)
    : null;

  const reasons: string[] = [];
  if (!attendanceOk) {
    reasons.push(
      attendance.counted === 0
        ? "Davomat ma'lumoti yo'q"
        : `Davomat ${attendance.percent}%, kerak ${thresholds.attendance}%`,
    );
  }
  if (appOk === false) {
    reasons.push(`Ilova ${app.percent}%, kerak ${thresholds.app}%`);
  }
  return { attendanceOk, appOk, eligible: attendanceOk && appOk !== false, reasons };
}
```

- [ ] **Step 5: Run the rules spec and see it pass**

Run: `cd server && npx jest src/participation-certificates/participation-rules.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Write the shared types**

Create `server/src/participation-certificates/participation-types.ts`:

```ts
import type {
  AppTally,
  AttendanceTally,
  GerLevel,
  Thresholds,
  Verdict,
} from './participation-rules';

/** What the database says about one student at one level (read-only). */
export interface LevelFacts {
  level: GerLevel;
  groupNames: string[];
  courseName: string | null;
  lessonMinutes: number | null;
  /** 'YYYY-MM-DD' of the first and the last attendance row of the level. */
  from: string;
  to: string;
  attendance: AttendanceTally;
  app: AppTally;
  /** Open `UNIT_TEST` lessons and how many of them the student passed. */
  unitTests: { passed: number; total: number } | null;
  mock: { score: number; maxScore: number; date: string | null } | null;
}

export interface StudentFacts {
  student: {
    firstName: string;
    lastName: string;
    /** 'YYYY-MM-DD' (the Tashkent day, `storedBirthDay`). */
    dateOfBirth: string | null;
  };
  levels: LevelFacts[];
  /** Groups the student attended whose `level` is empty or not a GER level. */
  unleveledGroups: string[];
}

/** Frozen into `ParticipationCertificate.snapshot`; the PDF reads only this. */
export interface CertificateSnapshot {
  version: 1;
  student: StudentFacts['student'];
  level: GerLevel;
  courseName: string | null;
  groupNames: string[];
  lessonMinutes: number | null;
  from: string;
  to: string;
  attendance: AttendanceTally;
  app: AppTally;
  unitTests: { passed: number; total: number } | null;
  mock: { score: number; maxScore: number; date: string | null } | null;
  thresholds: Thresholds;
  /** Given with a CEO exemption although the verdict was «not eligible». */
  exempt: boolean;
}

export interface IssuedView {
  id: string;
  number: string;
  level: string;
  /** ISO instant. */
  issuedAt: string;
  exempt: boolean;
  revoked: boolean;
}

export interface LevelPreview extends LevelFacts {
  thresholds: Thresholds;
  verdict: Verdict;
  issued: IssuedView[];
}

export interface CertificatePreview {
  studentId: number;
  unleveledGroups: string[];
  levels: LevelPreview[];
}

/** The public QR page. No branch, no birth date, no percentages. */
export interface VerifyView {
  valid: boolean;
  revoked: boolean;
  number: string;
  studentName: string;
  level: string;
  from: string;
  to: string;
  issuedAt: string;
  companyName: string;
}
```

- [ ] **Step 7: Write the failing number and snapshot specs**

Create `server/src/participation-certificates/participation-number.spec.ts`:

```ts
import { certificateNumber } from './participation-number';

describe('certificateNumber', () => {
  it('pads the sequence to four digits', () => {
    expect(certificateNumber(2026, 1)).toBe('TB-2026-0001');
    expect(certificateNumber(2026, 42)).toBe('TB-2026-0042');
  });
  it('keeps growing past four digits', () => {
    expect(certificateNumber(2027, 10000)).toBe('TB-2027-10000');
  });
});
```

Create `server/src/participation-certificates/participation-snapshot.spec.ts`:

```ts
import { buildSnapshot } from './participation-snapshot';
import type { LevelFacts, StudentFacts } from './participation-types';

const student: StudentFacts['student'] = {
  firstName: 'Madina',
  lastName: 'Karimova',
  dateOfBirth: '2004-03-14',
};

const facts: LevelFacts = {
  level: 'A1',
  groupNames: ['A1-17'],
  courseName: 'Deutsch A1',
  lessonMinutes: 90,
  from: '2026-07-07',
  to: '2026-10-15',
  attendance: { attended: 21, late: 2, absent: 2, counted: 23, percent: 91 },
  app: { applies: true, done: 80, open: 80, percent: 100 },
  unitTests: { passed: 5, total: 5 },
  mock: { score: 72, maxScore: 100, date: '2026-10-07' },
};

describe('buildSnapshot', () => {
  it('freezes the facts, the thresholds and the exemption flag', () => {
    const snapshot = buildSnapshot(student, facts, { attendance: 80, app: 100 }, false);
    expect(snapshot).toEqual({
      version: 1,
      student,
      level: 'A1',
      courseName: 'Deutsch A1',
      groupNames: ['A1-17'],
      lessonMinutes: 90,
      from: '2026-07-07',
      to: '2026-10-15',
      attendance: facts.attendance,
      app: facts.app,
      unitTests: { passed: 5, total: 5 },
      mock: { score: 72, maxScore: 100, date: '2026-10-07' },
      thresholds: { attendance: 80, app: 100 },
      exempt: false,
    });
  });

  it('does not alias the live facts: changing them later leaves the snapshot alone', () => {
    const snapshot = buildSnapshot(student, facts, { attendance: 80, app: null }, true);
    facts.attendance.attended = 0;
    expect(snapshot.attendance.attended).toBe(21);
    expect(snapshot.exempt).toBe(true);
    facts.attendance.attended = 21;
  });
});
```

- [ ] **Step 8: Run them and see them fail**

Run: `cd server && npx jest src/participation-certificates/participation-number.spec.ts src/participation-certificates/participation-snapshot.spec.ts`
Expected: FAIL — modules not found.

- [ ] **Step 9: Implement the number and the snapshot**

Create `server/src/participation-certificates/participation-number.ts`:

```ts
/** `TB-2026-0001`: «Teilnahmebestätigung», the Tashkent year, a per-company-and-year sequence. */
export function certificateNumber(year: number, seq: number): string {
  return `TB-${year}-${String(seq).padStart(4, '0')}`;
}
```

Create `server/src/participation-certificates/participation-snapshot.ts`:

```ts
import type { Thresholds } from './participation-rules';
import type {
  CertificateSnapshot,
  LevelFacts,
  StudentFacts,
} from './participation-types';

/** A copy, not a reference: the live facts object may be reused after issuing. */
export function buildSnapshot(
  student: StudentFacts['student'],
  facts: LevelFacts,
  thresholds: Thresholds,
  exempt: boolean,
): CertificateSnapshot {
  return {
    version: 1,
    student: { ...student },
    level: facts.level,
    courseName: facts.courseName,
    groupNames: [...facts.groupNames],
    lessonMinutes: facts.lessonMinutes,
    from: facts.from,
    to: facts.to,
    attendance: { ...facts.attendance },
    app: { ...facts.app },
    unitTests: facts.unitTests ? { ...facts.unitTests } : null,
    mock: facts.mock ? { ...facts.mock } : null,
    thresholds: { ...thresholds },
    exempt,
  };
}
```

- [ ] **Step 10: Run all three specs, typecheck-format, commit**

Run: `cd server && npx jest src/participation-certificates && npx prettier --write src/participation-certificates && npx eslint src/participation-certificates`
Expected: all PASS, eslint clean.

```bash
git add server/src/participation-certificates
git commit -m "feat(participation): pure rules, shared types, number and snapshot

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Settings keys, settings service and DTO

**Files:**
- Modify: `server/src/settings/settings.types.ts` (the `SettingKey` union, `SettingValueMap`, `SETTING_DEFINITIONS`)
- Modify: `server/src/settings/settings.types.spec.ts` (expected key list)
- Create: `server/src/settings/participation-settings.spec.ts`
- Create: `server/src/participation-certificates/dto/participation-settings.dto.ts`
- Create: `server/src/participation-certificates/dto/participation-settings.dto.spec.ts`
- Create: `server/src/participation-certificates/participation-settings.service.ts`
- Create: `server/src/participation-certificates/participation-settings.service.spec.ts`

**Interfaces:**
- Consumes: `APP_LEVELS`, `AppLevel`, `isAppLevel`, `Thresholds` from Task 1; `SettingsService.get(companyId, key)` and `SettingsService.setMany(companyId, entries, userId)` (see `kpi-settings.service.ts`).
- Produces: `ParticipationSettings { minAttendancePercent: number; minAppPercent: Record<AppLevel, number> }`, `ParticipationSettingsPatch`, `ParticipationSettingsService.read(companyId)`, `.update(companyId, patch, userId)`, `.thresholdsFor(settings, level): Thresholds`; `ParticipationSettingsDto`.

- [ ] **Step 1: Write the failing registry spec**

Create `server/src/settings/participation-settings.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { getSettingDefinition } from './settings.types';

describe('participation settings (spec 3.3)', () => {
  it('the attendance threshold defaults to 80, company-level, 0..100 integers', () => {
    const def = getSettingDefinition('participation.minAttendancePercent');
    expect(def.defaultValue).toBe(80);
    expect(def.companyLevelOnly).toBe(true);
    expect(def.parse(0)).toBe(0);
    expect(def.parse(100)).toBe(100);
    expect(() => def.parse(101)).toThrow(BadRequestException);
    expect(() => def.parse(-1)).toThrow(BadRequestException);
    expect(() => def.parse(79.5)).toThrow(BadRequestException);
  });

  it.each(['A1', 'A2', 'B1'] as const)(
    'the %s app threshold defaults to 100, company-level, 0..100 integers',
    (level) => {
      const def = getSettingDefinition(`participation.minAppPercent.${level}`);
      expect(def.defaultValue).toBe(100);
      expect(def.companyLevelOnly).toBe(true);
      expect(def.parse(0)).toBe(0);
      expect(() => def.parse(101)).toThrow(BadRequestException);
      expect(() => def.parse('100')).toThrow(BadRequestException);
    },
  );
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd server && npx jest src/settings/participation-settings.spec.ts`
Expected: FAIL — TypeScript/`Noma'lum sozlama kaliti` for the new keys.

- [ ] **Step 3: Register the four keys**

In `server/src/settings/settings.types.ts` make three edits.

(a) The union. Replace `  | 'kpi.promiseKept.value';` with:

```ts
  | 'kpi.promiseKept.value'
  | 'participation.minAttendancePercent'
  | 'participation.minAppPercent.A1'
  | 'participation.minAppPercent.A2'
  | 'participation.minAppPercent.B1';
```

(b) The value map. After the line `  'kpi.promiseKept.value': number;` add:

```ts
  'participation.minAttendancePercent': number;
  'participation.minAppPercent.A1': number;
  'participation.minAppPercent.A2': number;
  'participation.minAppPercent.B1': number;
```

(c) The definitions. Replace the last definition of the registry:

```ts
  'kpi.promiseKept.value': {
    key: 'kpi.promiseKept.value',
    defaultValue: 20_000,
    parse: (raw) =>
      parseIntInRange('kpi.promiseKept.value', raw, 0, KPI_VALUE_MAX),
    companyLevelOnly: true,
  },
};
```

with:

```ts
  'kpi.promiseKept.value': {
    key: 'kpi.promiseKept.value',
    defaultValue: 20_000,
    parse: (raw) =>
      parseIntInRange('kpi.promiseKept.value', raw, 0, KPI_VALUE_MAX),
    companyLevelOnly: true,
  },
  // Teilnahmebestätigung (spec 2026-10-17): read by
  // `ParticipationSettingsService` per company; the CEO changes them on
  // Sozlamalar → «Qatnashganlik hujjati».
  'participation.minAttendancePercent': {
    key: 'participation.minAttendancePercent',
    defaultValue: 80,
    parse: (raw) =>
      parseIntInRange('participation.minAttendancePercent', raw, 0, 100),
    companyLevelOnly: true,
  },
  'participation.minAppPercent.A1': {
    key: 'participation.minAppPercent.A1',
    defaultValue: 100,
    parse: (raw) =>
      parseIntInRange('participation.minAppPercent.A1', raw, 0, 100),
    companyLevelOnly: true,
  },
  'participation.minAppPercent.A2': {
    key: 'participation.minAppPercent.A2',
    defaultValue: 100,
    parse: (raw) =>
      parseIntInRange('participation.minAppPercent.A2', raw, 0, 100),
    companyLevelOnly: true,
  },
  'participation.minAppPercent.B1': {
    key: 'participation.minAppPercent.B1',
    defaultValue: 100,
    parse: (raw) =>
      parseIntInRange('participation.minAppPercent.B1', raw, 0, 100),
    companyLevelOnly: true,
  },
};
```

Then in `server/src/settings/settings.types.spec.ts` extend the expected list of the first test: after `'kpi.promiseKept.value',` add

```ts
        'participation.minAttendancePercent',
        'participation.minAppPercent.A1',
        'participation.minAppPercent.A2',
        'participation.minAppPercent.B1',
```

- [ ] **Step 4: Run both settings specs**

Run: `cd server && npx jest src/settings`
Expected: PASS (the new spec, the registry spec, and every older settings spec).

- [ ] **Step 5: Write the failing DTO spec**

Create `server/src/participation-certificates/dto/participation-settings.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ParticipationSettingsDto } from './participation-settings.dto';

async function errorsFor(body: unknown) {
  return validate(plainToInstance(ParticipationSettingsDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('ParticipationSettingsDto', () => {
  it('accepts a full and a partial patch', async () => {
    expect(
      await errorsFor({
        minAttendancePercent: 75,
        minAppPercent: { A1: 90, A2: 80, B1: 100 },
      }),
    ).toHaveLength(0);
    expect(await errorsFor({ minAppPercent: { A1: 90 } })).toHaveLength(0);
    expect(await errorsFor({})).toHaveLength(0);
  });

  it.each([
    { minAttendancePercent: 101 },
    { minAttendancePercent: -1 },
    { minAttendancePercent: 79.5 },
    { minAppPercent: { A1: 101 } },
    { minAppPercent: { B2: 50 } },
    { somethingElse: 1 },
  ])('rejects %j', async (body) => {
    expect((await errorsFor(body)).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run it and see it fail**

Run: `cd server && npx jest src/participation-certificates/dto`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the DTO**

Create `server/src/participation-certificates/dto/participation-settings.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';

const MIN = { message: "Foiz 0 dan kam bo'lmaydi" };
const MAX = { message: "Foiz 100 dan oshmasin" };
const INT = { message: "Foiz butun son bo'lishi kerak" };

/** The app threshold of each level the Student App teaches. */
export class MinAppPercentDto {
  @IsOptional()
  @IsInt(INT)
  @Min(0, MIN)
  @Max(100, MAX)
  A1?: number;

  @IsOptional()
  @IsInt(INT)
  @Min(0, MIN)
  @Max(100, MAX)
  A2?: number;

  @IsOptional()
  @IsInt(INT)
  @Min(0, MIN)
  @Max(100, MAX)
  B1?: number;
}

/** `PATCH /participation-certificates/settings` (CEO). */
export class ParticipationSettingsDto {
  @IsOptional()
  @IsInt(INT)
  @Min(0, MIN)
  @Max(100, MAX)
  minAttendancePercent?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => MinAppPercentDto)
  minAppPercent?: MinAppPercentDto;
}
```

- [ ] **Step 8: Write the failing settings-service spec**

Create `server/src/participation-certificates/participation-settings.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { ParticipationSettingsService } from './participation-settings.service';

function makeService(values: Record<string, number> = {}) {
  const settings = {
    get: jest.fn((_company: number, key: string) =>
      Promise.resolve(values[key] ?? (key.includes('Attendance') ? 80 : 100)),
    ),
    setMany: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new ParticipationSettingsService(settings as never), settings };
}

describe('ParticipationSettingsService', () => {
  it('reads the four numbers', async () => {
    const { service } = makeService({
      'participation.minAttendancePercent': 75,
      'participation.minAppPercent.A2': 60,
    });
    expect(await service.read(1001)).toEqual({
      minAttendancePercent: 75,
      minAppPercent: { A1: 100, A2: 60, B1: 100 },
    });
  });

  it('writes only what the patch names, in one setMany call', async () => {
    const { service, settings } = makeService();
    await service.update(
      1001,
      { minAttendancePercent: 70, minAppPercent: { B1: 90 } },
      7,
    );
    expect(settings.setMany).toHaveBeenCalledTimes(1);
    expect(settings.setMany).toHaveBeenCalledWith(
      1001,
      [
        ['participation.minAttendancePercent', 70],
        ['participation.minAppPercent.B1', 90],
      ],
      7,
    );
  });

  it('refuses an empty patch', async () => {
    const { service, settings } = makeService();
    await expect(service.update(1001, {}, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(settings.setMany).not.toHaveBeenCalled();
  });

  it('gives the app threshold only to the levels the app teaches', () => {
    const { service } = makeService();
    const s = {
      minAttendancePercent: 80,
      minAppPercent: { A1: 100, A2: 90, B1: 70 },
    };
    expect(service.thresholdsFor(s, 'A2')).toEqual({ attendance: 80, app: 90 });
    expect(service.thresholdsFor(s, 'B2')).toEqual({ attendance: 80, app: null });
  });
});
```

- [ ] **Step 9: Run it and see it fail**

Run: `cd server && npx jest src/participation-certificates/participation-settings.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 10: Implement the settings service**

Create `server/src/participation-certificates/participation-settings.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import type { SettingKey } from '../settings/settings.types';
import {
  APP_LEVELS,
  isAppLevel,
  type AppLevel,
  type Thresholds,
} from './participation-rules';

export interface ParticipationSettings {
  minAttendancePercent: number;
  minAppPercent: Record<AppLevel, number>;
}

export interface ParticipationSettingsPatch {
  minAttendancePercent?: number;
  minAppPercent?: Partial<Record<AppLevel, number>>;
}

/** The CEO's thresholds for the Teilnahmebestätigung, company-level (spec 3.3). */
@Injectable()
export class ParticipationSettingsService {
  constructor(private settings: SettingsService) {}

  async read(companyId: number): Promise<ParticipationSettings> {
    const [attendance, a1, a2, b1] = await Promise.all([
      this.settings.get(companyId, 'participation.minAttendancePercent'),
      this.settings.get(companyId, 'participation.minAppPercent.A1'),
      this.settings.get(companyId, 'participation.minAppPercent.A2'),
      this.settings.get(companyId, 'participation.minAppPercent.B1'),
    ]);
    return {
      minAttendancePercent: attendance,
      minAppPercent: { A1: a1, A2: a2, B1: b1 },
    };
  }

  async update(
    companyId: number,
    patch: ParticipationSettingsPatch,
    userId: number,
  ): Promise<ParticipationSettings> {
    const entries: [SettingKey, unknown][] = [];
    if (patch.minAttendancePercent !== undefined) {
      entries.push([
        'participation.minAttendancePercent',
        patch.minAttendancePercent,
      ]);
    }
    for (const level of APP_LEVELS) {
      const value = patch.minAppPercent?.[level];
      if (value !== undefined) {
        entries.push([`participation.minAppPercent.${level}`, value]);
      }
    }
    if (entries.length === 0) {
      throw new BadRequestException('Kamida bitta sozlama yuborilishi kerak');
    }
    // One transaction: the numbers are never seen half-saved.
    await this.settings.setMany(companyId, entries, userId);
    return this.read(companyId);
  }

  thresholdsFor(settings: ParticipationSettings, level: string): Thresholds {
    return {
      attendance: settings.minAttendancePercent,
      app: isAppLevel(level) ? settings.minAppPercent[level] : null,
    };
  }
}
```

- [ ] **Step 11: Run, format, lint, commit**

Run: `cd server && npx jest src/participation-certificates src/settings && npx prettier --write src/participation-certificates src/settings/settings.types.ts src/settings/settings.types.spec.ts src/settings/participation-settings.spec.ts && npx eslint src/participation-certificates src/settings`
Expected: PASS, eslint clean.

```bash
git add server/src/settings server/src/participation-certificates
git commit -m "feat(participation): thresholds as company settings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `ParticipationCertificate` model and migration

**Files:**
- Modify: `server/prisma/schema.prisma` (add the model after `KpiResult`)
- Create: `server/prisma/migrations/20261017120000_participation_certificate/migration.sql` (pick a timestamp later than the newest folder in `server/prisma/migrations/`; the one shown is the newest at planning time)

**Interfaces:**
- Produces: the Prisma delegate `prisma.participationCertificate` with fields `id, companyId, branchId, studentId, level, year, seq, number, issuedAt, issuedById, snapshot, exemptReason, exemptById, revokedAt, revokedReason`.

- [ ] **Step 1: Add the model**

In `server/prisma/schema.prisma`, directly after the `KpiResult` model (ends `@@index([paymentId])` + `}`), add:

```prisma
/// Berilgan har «Teilnahmebestätigung» bitta qator. `snapshot` hujjat
/// berilgan paytdagi hisobni MUHRLAYDI: keyin davomat tuzatilsa yoki
/// chegara o'zgarsa ham berilgan hujjatning raqamlari qimirlamaydi.
/// `branchId` faqat kirish huquqi uchun; hujjatga ham, ochiq sahifaga ham
/// chiqmaydi. Hujjat hech qachon o'chirilmaydi; `revokedAt` bekor qilish
/// ustuni (hozircha yozadigan yo'l yo'q, ochiq sahifa uni o'qiydi).
model ParticipationCertificate {
  id            String    @id @default(uuid())
  companyId     Int
  branchId      Int?
  studentId     Int
  level         String
  year          Int
  seq           Int
  number        String
  issuedAt      DateTime  @default(now())
  issuedById    Int
  snapshot      Json
  exemptReason  String?
  exemptById    Int?
  revokedAt     DateTime?
  revokedReason String?

  @@unique([companyId, year, seq])
  @@index([studentId, level])
}
```

- [ ] **Step 2: Write the migration by hand (idempotent, like the other hand-written ones)**

Create `server/prisma/migrations/20261017120000_participation_certificate/migration.sql`:

```sql
-- Teilnahmebestätigung (spec 2026-10-17): one row per issued document,
-- the count sealed in `snapshot`. Idempotent, like the other hand-written
-- migrations here.
CREATE TABLE IF NOT EXISTS "ParticipationCertificate" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "studentId" INTEGER NOT NULL,
  "level" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "seq" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedById" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "exemptReason" TEXT,
  "exemptById" INTEGER,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  CONSTRAINT "ParticipationCertificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ParticipationCertificate_companyId_year_seq_key"
  ON "ParticipationCertificate"("companyId", "year", "seq");

CREATE INDEX IF NOT EXISTS "ParticipationCertificate_studentId_level_idx"
  ON "ParticipationCertificate"("studentId", "level");
```

- [ ] **Step 3: Validate and regenerate**

Run: `cd server && npx prisma validate && npx prisma generate`
Expected: «The schema … is valid» and «Generated Prisma Client».

If a throwaway local database is available (see the project memory «throwaway local DB»), also run `npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script` after applying the migration to it and confirm the diff is empty. Without a database this check is skipped; the deploy step applies the migration (`npm run db:migrate:deploy`).

- [ ] **Step 4: Typecheck and commit**

Run: `cd server && npm run typecheck`
Expected: PASS.

```bash
git add server/prisma
git commit -m "feat(participation): ParticipationCertificate model and migration

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Facts service (read-only loader)

**Files:**
- Create: `server/src/participation-certificates/participation-facts.service.ts`
- Create: `server/src/participation-certificates/participation-facts.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 rules and types; `storedBirthDay` from `../contract-documents/contract-fields`; `tashkentDateStr` from `../common/date/tashkent`.
- Produces: `ParticipationFactsService.load(studentId: number, companyId: number, onlyLevel?: GerLevel): Promise<StudentFacts>` — throws `NotFoundException("O'quvchi topilmadi")` when the student is not in the company; `levels` is sorted A1…C2 and holds only levels with attendance rows (only `onlyLevel` when given).

- [ ] **Step 1: Write the failing spec**

Create `server/src/participation-certificates/participation-facts.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { ParticipationFactsService } from './participation-facts.service';

type Row = {
  date: Date;
  status: AttendanceStatus;
  cancellationId: string | null;
  groupId: string;
  group: {
    name: string;
    level: string | null;
    lessonMinutes: number | null;
    course: { name: string; lessonMinutes: number | null };
  };
};

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const group = (
  name: string,
  level: string | null,
  courseName = `Deutsch ${level}`,
  lessonMinutes: number | null = 90,
) => ({
  name,
  level,
  lessonMinutes,
  course: { name: courseName, lessonMinutes: null },
});
const att = (
  date: string,
  status: AttendanceStatus,
  groupId: string,
  g: Row['group'],
  cancellationId: string | null = null,
): Row => ({ date: d(date), status, cancellationId, groupId, group: g });

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    student: {
      findFirst: jest.fn().mockResolvedValue({
        firstName: 'Madina',
        lastName: 'Karimova',
        dateOfBirth: new Date('2004-03-13T19:00:00.000Z'),
      }),
    },
    attendance: { findMany: jest.fn().mockResolvedValue([]) },
    plannedAbsence: { findMany: jest.fn().mockResolvedValue([]) },
    dafLesson: { findMany: jest.fn().mockResolvedValue([]) },
    dafLessonProgress: { findMany: jest.fn().mockResolvedValue([]) },
    dafSession: { findMany: jest.fn().mockResolvedValue([]) },
    mockExamParticipant: { findFirst: jest.fn().mockResolvedValue(null) },
    ...over,
  };
}

describe('ParticipationFactsService', () => {
  it('404s for a student of another company', async () => {
    const prisma = makePrisma({
      student: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      new ParticipationFactsService(prisma as never).load(10001, 1001),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reads the birth date as the Tashkent day', async () => {
    const prisma = makePrisma();
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    expect(facts.student).toEqual({
      firstName: 'Madina',
      lastName: 'Karimova',
      dateOfBirth: '2004-03-14',
    });
  });

  it('tallies a level over several groups, counting an announced «sababsiz» absence and skipping a cancelled lesson', async () => {
    const g1 = group('A1-17', 'A1');
    const g2 = group('A1-21', 'a1', 'Deutsch A1 Intensiv', 60);
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', g1),
      att('2026-07-09', AttendanceStatus.LATE, 'g1', g1),
      att('2026-07-14', AttendanceStatus.EXCUSED, 'g1', g1), // announced sababsiz
      att('2026-07-16', AttendanceStatus.EXCUSED, 'g1', g1, 'c1'), // cancelled
      att('2026-08-04', AttendanceStatus.ABSENT, 'g2', g2),
      att('2026-08-06', AttendanceStatus.PRESENT, 'g2', g2),
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
      plannedAbsence: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ groupId: 'g1', date: d('2026-07-14') }]),
      },
    });
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    expect(facts.levels).toHaveLength(1);
    const a1 = facts.levels[0];
    expect(a1.level).toBe('A1');
    expect(a1.attendance).toEqual({
      attended: 3,
      late: 1,
      absent: 2,
      counted: 5,
      percent: 60,
    });
    expect(a1.groupNames).toEqual(['A1-17', 'A1-21']);
    expect(a1.from).toBe('2026-07-07');
    expect(a1.to).toBe('2026-08-06');
    // The latest group names the course and the lesson length.
    expect(a1.courseName).toBe('Deutsch A1 Intensiv');
    expect(a1.lessonMinutes).toBe(60);
  });

  it('lists groups without a GER level apart and keeps them out of the levels', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', group('X-1', null)),
      att('2026-07-09', AttendanceStatus.PRESENT, 'g2', group('Y-1', 'Beginner')),
      att('2026-07-11', AttendanceStatus.PRESENT, 'g3', group('A2-3', 'A2')),
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
    });
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    expect(facts.unleveledGroups.sort()).toEqual(['X-1', 'Y-1']);
    expect(facts.levels.map((l) => l.level)).toEqual(['A2']);
  });

  it('sorts levels A1 to C2 and honours onlyLevel', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g2', group('B1-1', 'B1')),
      att('2026-07-09', AttendanceStatus.PRESENT, 'g1', group('A1-1', 'A1')),
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
    });
    const svc = new ParticipationFactsService(prisma as never);
    expect((await svc.load(10001, 1001)).levels.map((l) => l.level)).toEqual([
      'A1',
      'B1',
    ]);
    expect(
      (await svc.load(10001, 1001, 'B1')).levels.map((l) => l.level),
    ).toEqual(['B1']);
  });

  it('measures the app over open lessons only and counts passed unit tests', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', group('A1-17', 'A1')),
    ];
    const lessons = [
      { id: 1, unitId: 10, kind: 'SECTION_A', _count: { exercises: 3 } },
      { id: 2, unitId: 10, kind: 'UNIT_TEST', _count: { exercises: 0 } },
      { id: 3, unitId: 11, kind: 'SECTION_A', _count: { exercises: 0 } },
      { id: 4, unitId: 11, kind: 'UNIT_TEST', _count: { exercises: 0 } },
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
      dafLesson: { findMany: jest.fn().mockResolvedValue(lessons) },
      dafLessonProgress: {
        findMany: jest.fn().mockResolvedValue([{ lessonId: 1 }]),
      },
      dafSession: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ lessonId: 2 }, { lessonId: 2 }]),
      },
    });
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    const a1 = facts.levels[0];
    // Open: lesson 1 (has exercises) and lesson 2 (unit test of a unit with
    // material). Lessons 3 and 4 belong to a unit with no material yet.
    expect(a1.app).toEqual({ applies: true, done: 1, open: 2, percent: 50 });
    expect(a1.unitTests).toEqual({ passed: 1, total: 1 });
    expect(prisma.dafLessonProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lessonId: { in: [1, 2] } }),
      }),
    );
  });

  it('does not ask the app about a level it does not teach', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', group('B2-1', 'B2')),
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
    });
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    expect(facts.levels[0].app.applies).toBe(false);
    expect(facts.levels[0].unitTests).toBeNull();
    expect(prisma.dafLesson.findMany).not.toHaveBeenCalled();
  });

  it('adds the latest graded mock result of the level', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', group('A1-17', 'A1')),
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
      mockExamParticipant: {
        findFirst: jest.fn().mockResolvedValue({
          totalScore: 72,
          gradedAt: new Date('2026-10-08T07:00:00.000Z'),
          exam: { maxScore: 100, examDate: new Date('2026-10-07T04:00:00.000Z') },
        }),
      },
    });
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    expect(facts.levels[0].mock).toEqual({
      score: 72,
      maxScore: 100,
      date: '2026-10-07',
    });
    expect(prisma.mockExamParticipant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: 10001,
          companyId: 1001,
          deletedAt: null,
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd server && npx jest src/participation-certificates/participation-facts.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the loader**

Create `server/src/participation-certificates/participation-facts.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DafLessonKind, PlannedAbsenceKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentDateStr } from '../common/date/tashkent';
import { storedBirthDay } from '../contract-documents/contract-fields';
import {
  GER_LEVELS,
  isAppLevel,
  normalizeLevel,
  tallyApp,
  tallyAttendance,
  type AppLevel,
  type AppTally,
  type GerLevel,
} from './participation-rules';
import type { LevelFacts, StudentFacts } from './participation-types';

/** A `@db.Date` column read as its calendar day (UTC midnight). */
const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Loads what the database says about one student's levels. Read-only; it
 * decides nothing (`participation-rules.ts` does). An attendance row exists
 * only for a day the student was on the roster of a held lesson, so holidays,
 * cancelled and unmarked lessons need no calendar reconstruction (spec 3.1).
 */
@Injectable()
export class ParticipationFactsService {
  constructor(private prisma: PrismaService) {}

  async load(
    studentId: number,
    companyId: number,
    onlyLevel?: GerLevel,
  ): Promise<StudentFacts> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId },
      select: { firstName: true, lastName: true, dateOfBirth: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const [rows, planned] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { studentId, companyId, group: { deletedAt: null } },
        select: {
          date: true,
          status: true,
          cancellationId: true,
          groupId: true,
          group: {
            select: {
              name: true,
              level: true,
              lessonMinutes: true,
              course: { select: { name: true, lessonMinutes: true } },
            },
          },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.plannedAbsence.findMany({
        where: { studentId, companyId, kind: PlannedAbsenceKind.SABABSIZ },
        select: { groupId: true, date: true },
      }),
    ]);
    const plannedKeys = new Set(
      planned.map((p) => `${p.groupId}|${dayOf(p.date)}`),
    );

    const byLevel = new Map<GerLevel, typeof rows>();
    const unleveled = new Set<string>();
    for (const row of rows) {
      const level = normalizeLevel(row.group.level);
      if (level === null) {
        unleveled.add(row.group.name);
        continue;
      }
      if (onlyLevel && level !== onlyLevel) continue;
      const bucket = byLevel.get(level);
      if (bucket) bucket.push(row);
      else byLevel.set(level, [row]);
    }

    const levels: LevelFacts[] = [];
    for (const level of GER_LEVELS) {
      const levelRows = byLevel.get(level);
      if (!levelRows) continue;
      const attendance = tallyAttendance(
        levelRows.map((r) => ({
          status: r.status,
          cancellationId: r.cancellationId,
          plannedUnexcused: plannedKeys.has(`${r.groupId}|${dayOf(r.date)}`),
        })),
      );
      const latest = levelRows[levelRows.length - 1].group;
      const groupNames = [...new Set(levelRows.map((r) => r.group.name))];
      const appFacts = isAppLevel(level)
        ? await this.appFacts(studentId, level)
        : { app: tallyApp(0, 0), unitTests: null };
      levels.push({
        level,
        groupNames,
        courseName: latest.course.name,
        lessonMinutes: latest.lessonMinutes ?? latest.course.lessonMinutes ?? null,
        from: dayOf(levelRows[0].date),
        to: dayOf(levelRows[levelRows.length - 1].date),
        attendance,
        app: appFacts.app,
        unitTests: appFacts.unitTests,
        mock: await this.mockFor(studentId, companyId, level),
      });
    }

    return {
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        dateOfBirth: student.dateOfBirth
          ? storedBirthDay(student.dateOfBirth)
          : null,
      },
      levels,
      unleveledGroups: [...unleveled],
    };
  }

  /**
   * Open lessons of a level (spec 3.2): a lesson with exercises, or the unit
   * test of a unit that has at least one lesson with exercises. A unit with
   * no material yet contributes nothing, so the share the CEO asks for is the
   * share of what students can actually do today.
   */
  private async appFacts(
    studentId: number,
    level: AppLevel,
  ): Promise<{
    app: AppTally;
    unitTests: { passed: number; total: number } | null;
  }> {
    const lessons = await this.prisma.dafLesson.findMany({
      where: { unit: { level, retiredAt: null } },
      select: {
        id: true,
        unitId: true,
        kind: true,
        _count: { select: { exercises: true } },
      },
    });
    const unitsWithMaterial = new Set(
      lessons.filter((l) => l._count.exercises > 0).map((l) => l.unitId),
    );
    const open = lessons.filter(
      (l) =>
        l._count.exercises > 0 ||
        (l.kind === DafLessonKind.UNIT_TEST && unitsWithMaterial.has(l.unitId)),
    );
    const openIds = open.map((l) => l.id);
    if (openIds.length === 0) return { app: tallyApp(0, 0), unitTests: null };

    const done = await this.prisma.dafLessonProgress.findMany({
      where: {
        studentId,
        lessonId: { in: openIds },
        completedAt: { not: null },
      },
      select: { lessonId: true },
    });

    const testIds = open
      .filter((l) => l.kind === DafLessonKind.UNIT_TEST)
      .map((l) => l.id);
    let unitTests: { passed: number; total: number } | null = null;
    if (testIds.length > 0) {
      const passed = await this.prisma.dafSession.findMany({
        where: { studentId, passed: true, lessonId: { in: testIds } },
        select: { lessonId: true },
      });
      unitTests = {
        passed: new Set(passed.map((s) => s.lessonId)).size,
        total: testIds.length,
      };
    }
    return {
      app: tallyApp(new Set(done.map((p) => p.lessonId)).size, openIds.length),
      unitTests,
    };
  }

  /** The latest graded mock result of the level; none when the participant is not linked to the card. */
  private async mockFor(
    studentId: number,
    companyId: number,
    level: GerLevel,
  ): Promise<LevelFacts['mock']> {
    const mock = await this.prisma.mockExamParticipant.findFirst({
      where: {
        studentId,
        companyId,
        deletedAt: null,
        level: { equals: level, mode: 'insensitive' },
        totalScore: { not: null },
        gradedAt: { not: null },
      },
      orderBy: { gradedAt: 'desc' },
      select: {
        totalScore: true,
        gradedAt: true,
        exam: { select: { maxScore: true, examDate: true } },
      },
    });
    if (!mock || mock.totalScore === null) return null;
    const when = mock.exam.examDate ?? mock.gradedAt;
    return {
      score: mock.totalScore,
      maxScore: mock.exam.maxScore,
      date: when ? tashkentDateStr(when) : null,
    };
  }
}
```

- [ ] **Step 4: Run the spec, typecheck, lint**

Run: `cd server && npx jest src/participation-certificates/participation-facts.service.spec.ts && npm run typecheck && npx prettier --write src/participation-certificates && npx eslint src/participation-certificates`
Expected: PASS. If `typecheck` rejects a Prisma field (for example the `exam` relation name or `lessonMinutes` on `Course`), read the model in `server/prisma/schema.prisma` and fix the SELECT — never loosen the test.

- [ ] **Step 5: Commit**

```bash
git add server/src/participation-certificates
git commit -m "feat(participation): read-only facts loader

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fonts and the PDF template

> **First invoke the `pdf` skill** (project rule). Then follow the steps below.

**Files:**
- Create (download): `server/assets/fonts/IBMPlexSerif-SemiBold.ttf`, `IBMPlexSans-Regular.ttf`, `IBMPlexSans-SemiBold.ttf`, `IBMPlexSans-Italic.ttf`, and `IBMPlex-OFL.txt` (license)
- Modify: `server/src/receipts/pdf/render.ts` (the `fonts` object)
- Create: `server/src/participation-certificates/participation-certificate-pdf.ts`
- Create: `server/src/participation-certificates/participation-certificate-pdf.spec.ts`

**Interfaces:**
- Consumes: `CertificateSnapshot` (Task 1 types), `renderPdf` and `getCompanyLogoDataUrl` from `../receipts/pdf/render`, `tashkentDateStr`, `GER_LEVELS`.
- Produces: `overviewRows(snapshot): { area; result; note }[]`, `buildCertificateDoc({ snapshot, number, issuedAt, qrDataUrl, logoDataUrl }): TDocumentDefinitions`, `renderCertificatePdf({ snapshot, number, issuedAt, url }): Promise<Buffer>`.

- [ ] **Step 1: Download the four font files and the license**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/feat-teilnahmebestaetigung/server/assets/fonts
curl -fsSL -o IBMPlexSerif-SemiBold.ttf "https://fonts.gstatic.com/s/ibmplexserif/v20/jizAREVNn1dOx-zrZ2X3pZvkTi3A_xIz.ttf"
curl -fsSL -o IBMPlexSans-Regular.ttf  "https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llzAA.ttf"
curl -fsSL -o IBMPlexSans-SemiBold.ttf "https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDNF5zAA.ttf"
curl -fsSL -o IBMPlexSans-Italic.ttf   "https://fonts.gstatic.com/s/ibmplexsans/v23/zYXEKVElMYYaJe8bpLHnCwDKhdTEG46kmUZQCX598fQbM4jw8V78x9OWIhqbQ6g9.ttf"
curl -fsSL -o IBMPlex-OFL.txt "https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt"
ls -la
```
Expected: the four `.ttf` files are 150–230 KB each, `IBMPlex-OFL.txt` is a few KB. If a URL has moved, get the current one from `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Serif:wght@600` (and `…IBM+Plex+Sans:ital,wght@1,400` for the italic) with a non-browser `User-Agent` such as `curl/8`; the CSS lists the `.ttf` addresses.

Check the glyphs once (the spec's «O'zbekcha harflar» promise): every file must cover `ʻ ʼ ’ ' ä ö ü ß`.

```bash
cd ../.. && node -e "
const fk=require('@foliojs-fork/fontkit');
for (const f of ['IBMPlexSerif-SemiBold','IBMPlexSans-Regular','IBMPlexSans-SemiBold','IBMPlexSans-Italic']) {
  const font=fk.openSync('assets/fonts/'+f+'.ttf');
  const miss=[...'ʻʼ’\'äöüß'].filter(c=>!font.hasGlyphForCodePoint(c.codePointAt(0)));
  console.log(f, miss.length? 'MISSING '+miss.join(''): 'ok');
}"
```
Expected: four lines ending in `ok`.

- [ ] **Step 2: Register the two families in the shared renderer**

In `server/src/receipts/pdf/render.ts` replace the `fonts` constant

```ts
const fonts = {
  Inter: {
    normal: path.join(FONT_DIR, 'Inter-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Inter-Bold.ttf'),
    italics: path.join(FONT_DIR, 'Inter-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'Inter-BoldItalic.ttf'),
  },
};
```

with

```ts
const fonts = {
  Inter: {
    normal: path.join(FONT_DIR, 'Inter-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Inter-Bold.ttf'),
    italics: path.join(FONT_DIR, 'Inter-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'Inter-BoldItalic.ttf'),
  },
  // Teilnahmebestätigung (spec 2026-10-17): one weight of the serif for
  // titles and numbers, the sans for everything else. The receipts keep Inter.
  PlexSerif: {
    normal: path.join(FONT_DIR, 'IBMPlexSerif-SemiBold.ttf'),
    bold: path.join(FONT_DIR, 'IBMPlexSerif-SemiBold.ttf'),
    italics: path.join(FONT_DIR, 'IBMPlexSerif-SemiBold.ttf'),
    bolditalics: path.join(FONT_DIR, 'IBMPlexSerif-SemiBold.ttf'),
  },
  PlexSans: {
    normal: path.join(FONT_DIR, 'IBMPlexSans-Regular.ttf'),
    bold: path.join(FONT_DIR, 'IBMPlexSans-SemiBold.ttf'),
    italics: path.join(FONT_DIR, 'IBMPlexSans-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'IBMPlexSans-Italic.ttf'),
  },
};
```

- [ ] **Step 3: Write the failing PDF spec**

Create `server/src/participation-certificates/participation-certificate-pdf.spec.ts`:

```ts
import {
  buildCertificateDoc,
  overviewRows,
  renderCertificatePdf,
} from './participation-certificate-pdf';
import type { CertificateSnapshot } from './participation-types';

const full: CertificateSnapshot = {
  version: 1,
  student: { firstName: 'Madina', lastName: 'Karimova', dateOfBirth: '2004-03-14' },
  level: 'A1',
  courseName: 'Deutsch A1 · Standardkurs',
  groupNames: ['A1-17'],
  lessonMinutes: 90,
  from: '2026-07-07',
  to: '2026-10-15',
  attendance: { attended: 21, late: 2, absent: 2, counted: 23, percent: 91 },
  app: { applies: true, done: 80, open: 80, percent: 100 },
  unitTests: { passed: 5, total: 5 },
  mock: { score: 72, maxScore: 100, date: '2026-10-07' },
  thresholds: { attendance: 80, app: 100 },
  exempt: false,
};

const minimal: CertificateSnapshot = {
  ...full,
  student: { ...full.student, dateOfBirth: null },
  lessonMinutes: null,
  courseName: null,
  app: { applies: false, done: 0, open: 0, percent: null },
  unitTests: null,
  mock: null,
  thresholds: { attendance: 80, app: null },
};

const build = (snapshot: CertificateSnapshot) =>
  buildCertificateDoc({
    snapshot,
    number: 'TB-2026-0001',
    issuedAt: new Date('2026-10-17T07:00:00.000Z'),
    qrDataUrl: 'data:image/png;base64,AAAA',
    logoDataUrl: null,
  });

describe('overviewRows', () => {
  it('prints every row of the sample', () => {
    expect(overviewRows(full)).toEqual([
      { area: 'Anwesenheit', result: '91 %', note: '21 von 23 Unterrichtseinheiten' },
      { area: 'Verspätungen', result: '2', note: '' },
      { area: 'Lernplattform', result: '100 %', note: '80 von 80 Lektionen abgeschlossen' },
      { area: 'Abschlusstests', result: '5 von 5', note: 'bestanden' },
      { area: 'Mock-Prüfung', result: '72 Punkte', note: 'von 100 · 07.10.2026' },
    ]);
  });

  it('drops the rows that have no data', () => {
    expect(overviewRows(minimal).map((r) => r.area)).toEqual([
      'Anwesenheit',
      'Verspätungen',
    ]);
  });

  it('writes a decimal score with a German comma', () => {
    const rows = overviewRows({
      ...full,
      mock: { score: 72.5, maxScore: 100, date: null },
    });
    expect(rows[rows.length - 1]).toEqual({
      area: 'Mock-Prüfung',
      result: '72,5 Punkte',
      note: 'von 100',
    });
  });
});

describe('buildCertificateDoc', () => {
  const text = (snapshot: CertificateSnapshot) =>
    JSON.stringify(build(snapshot));

  it('prints the person, the period, the number and the issue day', () => {
    const json = text(full);
    expect(json).toContain('Karimova, Madina');
    expect(json).toContain('14.03.2004');
    expect(json).toContain('07.07.2026 – 15.10.2026');
    expect(json).toContain('TB-2026-0001');
    expect(json).toContain('Ausgestellt am');
    expect(json).toContain('17.10.2026');
    expect(json).toContain('23 (à 90 Minuten)');
  });

  it('never prints a branch, a course head, a stamp or a place', () => {
    expect(text(full)).not.toMatch(
      /filial|Kursleitung|Zentrumsleitung|Stempel|Fargʻona|Unterschrift/i,
    );
  });

  it('leaves a missing birth date and lesson length out instead of printing a hole', () => {
    const json = text(minimal);
    expect(json).not.toContain('Geburtsdatum');
    expect(json).toContain('"23"');
    expect(json).toContain('Deutsch A1');
  });

  it('is one A4 page', () => {
    expect(build(full).pageSize).toBe('A4');
  });
});

describe('renderCertificatePdf', () => {
  const pages = (buf: Buffer) =>
    (buf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

  it('renders one page with every optional row', async () => {
    const buf = await renderCertificatePdf({
      snapshot: full,
      number: 'TB-2026-0001',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      url: 'https://admin.dafzentrum.uz/t/3f9c2a7e-5b1d-4c8a-9e60-2d7f81a4c0b3',
    });
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pages(buf)).toBe(1);
  });

  it('renders one page with none of them', async () => {
    const buf = await renderCertificatePdf({
      snapshot: minimal,
      number: 'TB-2026-0002',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      url: 'https://admin.dafzentrum.uz/t/x',
    });
    expect(pages(buf)).toBe(1);
  });
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `cd server && npx jest src/participation-certificates/participation-certificate-pdf.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the template**

Create `server/src/participation-certificates/participation-certificate-pdf.ts`:

```ts
import QRCode from 'qrcode';
import type {
  Content,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { tashkentDateStr } from '../common/date/tashkent';
import { getCompanyLogoDataUrl, renderPdf } from '../receipts/pdf/render';
import { GER_LEVELS } from './participation-rules';
import type { CertificateSnapshot } from './participation-types';

/**
 * The «Teilnahmebestätigung» page (spec 6, approved sample v8). One A4 page,
 * German text, issued in the name of DaF Sprachzentrum: no branch, no course
 * head, no stamp, no place. Every figure comes from the sealed snapshot.
 *
 * Plain flow, no background layer: a page-sized background block that does not
 * fit inside the page margins is dropped silently by pdfmake.
 */

const C = {
  navy: '#17375E',
  gold: '#B8924A',
  ink: '#101828',
  muted: '#667085',
  line: '#C9CED6',
  head: '#EEF2F7',
};
const MARGIN = 54;
const CONTENT_WIDTH = 595.28 - 2 * MARGIN;
const NO_BORDER: CustomTableLayout = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};
// Layouts are typed constants, not inline objects: an inline function inside
// the big `Content` union gets no contextual parameter types and fails
// `noImplicitAny`.
const FIELDS_LAYOUT: CustomTableLayout = {
  hLineWidth: (i) => (i === 0 ? 0 : 0.5),
  hLineColor: () => C.line,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};
const RESULTS_LAYOUT: CustomTableLayout = {
  hLineWidth: (i, node) =>
    i === 0 || i === 1 || i === node.table.body.length ? 0.9 : 0.5,
  hLineColor: (i, node) =>
    i === 0 || i === 1 || i === node.table.body.length ? C.navy : C.line,
  vLineWidth: () => 0,
  paddingLeft: (i) => (i === 0 ? 6 : 8),
  paddingRight: (i, node) => (i === (node.table.widths?.length ?? 1) - 1 ? 6 : 8),
  paddingTop: () => 0,
  paddingBottom: () => 0,
};
const SCALE_LAYOUT: CustomTableLayout = {
  hLineWidth: () => 0.75,
  vLineWidth: () => 0.75,
  hLineColor: () => C.line,
  vLineColor: () => C.line,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

/** 'YYYY-MM-DD' → 'dd.MM.yyyy'. */
function de(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

/** A German decimal: 72.5 → '72,5'. */
function num(n: number): string {
  return String(n).replace('.', ',');
}

export interface OverviewRow {
  area: string;
  result: string;
  note: string;
}

/** The rows of «Teilnahme im Überblick»; a row without data is not drawn. */
export function overviewRows(s: CertificateSnapshot): OverviewRow[] {
  const rows: OverviewRow[] = [
    {
      area: 'Anwesenheit',
      result: `${s.attendance.percent ?? 0} %`,
      note: `${s.attendance.attended} von ${s.attendance.counted} Unterrichtseinheiten`,
    },
    { area: 'Verspätungen', result: String(s.attendance.late), note: '' },
  ];
  if (s.app.applies) {
    rows.push({
      area: 'Lernplattform',
      result: `${s.app.percent ?? 0} %`,
      note: `${s.app.done} von ${s.app.open} Lektionen abgeschlossen`,
    });
  }
  if (s.unitTests) {
    rows.push({
      area: 'Abschlusstests',
      result: `${s.unitTests.passed} von ${s.unitTests.total}`,
      note: 'bestanden',
    });
  }
  if (s.mock) {
    rows.push({
      area: 'Mock-Prüfung',
      result: `${num(s.mock.score)} Punkte`,
      note: `von ${num(s.mock.maxScore)}${s.mock.date ? ` · ${de(s.mock.date)}` : ''}`,
    });
  }
  return rows;
}

function fieldRow(label: string, value: string): TableCell[] {
  return [
    { text: label, fontSize: 9.5, color: C.muted, margin: [0, 5, 0, 3] },
    {
      text: value,
      font: 'PlexSerif',
      fontSize: 12,
      bold: true,
      color: C.ink,
      margin: [0, 4, 0, 3],
    },
  ];
}

function resultRow(row: OverviewRow): TableCell[] {
  return [
    { text: row.area, fontSize: 10, margin: [0, 5, 0, 5] },
    {
      text: row.result,
      font: 'PlexSerif',
      fontSize: 11,
      bold: true,
      color: C.navy,
      alignment: 'right',
      margin: [0, 5, 0, 5],
    },
    { text: row.note, fontSize: 9, color: C.muted, margin: [0, 5, 0, 5] },
  ];
}

function headCell(text: string, alignment?: 'right'): TableCell {
  return {
    text,
    fontSize: 9,
    bold: true,
    color: C.muted,
    fillColor: C.head,
    alignment,
    margin: [0, 5, 0, 5],
  };
}

function scale(level: string): Content {
  return {
    table: {
      widths: ['*', '*', '*', '*', '*', '*'],
      body: [
        GER_LEVELS.map(
          (l): TableCell => ({
            text: l,
            alignment: 'center',
            bold: true,
            fontSize: 11,
            color: l === level ? '#FFFFFF' : C.muted,
            fillColor: l === level ? C.navy : undefined,
            margin: [0, 7, 0, 7],
          }),
        ),
      ],
    },
    layout: SCALE_LAYOUT,
  };
}

export interface CertificateDocInput {
  snapshot: CertificateSnapshot;
  number: string;
  issuedAt: Date;
  qrDataUrl: string;
  logoDataUrl: string | null;
}

export function buildCertificateDoc(
  input: CertificateDocInput,
): TDocumentDefinitions {
  const { snapshot: s, number, issuedAt, qrDataUrl, logoDataUrl } = input;
  const issued = de(tashkentDateStr(issuedAt));

  const fields: TableCell[][] = [
    fieldRow('Name, Vorname', `${s.student.lastName}, ${s.student.firstName}`),
  ];
  if (s.student.dateOfBirth) {
    fields.push(fieldRow('Geburtsdatum', de(s.student.dateOfBirth)));
  }
  fields.push(
    fieldRow('Kurs', s.courseName ?? `Deutsch ${s.level}`),
    fieldRow('Zeitraum', `${de(s.from)} – ${de(s.to)}`),
    fieldRow(
      'Unterrichtseinheiten',
      `${s.attendance.counted}${s.lessonMinutes ? ` (à ${s.lessonMinutes} Minuten)` : ''}`,
    ),
  );

  const rows = overviewRows(s);

  return {
    pageSize: 'A4',
    pageMargins: [MARGIN, 38, MARGIN, 26],
    defaultStyle: {
      font: 'PlexSans',
      fontSize: 11,
      color: C.ink,
      lineHeight: 1.25,
    },
    info: { title: `Teilnahmebestätigung ${number}` },
    content: [
      {
        columns: [
          logoDataUrl
            ? { image: logoDataUrl, width: 104, margin: [0, 2, 0, 0] }
            : { text: 'DaF Sprachzentrum', bold: true, fontSize: 12 },
          { width: '*', text: '' },
          {
            width: 'auto',
            stack: [
              {
                text: 'DaF Sprachzentrum',
                fontSize: 11,
                bold: true,
                alignment: 'right',
              },
              {
                text: `Nr. ${number}`,
                fontSize: 9.5,
                bold: true,
                alignment: 'right',
                margin: [0, 6, 0, 0],
              },
              {
                text: 'Echtheit prüfen: QR-Code scannen',
                fontSize: 7.5,
                color: C.muted,
                alignment: 'right',
              },
            ],
          },
          { width: 10, text: '' },
          { width: 58, image: qrDataUrl, margin: [0, 2, 0, 0] },
        ],
      },
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: CONTENT_WIDTH,
            y2: 0,
            lineWidth: 1.2,
            lineColor: C.navy,
          },
        ],
        margin: [0, 14, 0, 0],
      },
      {
        columns: [
          {
            width: '*',
            stack: [
              {
                text: 'TEILNAHMEBESTÄTIGUNG',
                font: 'PlexSerif',
                fontSize: 24,
                bold: true,
                color: C.navy,
                characterSpacing: 0.5,
                margin: [0, 20, 0, 2],
              },
              {
                text: `Deutsch als Fremdsprache · Niveau ${s.level}`,
                fontSize: 12,
                color: C.muted,
              },
            ],
          },
          {
            width: 'auto',
            margin: [0, 16, 0, 0],
            table: {
              body: [
                [
                  {
                    stack: [
                      {
                        text: s.level,
                        font: 'PlexSerif',
                        fontSize: 24,
                        bold: true,
                        color: '#FFFFFF',
                        alignment: 'center',
                      },
                      {
                        text: 'NIVEAU',
                        fontSize: 6.5,
                        bold: true,
                        color: '#E3C987',
                        characterSpacing: 2,
                        alignment: 'center',
                        margin: [0, 1, 0, 0],
                      },
                    ],
                    fillColor: C.navy,
                    margin: [11, 7, 11, 7],
                  },
                ],
              ],
            },
            layout: NO_BORDER,
          },
        ],
      },
      {
        table: { widths: [150, '*'], body: fields },
        layout: FIELDS_LAYOUT,
        margin: [0, 26, 0, 0],
      },
      {
        text: [
          'hat im genannten Zeitraum ',
          { text: 'regelmäßig', bold: true },
          ' am Deutschunterricht auf dem Niveau ',
          { text: s.level, bold: true },
          ' des Gemeinsamen europäischen Referenzrahmens für Sprachen (GER) teilgenommen.',
        ],
        lineHeight: 1.45,
        margin: [0, 14, 0, 18],
      },
      {
        text: 'Teilnahme im Überblick',
        fontSize: 11,
        bold: true,
        color: C.navy,
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          widths: [150, 90, '*'],
          body: [
            [
              headCell('Bereich'),
              headCell('Ergebnis', 'right'),
              headCell('Erläuterung'),
            ],
            ...rows.map(resultRow),
          ],
        },
        layout: RESULTS_LAYOUT,
      },
      {
        text: 'Diese Bestätigung bescheinigt die Teilnahme am Kurs. Sie ist kein Sprachzertifikat und ersetzt keine Prüfung.',
        italics: true,
        color: C.muted,
        fontSize: 8.5,
        margin: [0, 8, 0, 16],
      },
      {
        text: 'Niveaustufen des Gemeinsamen europäischen Referenzrahmens für Sprachen (GER)',
        fontSize: 8.5,
        color: C.muted,
        margin: [0, 0, 0, 5],
      },
      scale(s.level),
      {
        text: [
          { text: 'Ausgestellt am ', color: C.muted },
          { text: issued, bold: true },
        ],
        fontSize: 10,
        margin: [0, 28, 0, 0],
      },
    ],
  };
}

export interface CertificatePdfInput {
  snapshot: CertificateSnapshot;
  number: string;
  issuedAt: Date;
  /** What the QR code opens: the public `/t/<uuid>` page. */
  url: string;
}

export async function renderCertificatePdf(
  input: CertificatePdfInput,
): Promise<Buffer> {
  const qrDataUrl = await QRCode.toDataURL(input.url, {
    margin: 0,
    errorCorrectionLevel: 'M',
    width: 300,
    color: { dark: C.navy, light: '#FFFFFF' },
  });
  return renderPdf(
    buildCertificateDoc({
      snapshot: input.snapshot,
      number: input.number,
      issuedAt: input.issuedAt,
      qrDataUrl,
      logoDataUrl: getCompanyLogoDataUrl(),
    }),
  );
}
```

- [ ] **Step 6: Run the PDF spec, typecheck, lint**

Run: `cd server && npx jest src/participation-certificates/participation-certificate-pdf.spec.ts src/receipts && npm run typecheck && npx prettier --write src/participation-certificates src/receipts/pdf/render.ts && npx eslint src/participation-certificates src/receipts/pdf/render.ts`
Expected: PASS (the receipt specs still pass: Inter is unchanged). If TypeScript objects to a `margin` or `font` literal, annotate the helper's return type as `TableCell`/`Content`; do not cast to `any`.

- [ ] **Step 7: Look at the page once**

Write a throwaway script outside the repo (use the session scratchpad) that renders `full` from the spec to a PDF and convert it: `pdftoppm -png -r 90 -singlefile out.pdf out`, then open the PNG. It must match the approved sample: logo and QR in the header, navy `A1` badge, field block, five-row table, GER scale with `A1` filled, «Ausgestellt am …» at the bottom, one page.

- [ ] **Step 8: Commit**

```bash
git add server/assets/fonts server/src/receipts/pdf/render.ts server/src/participation-certificates
git commit -m "feat(participation): Teilnahmebestätigung PDF with IBM Plex

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Certificates service

**Files:**
- Modify: `server/src/receipts/receipt-urls.ts` (add `publicBaseUrl`)
- Modify: `server/src/receipts/receipts.service.ts` (its private `publicBaseUrl` delegates)
- Create: `server/src/participation-certificates/dto/issue-certificate.dto.ts`
- Create: `server/src/participation-certificates/participation-certificates.service.ts`
- Create: `server/src/participation-certificates/participation-certificates.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `ParticipationCertificatesService`:
  - `preview(userId, companyId, studentId): Promise<CertificatePreview>`
  - `issue(userId, companyId, studentId, dto: { level: string; exemptReason?: string }): Promise<IssuedView>`
  - `pdf(userId, companyId, id): Promise<{ buffer: Buffer; filename: string }>`
  - `verify(id): Promise<VerifyView>`
  - `IssueCertificateDto { level: string; exemptReason?: string }`
  - `publicBaseUrl(config: ConfigService): string`

- [ ] **Step 1: One public-address function for receipts and certificates**

In `server/src/receipts/receipt-urls.ts` append:

```ts
import type { ConfigService } from '@nestjs/config';

/**
 * The frontend host a public QR page lives on: `PUBLIC_BASE_URL`, else
 * `APP_URL`, else the admin host. Receipts and the Teilnahmebestätigung both
 * build their `/r/<id>` and `/t/<id>` links from it.
 */
export function publicBaseUrl(config: ConfigService): string {
  return (
    config.get<string>('PUBLIC_BASE_URL') ??
    config.get<string>('APP_URL') ??
    'https://admin.dafzentrum.uz'
  );
}
```

(Put the `import` at the top of the file with the other imports.) In `server/src/receipts/receipts.service.ts` add `import { publicBaseUrl } from './receipt-urls';` (merge with an existing import from that file if there is one) and replace the body of the private method:

```ts
  private publicBaseUrl(): string {
    return publicBaseUrl(this.config);
  }
```

Run: `cd server && npx jest src/receipts`
Expected: PASS (no behaviour change).

- [ ] **Step 2: Write the DTO**

Create `server/src/participation-certificates/dto/issue-certificate.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { GER_LEVELS } from '../participation-rules';

/** `POST /students/:id/participation-certificates`. */
export class IssueCertificateDto {
  @IsIn([...GER_LEVELS], { message: "Daraja noto'g'ri" })
  level!: string;

  /** Only the CEO may use it, and only when the student does not meet the rule. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: "Sabab matn bo'lishi kerak" })
  @MaxLength(500, { message: "Sabab 500 belgidan oshmasin" })
  exemptReason?: string;
}
```

- [ ] **Step 3: Write the failing service spec**

Create `server/src/participation-certificates/participation-certificates.service.spec.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ParticipationCertificatesService } from './participation-certificates.service';
import type { LevelFacts, StudentFacts } from './participation-types';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn().mockResolvedValue(3),
}));
jest.mock('./participation-certificate-pdf', () => ({
  renderCertificatePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
}));

import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { renderCertificatePdf } from './participation-certificate-pdf';

const level = (over: Partial<LevelFacts> = {}): LevelFacts => ({
  level: 'A1',
  groupNames: ['A1-17'],
  courseName: 'Deutsch A1',
  lessonMinutes: 90,
  from: '2026-07-07',
  to: '2026-10-15',
  attendance: { attended: 21, late: 2, absent: 2, counted: 23, percent: 91 },
  app: { applies: true, done: 80, open: 80, percent: 100 },
  unitTests: { passed: 5, total: 5 },
  mock: null,
  ...over,
});

const facts = (levels: LevelFacts[]): StudentFacts => ({
  student: { firstName: 'Madina', lastName: 'Karimova', dateOfBirth: '2004-03-14' },
  levels,
  unleveledGroups: [],
});

const SETTINGS = {
  minAttendancePercent: 80,
  minAppPercent: { A1: 100, A2: 100, B1: 100 },
};

function make(over: { facts?: StudentFacts; lastSeq?: number | null; ceo?: boolean } = {}) {
  const created: unknown[] = [];
  const tx = {
    participationCertificate: {
      findFirst: jest
        .fn()
        .mockResolvedValue(over.lastSeq == null ? null : { seq: over.lastSeq }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({
          id: 'uuid-1',
          issuedAt: new Date('2026-10-17T07:00:00.000Z'),
          revokedAt: null,
          ...data,
        });
      }),
    },
  };
  const prisma = {
    participationCertificate: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(over.ceo ? { id: 7 } : null),
    },
    company: { findFirst: jest.fn().mockResolvedValue({ name: 'DaF Sprachzentrum' }) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => Promise.resolve(fn(tx))),
  };
  const factsService = {
    load: jest.fn().mockResolvedValue(over.facts ?? facts([level()])),
  };
  const settings = {
    read: jest.fn().mockResolvedValue(SETTINGS),
    thresholdsFor: jest.fn((_s: unknown, lvl: string) => ({
      attendance: 80,
      app: ['A1', 'A2', 'B1'].includes(lvl) ? 100 : null,
    })),
  };
  const history = { recordCreate: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new ParticipationCertificatesService(
    prisma as never,
    factsService as never,
    settings as never,
    history as never,
    config as never,
  );
  return { service, prisma, tx, created, factsService, history };
}

beforeEach(() => jest.clearAllMocks());

describe('preview', () => {
  it('checks the student branch, then returns each level with its verdict and issued list', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findMany.mockResolvedValue([
      {
        id: 'c1',
        level: 'A1',
        number: 'TB-2026-0001',
        issuedAt: new Date('2026-10-01T05:00:00.000Z'),
        exemptReason: null,
        revokedAt: null,
      },
    ]);
    const out = await service.preview(7, 1001, 10001);
    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith(
      expect.anything(),
      7,
      10001,
      1001,
    );
    expect(out.levels).toHaveLength(1);
    expect(out.levels[0].verdict.eligible).toBe(true);
    expect(out.levels[0].thresholds).toEqual({ attendance: 80, app: 100 });
    expect(out.levels[0].issued).toEqual([
      {
        id: 'c1',
        number: 'TB-2026-0001',
        level: 'A1',
        issuedAt: '2026-10-01T05:00:00.000Z',
        exempt: false,
        revoked: false,
      },
    ]);
  });
});

describe('issue', () => {
  it('numbers the next certificate of the year, stores the snapshot and writes the student history', async () => {
    const { service, created, history } = make({ lastSeq: 41 });
    const out = await service.issue(7, 1001, 10001, { level: 'A1' });
    expect(out).toMatchObject({
      id: 'uuid-1',
      number: expect.stringMatching(/^TB-\d{4}-0042$/),
      level: 'A1',
      exempt: false,
      revoked: false,
    });
    const data = created[0] as Record<string, unknown>;
    expect(data).toMatchObject({
      companyId: 1001,
      branchId: 3,
      studentId: 10001,
      level: 'A1',
      seq: 42,
      issuedById: 7,
      exemptReason: null,
      exemptById: null,
    });
    expect((data.snapshot as { attendance: { percent: number } }).attendance.percent).toBe(91);
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 10001,
        companyId: 1001,
        changedById: 7,
        newValues: expect.objectContaining({
          action: 'QATNASHISH_HUJJATI_BERILDI',
          daraja: 'A1',
        }),
      }),
    );
  });

  it('starts a fresh year at 0001', async () => {
    const { service, created } = make({ lastSeq: null });
    await service.issue(7, 1001, 10001, { level: 'A1' });
    expect((created[0] as { seq: number }).seq).toBe(1);
  });

  it('refuses a student below the rule and names the reason', async () => {
    const weak = level({
      attendance: { attended: 37, late: 0, absent: 13, counted: 50, percent: 74 },
    });
    const { service } = make({ facts: facts([weak]) });
    await expect(service.issue(7, 1001, 10001, { level: 'A1' })).rejects.toThrow(
      /Davomat 74%, kerak 80%/,
    );
  });

  it('refuses an exemption from anyone but the CEO', async () => {
    const weak = level({
      attendance: { attended: 37, late: 0, absent: 13, counted: 50, percent: 74 },
    });
    const { service, prisma } = make({ facts: facts([weak]), ceo: false });
    await expect(
      service.issue(7, 1001, 10001, { level: 'A1', exemptReason: 'Kasal edi' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets the CEO give an exemption and records who and why', async () => {
    const weak = level({
      attendance: { attended: 37, late: 0, absent: 13, counted: 50, percent: 74 },
    });
    const { service, created, history } = make({ facts: facts([weak]), ceo: true });
    const out = await service.issue(7, 1001, 10001, {
      level: 'A1',
      exemptReason: '  Kasal edi  ',
    });
    expect(out.exempt).toBe(true);
    expect(created[0]).toMatchObject({ exemptReason: 'Kasal edi', exemptById: 7 });
    expect(
      (created[0] as { snapshot: { exempt: boolean } }).snapshot.exempt,
    ).toBe(true);
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({ istisno: 'Kasal edi' }),
      }),
    );
  });

  it('ignores an exemption reason when the student already qualifies', async () => {
    const { service, created } = make({ ceo: false });
    await service.issue(7, 1001, 10001, { level: 'A1', exemptReason: 'kerak emas' });
    expect(created[0]).toMatchObject({ exemptReason: null, exemptById: null });
  });

  it('404s for a level the student never attended and 400s for a bad level', async () => {
    const { service } = make({ facts: facts([]) });
    await expect(service.issue(7, 1001, 10001, { level: 'A1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.issue(7, 1001, 10001, { level: 'Z9' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rolls conflicting sequence numbers into a 409', async () => {
    const { service, prisma } = make();
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    await expect(service.issue(7, 1001, 10001, { level: 'A1' })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('verify', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    number: 'TB-2026-0001',
    level: 'A1',
    issuedAt: new Date('2026-10-17T07:00:00.000Z'),
    companyId: 1001,
    revokedAt: null,
    snapshot: {
      student: { firstName: 'Madina', lastName: 'Karimova', dateOfBirth: '2004-03-14' },
      from: '2026-07-07',
      to: '2026-10-15',
    },
    ...over,
  });

  it('404s for an unknown id', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(null);
    await expect(service.verify('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows only what the public page may show', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(row());
    expect(await service.verify('uuid-1')).toEqual({
      valid: true,
      revoked: false,
      number: 'TB-2026-0001',
      studentName: 'Madina Karimova',
      level: 'A1',
      from: '2026-07-07',
      to: '2026-10-15',
      issuedAt: '2026-10-17T07:00:00.000Z',
      companyName: 'DaF Sprachzentrum',
    });
  });

  it('marks a revoked document invalid', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(
      row({ revokedAt: new Date('2026-10-18T00:00:00.000Z') }),
    );
    expect(await service.verify('uuid-1')).toMatchObject({ valid: false, revoked: true });
  });
});

describe('pdf', () => {
  it('checks the student branch and renders from the stored snapshot, QR to the public page', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue({
      id: 'uuid-1',
      studentId: 10001,
      number: 'TB-2026-0001',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      snapshot: { version: 1 },
    });
    const out = await service.pdf(7, 1001, 'uuid-1');
    expect(assertCallerMayTouchStudent).toHaveBeenCalledWith(
      expect.anything(),
      7,
      10001,
      1001,
    );
    expect(renderCertificatePdf).toHaveBeenCalledWith({
      snapshot: { version: 1 },
      number: 'TB-2026-0001',
      issuedAt: new Date('2026-10-17T07:00:00.000Z'),
      url: 'https://admin.dafzentrum.uz/t/uuid-1',
    });
    expect(out.filename).toBe('TB-2026-0001.pdf');
    expect(out.buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('404s for a certificate of another company', async () => {
    const { service, prisma } = make();
    prisma.participationCertificate.findFirst.mockResolvedValue(null);
    await expect(service.pdf(7, 1001, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.participationCertificate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'x', companyId: 1001 } }),
    );
  });
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `cd server && npx jest src/participation-certificates/participation-certificates.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the service**

Create `server/src/participation-certificates/participation-certificates.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { whereUserMayAct } from '../common/auth/blocked-user';
import { ROLE_ID } from '../common/auth/role-ids';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { tashkentDateStr } from '../common/date/tashkent';
import { rethrowAsConflict } from '../common/transaction-conflict';
import { publicBaseUrl } from '../receipts/receipt-urls';
import { renderCertificatePdf } from './participation-certificate-pdf';
import { ParticipationFactsService } from './participation-facts.service';
import { certificateNumber } from './participation-number';
import { evaluate, normalizeLevel } from './participation-rules';
import { ParticipationSettingsService } from './participation-settings.service';
import { buildSnapshot } from './participation-snapshot';
import type {
  CertificatePreview,
  CertificateSnapshot,
  IssuedView,
  VerifyView,
} from './participation-types';

const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

interface IssuedRow {
  id: string;
  number: string;
  level: string;
  issuedAt: Date;
  exemptReason: string | null;
  revokedAt: Date | null;
}

const toIssuedView = (r: IssuedRow): IssuedView => ({
  id: r.id,
  number: r.number,
  level: r.level,
  issuedAt: r.issuedAt.toISOString(),
  exempt: r.exemptReason !== null,
  revoked: r.revokedAt !== null,
});

/**
 * «Teilnahmebestätigung» (spec 2026-10-17): preview what a student qualifies
 * for, issue a sealed document, serve its PDF and its public QR answer.
 * Counting and thresholds live in `participation-rules.ts`; this service only
 * loads, decides through it, and writes.
 */
@Injectable()
export class ParticipationCertificatesService {
  constructor(
    private prisma: PrismaService,
    private facts: ParticipationFactsService,
    private settings: ParticipationSettingsService,
    private history: EntityHistoryService,
    private config: ConfigService,
  ) {}

  async preview(
    userId: number,
    companyId: number,
    studentId: number,
  ): Promise<CertificatePreview> {
    await assertCallerMayTouchStudent(this.prisma, userId, studentId, companyId);
    const [data, settings, issued] = await Promise.all([
      this.facts.load(studentId, companyId),
      this.settings.read(companyId),
      this.prisma.participationCertificate.findMany({
        where: { studentId, companyId },
        orderBy: { issuedAt: 'desc' },
        select: {
          id: true,
          level: true,
          number: true,
          issuedAt: true,
          exemptReason: true,
          revokedAt: true,
        },
      }),
    ]);
    return {
      studentId,
      unleveledGroups: data.unleveledGroups,
      levels: data.levels.map((facts) => {
        const thresholds = this.settings.thresholdsFor(settings, facts.level);
        return {
          ...facts,
          thresholds,
          verdict: evaluate(facts.attendance, facts.app, thresholds),
          issued: issued
            .filter((i) => i.level === facts.level)
            .map(toIssuedView),
        };
      }),
    };
  }

  async issue(
    userId: number,
    companyId: number,
    studentId: number,
    dto: { level: string; exemptReason?: string },
  ): Promise<IssuedView> {
    const branchId = await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const level = normalizeLevel(dto.level);
    if (!level) throw new BadRequestException("Daraja noto'g'ri");

    const data = await this.facts.load(studentId, companyId, level);
    const facts = data.levels[0];
    if (!facts) {
      throw new NotFoundException("Bu daraja bo'yicha davomat topilmadi");
    }
    const thresholds = this.settings.thresholdsFor(
      await this.settings.read(companyId),
      level,
    );
    const verdict = evaluate(facts.attendance, facts.app, thresholds);

    const reason = dto.exemptReason?.trim() || null;
    const exempt = !verdict.eligible;
    if (exempt) {
      if (!reason) {
        throw new BadRequestException(
          `Hujjat berib bo'lmaydi: ${verdict.reasons.join('; ')}`,
        );
      }
      await this.assertCeo(userId);
    }

    const snapshot = buildSnapshot(data.student, facts, thresholds, exempt);
    const issuedAt = new Date();
    const year = Number(tashkentDateStr(issuedAt).slice(0, 4));

    const row = await this.prisma
      .$transaction(async (tx) => {
        const last = await tx.participationCertificate.findFirst({
          where: { companyId, year },
          orderBy: { seq: 'desc' },
          select: { seq: true },
        });
        const seq = (last?.seq ?? 0) + 1;
        return tx.participationCertificate.create({
          data: {
            companyId,
            branchId,
            studentId,
            level,
            year,
            seq,
            number: certificateNumber(year, seq),
            issuedAt,
            issuedById: userId,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            exemptReason: exempt ? reason : null,
            exemptById: exempt ? userId : null,
          },
        });
      }, TX_OPTIONS)
      // The unique (company, year, seq) can only collide with a concurrent issue.
      .catch((e: unknown) => rethrowAsConflict(e, { duplicate: true }));

    await this.history.recordCreate({
      entityType: 'Student',
      entityId: studentId,
      newValues: {
        action: 'QATNASHISH_HUJJATI_BERILDI',
        raqam: row.number,
        daraja: level,
        istisno: exempt ? reason : null,
      },
      changedById: userId,
      companyId,
    });
    return toIssuedView(row);
  }

  async pdf(
    userId: number,
    companyId: number,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const row = await this.prisma.participationCertificate.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        studentId: true,
        number: true,
        issuedAt: true,
        snapshot: true,
      },
    });
    if (!row) throw new NotFoundException('Hujjat topilmadi');
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      row.studentId,
      companyId,
    );
    const buffer = await renderCertificatePdf({
      snapshot: row.snapshot as unknown as CertificateSnapshot,
      number: row.number,
      issuedAt: row.issuedAt,
      url: `${publicBaseUrl(this.config)}/t/${row.id}`,
    });
    return { buffer, filename: `${row.number}.pdf` };
  }

  /** The public QR answer: no branch, no birth date, no percentages. */
  async verify(id: string): Promise<VerifyView> {
    const row = await this.prisma.participationCertificate.findFirst({
      where: { id },
      select: {
        number: true,
        level: true,
        issuedAt: true,
        companyId: true,
        revokedAt: true,
        snapshot: true,
      },
    });
    if (!row) throw new NotFoundException('Hujjat topilmadi');
    const company = await this.prisma.company.findFirst({
      where: { id: row.companyId },
      select: { name: true },
    });
    const snapshot = row.snapshot as unknown as CertificateSnapshot;
    return {
      valid: row.revokedAt === null,
      revoked: row.revokedAt !== null,
      number: row.number,
      studentName: `${snapshot.student.firstName} ${snapshot.student.lastName}`,
      level: row.level,
      from: snapshot.from,
      to: snapshot.to,
      issuedAt: row.issuedAt.toISOString(),
      companyName: company?.name ?? 'DaF Sprachzentrum',
    };
  }

  /** The CEO role is read from the database, never from the token (ADR-0028). */
  private async assertCeo(userId: number): Promise<void> {
    const ceo = await this.prisma.user.findFirst({
      where: {
        id: userId,
        ...whereUserMayAct(),
        roles: { some: { role: { id: ROLE_ID.CEO } } },
      },
      select: { id: true },
    });
    if (!ceo) throw new ForbiddenException('Istisnoni faqat CEO bera oladi');
  }
}
```

- [ ] **Step 6: Run the spec, typecheck, lint**

Run: `cd server && npx jest src/participation-certificates src/receipts && npm run typecheck && npx prettier --write src/participation-certificates src/receipts && npx eslint src/participation-certificates src/receipts`
Expected: PASS. If the `user.roles` filter does not typecheck, open `model User` in `schema.prisma`, use its actual `UserRole` relation field names, and keep the same meaning (a live account whose roles include the CEO role id).

- [ ] **Step 7: Commit**

```bash
git add server/src/receipts server/src/participation-certificates
git commit -m "feat(participation): issue, preview, PDF and public verify

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Controllers, module, route manifests

**Files:**
- Create: `server/src/participation-certificates/student-certificates.controller.ts`
- Create: `server/src/participation-certificates/student-certificates.controller.spec.ts`
- Create: `server/src/participation-certificates/participation-certificates.controller.ts`
- Create: `server/src/participation-certificates/participation-certificates.controller.spec.ts`
- Create: `server/src/participation-certificates/participation-certificates.module.ts`
- Modify: `server/src/app.module.ts` (import the module)
- Modify: `server/src/common/permissions/route-access.snapshot.json` (six rows)
- Modify: `server/src/common/auth/branch-route-policy.ts` (one `PUBLIC` route, two new blocks)

**Interfaces:**
- Consumes: Task 6 service; `ParticipationSettingsService`.
- Produces: the six HTTP routes of the spec (5, Endpoints).

- [ ] **Step 1: Write the failing controller specs**

Create `server/src/participation-certificates/student-certificates.controller.spec.ts`:

```ts
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { StudentCertificatesController } from './student-certificates.controller';

describe('StudentCertificatesController', () => {
  it('the preview is gated by students.details: CEO, Branch Director, Administrator', () => {
    expect(routeAccess(StudentCertificatesController, 'preview')).toEqual({
      kind: 'can',
      keys: ['students.details'],
    });
    expect(defaultRolesOf(StudentCertificatesController, 'preview')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });

  it('issuing is gated by students.manage: CEO, Branch Director, Administrator', () => {
    expect(routeAccess(StudentCertificatesController, 'issue')).toEqual({
      kind: 'can',
      keys: ['students.manage'],
    });
    expect(defaultRolesOf(StudentCertificatesController, 'issue')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });

  it('passes the caller, the company, the student and the body to the service', async () => {
    const service = {
      preview: jest.fn().mockResolvedValue({ levels: [] }),
      issue: jest.fn().mockResolvedValue({ id: 'c1' }),
    };
    const controller = new StudentCertificatesController(service as never);

    await controller.preview(10001, 7, 1001);
    expect(service.preview).toHaveBeenCalledWith(7, 1001, 10001);

    await controller.issue(10001, { level: 'A1', exemptReason: 'x' }, 7, 1001);
    expect(service.issue).toHaveBeenCalledWith(7, 1001, 10001, {
      level: 'A1',
      exemptReason: 'x',
    });
  });
});
```

Create `server/src/participation-certificates/participation-certificates.controller.spec.ts`:

```ts
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { ParticipationCertificatesController } from './participation-certificates.controller';

describe('ParticipationCertificatesController', () => {
  it('the PDF is gated by students.details', () => {
    expect(routeAccess(ParticipationCertificatesController, 'pdf')).toEqual({
      kind: 'can',
      keys: ['students.details'],
    });
    expect(defaultRolesOf(ParticipationCertificatesController, 'pdf')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
  });

  it('the QR page is public', () => {
    expect(routeAccess(ParticipationCertificatesController, 'verify')).toEqual({
      kind: 'public',
    });
  });

  it.each(['getSettings', 'setSettings'])('%s is the CEO alone', (method) => {
    expect(routeAccess(ParticipationCertificatesController, method)).toEqual({
      kind: 'ceo',
    });
  });

  it('serves the PDF inline with its filename', async () => {
    const service = {
      pdf: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('%PDF'), filename: 'TB-2026-0001.pdf' }),
    };
    const settings = { read: jest.fn(), update: jest.fn() };
    const controller = new ParticipationCertificatesController(
      service as never,
      settings as never,
    );
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await controller.pdf('c1', 7, 1001, res as never);
    expect(service.pdf).toHaveBeenCalledWith(7, 1001, 'c1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="TB-2026-0001.pdf"',
    );
    expect(res.end).toHaveBeenCalledWith(Buffer.from('%PDF'));
  });

  it('reads and writes the thresholds for the caller’s company', async () => {
    const service = { pdf: jest.fn(), verify: jest.fn() };
    const settings = {
      read: jest.fn().mockResolvedValue({ minAttendancePercent: 80 }),
      update: jest.fn().mockResolvedValue({ minAttendancePercent: 70 }),
    };
    const controller = new ParticipationCertificatesController(
      service as never,
      settings as never,
    );
    await controller.getSettings(1001);
    expect(settings.read).toHaveBeenCalledWith(1001);
    await controller.setSettings({ minAttendancePercent: 70 }, 1001, 7);
    expect(settings.update).toHaveBeenCalledWith(1001, { minAttendancePercent: 70 }, 7);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd server && npx jest src/participation-certificates/student-certificates.controller.spec.ts src/participation-certificates/participation-certificates.controller.spec.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the controllers**

Create `server/src/participation-certificates/student-certificates.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { ParticipationCertificatesService } from './participation-certificates.service';

/**
 * The student card's «Hujjatlar» tab. No new capability: reading is what the
 * card's other tabs need (`students.details`), issuing is a change to the
 * student's record (`students.manage`). The student's branch is checked
 * inside the service (`assertCallerMayTouchStudent`).
 */
@Controller('students')
export class StudentCertificatesController {
  constructor(private readonly certificates: ParticipationCertificatesService) {}

  @Get(':id/participation-certificates/preview')
  @Can('students.details')
  preview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.certificates.preview(userId, companyId, id);
  }

  @Post(':id/participation-certificates')
  @Can('students.manage')
  issue(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueCertificateDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.certificates.issue(userId, companyId, id, dto);
  }
}
```

Create `server/src/participation-certificates/participation-certificates.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Public } from '../common/decorators';
import { IpThrottlerGuard } from '../common/guards';
import { Can, CeoOnly } from '../common/permissions/access.decorators';
import { ParticipationSettingsDto } from './dto/participation-settings.dto';
import { ParticipationCertificatesService } from './participation-certificates.service';
import { ParticipationSettingsService } from './participation-settings.service';

@Controller('participation-certificates')
export class ParticipationCertificatesController {
  constructor(
    private readonly certificates: ParticipationCertificatesService,
    private readonly settings: ParticipationSettingsService,
  ) {}

  /** The CEO's thresholds (Sozlamalar → «Qatnashganlik hujjati»). */
  @Get('settings')
  @CeoOnly()
  getSettings(@CurrentUser('companyId') companyId: number) {
    return this.settings.read(companyId);
  }

  @Patch('settings')
  @CeoOnly()
  setSettings(
    @Body() dto: ParticipationSettingsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.settings.update(companyId, dto, userId);
  }

  @Get(':id/pdf')
  @Can('students.details')
  async pdf(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.certificates.pdf(
      userId,
      companyId,
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /**
   * What the QR code opens. The UUID in the path is the access token, like
   * the receipt's (`/r/<id>`); the answer carries no branch, birth date or
   * percentage.
   */
  @Public()
  @UseGuards(IpThrottlerGuard)
  @Get(':id/verify')
  verify(@Param('id') id: string) {
    return this.certificates.verify(id);
  }
}
```

(The controller spec calls `res.setHeader` with `Content-Length` too; `jest.fn` accepts it — the assertions above only check the two headers they name.)

- [ ] **Step 4: Write the module and register it**

Create `server/src/participation-certificates/participation-certificates.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ParticipationCertificatesController } from './participation-certificates.controller';
import { ParticipationCertificatesService } from './participation-certificates.service';
import { ParticipationFactsService } from './participation-facts.service';
import { ParticipationSettingsService } from './participation-settings.service';
import { StudentCertificatesController } from './student-certificates.controller';

/** Teilnahmebestätigung (spec 2026-10-17, ADR in this PR). */
@Module({
  imports: [SettingsModule],
  controllers: [StudentCertificatesController, ParticipationCertificatesController],
  providers: [
    ParticipationFactsService,
    ParticipationSettingsService,
    ParticipationCertificatesService,
  ],
})
export class ParticipationCertificatesModule {}
```

In `server/src/app.module.ts` add `import { ParticipationCertificatesModule } from './participation-certificates/participation-certificates.module';` next to the other module imports and `ParticipationCertificatesModule,` in the `imports` array right after `KpiModule,`.

- [ ] **Step 5: Run the controller specs**

Run: `cd server && npx jest src/participation-certificates`
Expected: PASS.

- [ ] **Step 6: Add the six snapshot rows**

In `server/src/common/permissions/route-access.snapshot.json` insert each row at its alphabetical position among the other `GET` / `PATCH` / `POST` rows (the file is sorted by key). Copy the value format of neighbours: a role list is a sorted array of role names, a public route is the string `"PUBLIC"` (see the existing `"GET /receipts/:id/verify"` row).

```json
  "GET /participation-certificates/:id/pdf": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
  "GET /participation-certificates/:id/verify": "PUBLIC",
  "GET /participation-certificates/settings": [
    "CEO"
  ],
  "GET /students/:id/participation-certificates/preview": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
  "PATCH /participation-certificates/settings": [
    "CEO"
  ],
  "POST /students/:id/participation-certificates": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
```

- [ ] **Step 7: Classify the routes in the branch manifest**

In `server/src/common/auth/branch-route-policy.ts`:

(a) In the `PUBLIC` block's `routes` list add, in alphabetical order after `'GET /notifications/vapid-public-key',`:

```ts
      'GET /participation-certificates/:id/verify',
```

(b) Add two blocks next to the other `BRANCH_SCOPED_BY_ENTITY` / `COMPANY_WIDE` blocks (e.g. right after the KPI block):

```ts
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Teilnahmebestätigung (spec 2026-10-17). The student routes resolve the ' +
      "student's branch and check the caller against it with " +
      '`assertCallerMayTouchStudent`; the PDF loads the certificate, then does ' +
      "the same for its student. The header branch is never read: a document " +
      'belongs to the branch of the student it was issued for.',
    routes: [
      'GET /students/:id/participation-certificates/preview',
      'POST /students/:id/participation-certificates',
      'GET /participation-certificates/:id/pdf',
    ],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Teilnahmebestätigung thresholds: `participation.*` are company-level ' +
      'settings (`companyLevelOnly`) — one value for every branch. Both routes ' +
      'are CEO-only through `@CeoOnly()`.',
    routes: [
      'GET /participation-certificates/settings',
      'PATCH /participation-certificates/settings',
    ],
  },
```

- [ ] **Step 8: Run the manifest specs and the whole module**

Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts src/common/permissions src/participation-certificates`
Expected: PASS. A failure here names the route that is missing from a manifest or disagrees with its marker: fix the manifest entry, not the controller.

- [ ] **Step 9: Typecheck, build, full server suite, format, commit**

Run: `cd server && npm run typecheck && npm run build && npx prettier --write src/participation-certificates src/app.module.ts src/common/auth/branch-route-policy.ts && npx eslint src/participation-certificates src/app.module.ts src/common/auth/branch-route-policy.ts && npm test`
Expected: all PASS. (The full suite takes several minutes; do not run `build` and `test` in parallel — see the project memory about Prisma.)

```bash
git add server
git commit -m "feat(participation): routes, module and route manifests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client — the student card's «Hujjatlar» tab

**Files:**
- Create: `client/src/components/students/certificates/certificate-types.ts`
- Create: `client/src/components/students/certificates/certificate-rules.ts`
- Create: `client/src/components/students/certificates/certificate-rules.test.ts`
- Create: `client/src/components/students/certificates/certificate-queries.ts`
- Create: `client/src/components/students/certificates/student-certificates-tab.tsx`
- Modify: `client/src/components/students/student-profile-tabs.tsx`

**Interfaces:**
- Consumes: the server routes of Task 7.
- Produces: `StudentCertificatesTab` (`{ studentId: number }`), pure helpers `dmy`, `percentText`, `issueMode`, `levelSummary`.

- [ ] **Step 1: Write the types**

Create `client/src/components/students/certificates/certificate-types.ts`:

```ts
export type CertificateLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface AttendanceTally {
  attended: number;
  late: number;
  absent: number;
  counted: number;
  percent: number | null;
}

export interface AppTally {
  applies: boolean;
  done: number;
  open: number;
  percent: number | null;
}

export interface CertificateVerdict {
  attendanceOk: boolean;
  appOk: boolean | null;
  eligible: boolean;
  reasons: string[];
}

export interface IssuedCertificate {
  id: string;
  number: string;
  level: string;
  issuedAt: string;
  exempt: boolean;
  revoked: boolean;
}

export interface LevelPreview {
  level: CertificateLevel;
  groupNames: string[];
  courseName: string | null;
  lessonMinutes: number | null;
  from: string;
  to: string;
  attendance: AttendanceTally;
  app: AppTally;
  unitTests: { passed: number; total: number } | null;
  mock: { score: number; maxScore: number; date: string | null } | null;
  thresholds: { attendance: number; app: number | null };
  verdict: CertificateVerdict;
  issued: IssuedCertificate[];
}

export interface CertificatePreview {
  studentId: number;
  unleveledGroups: string[];
  levels: LevelPreview[];
}
```

- [ ] **Step 2: Write the failing pure-helper test**

Create `client/src/components/students/certificates/certificate-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dmy, issueMode, levelSummary, percentText } from "./certificate-rules";
import type { LevelPreview } from "./certificate-types";

const base: LevelPreview = {
  level: "A1",
  groupNames: ["A1-17"],
  courseName: "Deutsch A1",
  lessonMinutes: 90,
  from: "2026-07-07",
  to: "2026-10-15",
  attendance: { attended: 21, late: 2, absent: 2, counted: 23, percent: 91 },
  app: { applies: true, done: 80, open: 80, percent: 100 },
  unitTests: { passed: 5, total: 5 },
  mock: { score: 72, maxScore: 100, date: "2026-10-07" },
  thresholds: { attendance: 80, app: 100 },
  verdict: { attendanceOk: true, appOk: true, eligible: true, reasons: [] },
  issued: [],
};

describe("dmy", () => {
  it("turns YYYY-MM-DD into dd.MM.yyyy", () => {
    expect(dmy("2026-10-07")).toBe("07.10.2026");
  });
});

describe("percentText", () => {
  it("prints a percent or a dash", () => {
    expect(percentText(91)).toBe("91%");
    expect(percentText(null)).toBe("—");
  });
});

describe("issueMode", () => {
  it("is normal when the student qualifies, for everyone", () => {
    expect(issueMode(base, false)).toBe("normal");
    expect(issueMode(base, true)).toBe("normal");
  });
  it("is exempt for the CEO and blocked for anyone else when the student does not qualify", () => {
    const weak: LevelPreview = {
      ...base,
      verdict: { attendanceOk: false, appOk: null, eligible: false, reasons: ["Davomat 74%, kerak 80%"] },
    };
    expect(issueMode(weak, true)).toBe("exempt");
    expect(issueMode(weak, false)).toBe("blocked");
  });
});

describe("levelSummary", () => {
  it("lists attendance, app, late count, unit tests and mock", () => {
    expect(levelSummary(base)).toEqual([
      { label: "Davomat", value: "91% · 21 / 23 dars", hint: "chegara 80%" },
      { label: "Ilova", value: "100% · 80 / 80 dars", hint: "chegara 100%" },
      { label: "Kech qolgan", value: "2 marta", hint: null },
      { label: "Yakuniy sinovlar", value: "5 / 5", hint: null },
      { label: "Mock imtihon", value: "72 / 100 · 07.10.2026", hint: null },
    ]);
  });

  it("explains a level the app does not cover and leaves empty rows out", () => {
    const b2: LevelPreview = {
      ...base,
      level: "B2",
      app: { applies: false, done: 0, open: 0, percent: null },
      thresholds: { attendance: 80, app: null },
      unitTests: null,
      mock: null,
      attendance: { attended: 10, late: 0, absent: 0, counted: 10, percent: 100 },
    };
    expect(levelSummary(b2)).toEqual([
      { label: "Davomat", value: "100% · 10 / 10 dars", hint: "chegara 80%" },
      { label: "Ilova", value: "shart qo'llanmaydi", hint: null },
      { label: "Kech qolgan", value: "0 marta", hint: null },
    ]);
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd client && npx vitest run src/components/students/certificates/certificate-rules.test.ts`
Expected: FAIL — cannot find `./certificate-rules`.

- [ ] **Step 4: Implement the helpers**

Create `client/src/components/students/certificates/certificate-rules.ts`:

```ts
import type { LevelPreview } from "./certificate-types";

/** 'YYYY-MM-DD' → 'dd.MM.yyyy' (a calendar day, no timezone arithmetic). */
export function dmy(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

export function percentText(percent: number | null): string {
  return percent === null ? "—" : `${percent}%`;
}

/**
 * What the button may do. The server decides (and refuses a wrong call);
 * this only hides the button a caller cannot use: `exempt` is the CEO's
 * «Istisno bilan berish», `blocked` shows the reason instead of a button.
 */
export function issueMode(
  level: LevelPreview,
  isCeo: boolean,
): "normal" | "exempt" | "blocked" {
  if (level.verdict.eligible) return "normal";
  return isCeo ? "exempt" : "blocked";
}

export interface SummaryLine {
  label: string;
  value: string;
  hint: string | null;
}

/** The lines of one level's card; a line with nothing to say is left out. */
export function levelSummary(l: LevelPreview): SummaryLine[] {
  const lines: SummaryLine[] = [
    {
      label: "Davomat",
      value: `${percentText(l.attendance.percent)} · ${l.attendance.attended} / ${l.attendance.counted} dars`,
      hint: `chegara ${l.thresholds.attendance}%`,
    },
  ];
  if (l.app.applies) {
    lines.push({
      label: "Ilova",
      value: `${percentText(l.app.percent)} · ${l.app.done} / ${l.app.open} dars`,
      hint: l.thresholds.app === null ? null : `chegara ${l.thresholds.app}%`,
    });
  } else {
    lines.push({ label: "Ilova", value: "shart qo'llanmaydi", hint: null });
  }
  lines.push({ label: "Kech qolgan", value: `${l.attendance.late} marta`, hint: null });
  if (l.unitTests) {
    lines.push({
      label: "Yakuniy sinovlar",
      value: `${l.unitTests.passed} / ${l.unitTests.total}`,
      hint: null,
    });
  }
  if (l.mock) {
    lines.push({
      label: "Mock imtihon",
      value: `${l.mock.score} / ${l.mock.maxScore}${l.mock.date ? ` · ${dmy(l.mock.date)}` : ""}`,
      hint: null,
    });
  }
  return lines;
}
```

- [ ] **Step 5: Run it and see it pass**

Run: `cd client && npx vitest run src/components/students/certificates/certificate-rules.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the queries**

Create `client/src/components/students/certificates/certificate-queries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import type { CertificatePreview, IssuedCertificate } from "./certificate-types";

export const certificatePreviewKey = (studentId: number) =>
  ["participation-certificates", "preview", studentId] as const;

/** Lazy: pass `enabled` once the tab has been opened. */
export function useCertificatePreview(studentId: number, enabled: boolean) {
  return useQuery({
    queryKey: certificatePreviewKey(studentId),
    queryFn: () =>
      api
        .get<CertificatePreview>(`/students/${studentId}/participation-certificates/preview`)
        .then((r) => r.data),
    enabled,
    staleTime: 0,
  });
}

export async function issueCertificate(
  studentId: number,
  body: { level: string; exemptReason?: string },
): Promise<IssuedCertificate> {
  return (
    await api.post<IssuedCertificate>(`/students/${studentId}/participation-certificates`, body)
  ).data;
}

export function downloadCertificatePdf(id: string, number: string): Promise<void> {
  return downloadAuthedFile(`/participation-certificates/${id}/pdf`, `${number}.pdf`);
}
```

- [ ] **Step 7: Write the tab**

Create `client/src/components/students/certificates/student-certificates-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Download, FileCheck2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, isCeoUser } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-permissions";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  certificatePreviewKey,
  downloadCertificatePdf,
  issueCertificate,
  useCertificatePreview,
} from "./certificate-queries";
import { dmy, issueMode, levelSummary } from "./certificate-rules";
import type { IssuedCertificate, LevelPreview } from "./certificate-types";

/** The student card's «Hujjatlar» tab (spec 2026-10-17 §7). Every figure is the server's. */
export function StudentCertificatesTab({ studentId }: { studentId: number }) {
  const queryClient = useQueryClient();
  const isCeo = isCeoUser(useAuth((s) => s.user));
  const canIssue = useCan("students.manage");
  const { data, isLoading, isError, isFetching, refetch } = useCertificatePreview(studentId, true);

  const [busy, setBusy] = useState<string | null>(null);
  const [exemptFor, setExemptFor] = useState<LevelPreview | null>(null);
  const [reason, setReason] = useState("");

  async function give(level: LevelPreview, exemptReason?: string) {
    setBusy(level.level);
    try {
      const row = await issueCertificate(studentId, { level: level.level, exemptReason });
      toast.success(`Hujjat berildi: ${row.number}`);
      await queryClient.invalidateQueries({ queryKey: certificatePreviewKey(studentId) });
      setExemptFor(null);
      setReason("");
      await downloadCertificatePdf(row.id, row.number).catch(() => {});
    } catch (err) {
      toast.error(getErrorMessage(err, "Hujjat berishda xatolik yuz berdi"));
    } finally {
      setBusy(null);
    }
  }

  async function download(row: IssuedCertificate) {
    try {
      await downloadCertificatePdf(row.id, row.number);
    } catch (err) {
      toast.error(getErrorMessage(err, "PDF yuklab bo'lmadi"));
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Hujjat ma&apos;lumotini yuklab bo&apos;lmadi.</p>
        <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching && <Loader2 className="size-4 animate-spin" />}
          Qayta urinish
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.levels.length === 0 && (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">
            Bu o&apos;quvchi hali hech bir darajada davomatga yozilmagan
          </p>
        </div>
      )}

      {data.unleveledGroups.length > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          Guruh darajasi ko&apos;rsatilmagan: {data.unleveledGroups.join(", ")}. Bu guruhlar hisobga
          kirmaydi — guruhga daraja yozing.
        </p>
      )}

      {data.levels.map((level) => {
        const mode = issueMode(level, isCeo);
        return (
          <section key={level.level} className="space-y-3 rounded-lg border p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold">
                {level.level} daraja
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {dmy(level.from)} – {dmy(level.to)} · {level.groupNames.join(", ")}
                </span>
              </h3>
              <span
                className={
                  level.verdict.eligible
                    ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300"
                }
              >
                {level.verdict.eligible ? "Shart bajarilgan" : "Shart bajarilmagan"}
              </span>
            </header>

            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {levelSummary(level).map((line) => (
                <div key={line.label} className="flex items-baseline justify-between gap-3 border-b py-1">
                  <dt className="text-muted-foreground">{line.label}</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {line.value}
                    {line.hint && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{line.hint}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>

            {!level.verdict.eligible && (
              <p className="text-sm text-red-700 dark:text-red-400">{level.verdict.reasons.join(" · ")}</p>
            )}

            {canIssue && mode !== "blocked" && (
              <Button
                disabled={busy !== null}
                variant={mode === "exempt" ? "outline" : "default"}
                onClick={() => (mode === "exempt" ? setExemptFor(level) : void give(level))}
              >
                {busy === level.level ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileCheck2 className="size-4" />
                )}
                {mode === "exempt" ? "Istisno bilan berish" : "Hujjat berish"}
              </Button>
            )}

            {level.issued.length > 0 && (
              <ul className="divide-y rounded-md border text-sm">
                {level.issued.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="font-medium">{row.number}</span>
                    <span className="text-muted-foreground">
                      {dmy(row.issuedAt.slice(0, 10))}
                      {row.exempt && " · istisno bilan"}
                      {row.revoked && " · bekor qilingan"}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => void download(row)}>
                      <Download className="size-4" />
                      PDF
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <Dialog open={exemptFor !== null} onOpenChange={(open) => !open && !busy && setExemptFor(null)}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Istisno bilan hujjat berish</DialogTitle>
            <DialogDescription>
              {exemptFor?.verdict.reasons.join(" · ")}. Sabab hujjat tarixiga yoziladi.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
            <Textarea
              value={reason}
              maxLength={500}
              placeholder="Sababi (masalan: kasal bo'lgan, hujjati bor)"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" disabled={busy !== null} onClick={() => setExemptFor(null)}>
              Bekor qilish
            </Button>
            <Button
              disabled={busy !== null || reason.trim().length < 3}
              onClick={() => exemptFor && void give(exemptFor, reason.trim())}
            >
              {busy !== null && <Loader2 className="size-4 animate-spin" />}
              Berish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 8: Wire the tab into the student card**

In `client/src/components/students/student-profile-tabs.tsx`:

(a) Imports — next to the other tab imports add:

```tsx
import { StudentCertificatesTab } from "./certificates/student-certificates-tab";
```

(b) State — after `const contractsShown = useRef(false);` add:

```tsx
  const [certificatesVisible, setCertificatesVisible] = useState(false);
  const certificatesShown = useRef(false);
```

(c) Lazy-load — inside `handleTabChange`, after the `shartnomalar` block, add:

```tsx
      if (value === "hujjatlar" && !certificatesShown.current) {
        certificatesShown.current = true;
        setCertificatesVisible(true);
      }
```

(d) Trigger — after `{canSeeDetails && <TabsTrigger value="ilova">Ilova</TabsTrigger>}` add:

```tsx
          {canSeeDetails && <TabsTrigger value="hujjatlar">Hujjatlar</TabsTrigger>}
```

(e) Content — after the existing `<TabsContent value="ilova">…</TabsContent>` block (find it near the end of the `<Tabs>`), add:

```tsx
        {/* Hujjatlar — Teilnahmebestätigung */}
        {canSeeDetails && (
          <TabsContent value="hujjatlar">
            {certificatesVisible && <StudentCertificatesTab studentId={student.id} />}
          </TabsContent>
        )}
```

- [ ] **Step 9: Typecheck, lint, test, build, commit**

Run: `cd client && npx tsc --noEmit -p . && npx vitest run src/components/students && npx eslint src/components/students`
Expected: PASS, 0 lint errors. (Never run prettier here.)

```bash
git add client/src/components/students
git commit -m "feat(participation): Hujjatlar tab on the student card

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client — CEO settings page and the public QR page

**Files:**
- Create: `client/src/components/settings/participation-settings-draft.ts`
- Create: `client/src/components/settings/participation-settings-draft.test.ts`
- Create: `client/src/components/settings/participation-settings-client.tsx`
- Create: `client/src/app/(dashboard)/settings/participation/page.tsx`
- Modify: `client/src/lib/settings-nav.ts`
- Modify: `client/src/lib/settings-nav.test.ts`
- Modify: `client/src/lib/breadcrumb-routes.ts`
- Create: `client/src/app/t/layout.tsx`
- Create: `client/src/app/t/[id]/page.tsx`
- Create: `client/src/app/t/[id]/not-found.tsx`
- Modify: `client/src/middleware.ts`

**Interfaces:**
- Consumes: `GET/PATCH /participation-certificates/settings`, `GET /participation-certificates/:id/verify`.
- Produces: `/settings/participation` (CEO) and the public `/t/<uuid>` page.

> `client/AGENTS.md`: this Next.js has breaking changes. The code below only uses patterns that `client/src/app/r/[id]/` (layout, `page.tsx`, `not-found.tsx`, `params: Promise<…>`, `fetch` with `next: { revalidate }`) already uses — copy that folder's shape. For anything else, read the matching guide in `client/node_modules/next/dist/docs/` before writing it.

- [ ] **Step 1: Write the failing draft test**

Create `client/src/components/settings/participation-settings-draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { draftError, draftPatch, toDraft, type ParticipationSettings } from "./participation-settings-draft";

const saved: ParticipationSettings = {
  minAttendancePercent: 80,
  minAppPercent: { A1: 100, A2: 100, B1: 100 },
};

describe("participation settings draft", () => {
  it("starts from the saved numbers as text", () => {
    expect(toDraft(saved)).toEqual({ attendance: "80", A1: "100", A2: "100", B1: "100" });
  });

  it("sends only what changed", () => {
    const draft = { ...toDraft(saved), attendance: "75", B1: "90" };
    expect(draftPatch(saved, draft)).toEqual({
      minAttendancePercent: 75,
      minAppPercent: { B1: 90 },
    });
  });

  it("sends nothing when nothing changed", () => {
    expect(draftPatch(saved, toDraft(saved))).toBeNull();
  });

  it.each(["", "abc", "101", "-1", "7.5"])("refuses %j", (value) => {
    expect(draftError({ ...toDraft(saved), attendance: value })).not.toBeNull();
  });

  it("accepts 0 and 100", () => {
    expect(draftError({ ...toDraft(saved), attendance: "0", A1: "100" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd client && npx vitest run src/components/settings/participation-settings-draft.test.ts`
Expected: FAIL — cannot find the module.

- [ ] **Step 3: Implement the draft helpers**

Create `client/src/components/settings/participation-settings-draft.ts`:

```ts
export type AppLevel = "A1" | "A2" | "B1";

export interface ParticipationSettings {
  minAttendancePercent: number;
  minAppPercent: Record<AppLevel, number>;
}

export interface ParticipationSettingsPatch {
  minAttendancePercent?: number;
  minAppPercent?: Partial<Record<AppLevel, number>>;
}

/** The form holds text, so a half-typed number never becomes NaN in state. */
export interface ParticipationDraft {
  attendance: string;
  A1: string;
  A2: string;
  B1: string;
}

export const APP_LEVELS: AppLevel[] = ["A1", "A2", "B1"];

export function toDraft(s: ParticipationSettings): ParticipationDraft {
  return {
    attendance: String(s.minAttendancePercent),
    A1: String(s.minAppPercent.A1),
    A2: String(s.minAppPercent.A2),
    B1: String(s.minAppPercent.B1),
  };
}

function wholePercent(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= 0 && n <= 100 ? n : null;
}

/** The first thing wrong with the draft, in Uzbek, or null. */
export function draftError(d: ParticipationDraft): string | null {
  if (wholePercent(d.attendance) === null) {
    return "Davomat chegarasi 0 dan 100 gacha butun son bo'lishi kerak";
  }
  for (const level of APP_LEVELS) {
    if (wholePercent(d[level]) === null) {
      return `${level} uchun ilova chegarasi 0 dan 100 gacha butun son bo'lishi kerak`;
    }
  }
  return null;
}

/** Only what changed, so an untouched number is never rewritten; null = nothing to save. */
export function draftPatch(
  saved: ParticipationSettings,
  d: ParticipationDraft,
): ParticipationSettingsPatch | null {
  const patch: ParticipationSettingsPatch = {};
  const attendance = wholePercent(d.attendance);
  if (attendance !== null && attendance !== saved.minAttendancePercent) {
    patch.minAttendancePercent = attendance;
  }
  const apps: Partial<Record<AppLevel, number>> = {};
  for (const level of APP_LEVELS) {
    const value = wholePercent(d[level]);
    if (value !== null && value !== saved.minAppPercent[level]) apps[level] = value;
  }
  if (Object.keys(apps).length > 0) patch.minAppPercent = apps;
  return Object.keys(patch).length > 0 ? patch : null;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `cd client && npx vitest run src/components/settings/participation-settings-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the settings page and its client**

Create `client/src/app/(dashboard)/settings/participation/page.tsx`:

```tsx
import { Suspense } from "react";
import { ParticipationSettingsClient } from "@/components/settings/participation-settings-client";

export default function ParticipationSettingsPage() {
  return (
    <Suspense>
      <ParticipationSettingsClient />
    </Suspense>
  );
}
```

Create `client/src/components/settings/participation-settings-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  APP_LEVELS,
  draftError,
  draftPatch,
  toDraft,
  type ParticipationDraft,
  type ParticipationSettings,
  type ParticipationSettingsPatch,
} from "./participation-settings-draft";
import { SettingsPageHeader } from "./settings-page-header";

const KEY = ["participation-certificates", "settings"] as const;
const TITLE = "Qatnashganlik hujjati";
const DESCRIPTION = "Hujjat berish uchun davomat va ilova chegarasi";

/** CEO-only (spec 2026-10-17): one attendance threshold, and the app threshold of A1, A2 and B1. */
export function ParticipationSettingsClient() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<ParticipationSettings>("/participation-certificates/settings").then((r) => r.data),
  });
  // A draft exists only after an edit; until then the server's values show.
  const [draft, setDraft] = useState<ParticipationDraft | null>(null);

  const save = useMutation({
    mutationFn: async (patch: ParticipationSettingsPatch) =>
      (await api.patch<ParticipationSettings>("/participation-certificates/settings", patch)).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(KEY, saved);
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["participation-certificates", "preview"] });
      toast.success("Saqlandi");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Saqlashda xatolik")),
  });

  if (isError) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
        <p className="text-sm text-muted-foreground">Sozlamalarni yuklab bo&apos;lmadi.</p>
        <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching && <Loader2 className="size-4 animate-spin" />}
          Qayta urinish
        </Button>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-56 w-full max-w-xl" />
      </div>
    );
  }

  const form = draft ?? toDraft(data);
  const error = draft ? draftError(form) : null;
  const patch = draft && !error ? draftPatch(data, form) : null;
  const set = (key: keyof ParticipationDraft, value: string) => setDraft({ ...form, [key]: value });

  return (
    <div className="max-w-xl space-y-6">
      <SettingsPageHeader title={TITLE} description={DESCRIPTION} />

      <section className="space-y-2">
        <Label htmlFor="attendance">Davomat chegarasi, %</Label>
        <Input
          id="attendance"
          inputMode="numeric"
          value={form.attendance}
          onChange={(e) => set("attendance", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Kelgan va kech kelgan darslar ulushi shundan kam bo&apos;lsa, hujjat berilmaydi. Sababli kelmagan
          va bekor bo&apos;lgan darslar hisobga kirmaydi.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Ilova chegarasi, %</h3>
        <p className="text-xs text-muted-foreground">
          O&apos;quvchi darajaning hujjat berilgan kunda ochiq darslaridan shuncha foizini tugatgan bo&apos;lishi
          kerak. Kontenti yo&apos;q darajalarda (A2, B1 hozircha) bu shart qo&apos;llanmaydi.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {APP_LEVELS.map((level) => (
            <div key={level} className="space-y-1">
              <Label htmlFor={`app-${level}`}>{level}</Label>
              <Input
                id={`app-${level}`}
                inputMode="numeric"
                value={form[level]}
                onChange={(e) => set(level, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      <Button disabled={!patch || save.isPending} onClick={() => patch && save.mutate(patch)}>
        {save.isPending && <Loader2 className="size-4 animate-spin" />}
        Saqlash
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Menu, breadcrumb and the menu test**

In `client/src/lib/settings-nav.ts` add the icon to the lucide import list (`FileCheck2`) and, in the same section as «KPI sozlamalari» (the `ceoOnly` items), right after that entry:

```ts
      {
        // Every route is `@CeoOnly()` (spec 2026-10-17): identity, not a capability.
        title: "Qatnashganlik hujjati",
        url: "/settings/participation",
        icon: FileCheck2,
        description: "Teilnahmebestätigung berish chegaralari",
        ceoOnly: true,
      },
```

In `client/src/lib/breadcrumb-routes.ts` after the `kpi: "KPI sozlamalari",` line add:

```ts
  // /settings/participation — «Qatnashganlik hujjati», CEO only.
  participation: "Qatnashganlik hujjati",
```

In `client/src/lib/settings-nav.test.ts`, before `describe("settingsNavSections", …)`, add:

```ts
describe("«Qatnashganlik hujjati» — CEO only (spec 2026-10-17)", () => {
  const PATH = "/settings/participation";
  it("only the CEO sees and opens it", () => {
    const ceo = getVisibleSettingsSections(canForRoles([CEO]), true).flatMap((s) => s.items);
    expect(ceo.map((item) => item.url)).toContain(PATH);
    expect(canOpenSettingsPath(PATH, canForRoles([BRANCH_DIRECTOR]), false)).toBe(false);
    expect(canOpenSettingsPath(PATH, canForRoles([CEO]), true)).toBe(true);
  });
});
```

Run: `cd client && npx vitest run src/lib/settings-nav.test.ts src/lib/breadcrumb`
Expected: PASS. If another test lists every settings URL for a role, add the new URL to that list: the friction is deliberate.

- [ ] **Step 7: The public QR page**

Create `client/src/app/t/layout.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hujjatni tekshirish",
  description: "DaF Sprachzentrum qatnashganlik hujjatini tekshirish",
  robots: { index: false, follow: false },
};

/** Public verification route — no app shell, no sidebar, no auth. The QR on the paper lands here. */
export default function CertificateVerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

Create `client/src/app/t/[id]/not-found.tsx`:

```tsx
import { XCircle } from "lucide-react";

export default function CertificateNotFound() {
  return (
    <div className="rounded-lg border bg-background p-6 text-center shadow-sm">
      <XCircle className="mx-auto mb-3 size-8 text-red-600" />
      <p className="font-semibold">Hujjat topilmadi</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Havola noto&apos;g&apos;ri yoki hujjat bizning tizimda berilmagan.
      </p>
    </div>
  );
}
```

Create `client/src/app/t/[id]/page.tsx`:

```tsx
import { CheckCircle2, XCircle } from "lucide-react";
import { notFound } from "next/navigation";

interface VerifyDto {
  valid: boolean;
  revoked: boolean;
  number: string;
  studentName: string;
  level: string;
  from: string;
  to: string;
  issuedAt: string;
  companyName: string;
}

async function fetchVerification(id: string): Promise<VerifyDto | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  try {
    const res = await fetch(`${apiUrl}/participation-certificates/${encodeURIComponent(id)}/verify`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as VerifyDto;
  } catch {
    return null;
  }
}

function dmy(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export default async function CertificateVerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await fetchVerification(id);
  if (!data) notFound();

  return (
    <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
      <div
        className={`px-6 py-5 ${
          data.valid ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"
        }`}
      >
        <div className="flex items-center gap-3">
          {data.valid ? (
            <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="size-7 text-red-600 dark:text-red-400" />
          )}
          <div>
            <div className="text-base font-semibold">
              {data.valid ? "Bu hujjat haqiqiy" : "Bu hujjat bekor qilingan"}
            </div>
            <div className="text-xs text-muted-foreground">Teilnahmebestätigung № {data.number}</div>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-6 text-sm">
        <Row label="Markaz" value={data.companyName} />
        <Row label="O'quvchi" value={data.studentName} bold />
        <Row label="Daraja" value={data.level} />
        <Row label="Davr" value={`${dmy(data.from)} – ${dmy(data.to)}`} />
        <Row label="Berilgan sana" value={dmy(data.issuedAt)} />
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-right tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 8: Let the public page through the middleware**

In `client/src/middleware.ts`, directly after the block

```ts
  if (pathname.startsWith("/r/")) {
    return NextResponse.next();
  }
```

add:

```ts

  // Teilnahmebestätigung verification pages (the QR on the paper) stay public
  // on every host, like the receipt pages above.
  if (pathname.startsWith("/t/")) {
    return NextResponse.next();
  }
```

- [ ] **Step 9: Typecheck, lint, tests, build, commit**

Run: `cd client && npx tsc --noEmit -p . && npx vitest run && npx eslint src && npm run build`
Expected: all PASS; `eslint` prints 0 errors; the build lists `/t/[id]` and `/settings/participation`. Never run prettier on `client/`.

```bash
git add client
git commit -m "feat(participation): CEO settings page and public QR verification page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ADR, user guide and final verification

**Files:**
- Create: `docs/adr/00NN-teilnahmebestatigung-qatnashganlik-hujjati.md` (`NN` = the next free number in `docs/adr/README.md` after `git fetch`/merge of `main`; at planning time 0097)
- Modify: `docs/adr/README.md` (index row)
- Create: `client/src/qollanma/kontent/oquvchilar/qatnashganlik-hujjati.mdx`
- Modify: `client/src/qollanma/sahifalar/oquvchilar.ts`
- Modify: `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: Check the ADR number**

Run: `git fetch origin main && git log --oneline origin/main -3 && ls docs/adr | tail -3 && tail -3 docs/adr/README.md`
Expected: the highest ADR number. Use the next one (merge `origin/main` into the branch first if ADRs landed meanwhile; renumber with `git mv` rather than reusing a number).

- [ ] **Step 2: Write the ADR (Uzbek, like the others)**

Create the ADR file with this structure and these decisions (keep each section short, in the style of `docs/adr/0096-kpi-natijasi.md`):

```markdown
# ADR-00NN — Teilnahmebestätigung: qatnashganlik hujjati davomat va ilova bo'yicha, natija muhrlanadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0044 (darajani tugatgan o'quvchi), ADR-0054 (davomat), ADR-0028 (huquq bazadan o'qiladi), ADR-0096 (muhrlangan natija), `docs/superpowers/specs/2026-10-17-teilnahmebestaetigung-design.md`

## Kontekst

O'quvchi darajani (A1, A2, B1…) tugatgach markaz unga qatnashganlik hujjati — Teilnahmebestätigung — beradi. Tizimda na hujjat, na uni berish qoidasi bor edi; ADR-0044 faqat «Darajani tugatdi» deb pul qoidasini aytadi. Hujjat «qatnashdi» deydi, «o'tdi» demaydi: imtihon yoki mock natijasi uni shartlamaydi, aks holda u sertifikatga aylanib ketadi. Daraja tugaganini tizim o'zi bilmaydi (ADR-0044), shuning uchun uni administrator tasdiqlaydi.

## Qaror
1. Shart: davomat ≥ 80% (sababli kelmagan va bekor bo'lgan darslar maxrajdan chiqariladi; oldindan aytilgan «sababsiz» kelmagan) VA ilova sharti (hujjat kunida ochiq darslarning belgilangan foizi; kontenti yo'q darajada shart o'chiq). Chegaralar `Setting` jadvalida, faqat CEO yozadi.
2. Hisob bitta sof funksiyada (`participation-rules.ts`); foiz butun sonlar bilan solishtiriladi, 79,9 80 ga yetmaydi.
3. Hujjat berilganda hisob `ParticipationCertificate.snapshot` ga MUHRLANADI; PDF faqat shundan chiziladi. Keyingi davomat tuzatishi berilgan hujjatni o'zgartirmaydi.
4. Imtihon, mock, kech qolish va ilova faol vaqti SHART EMAS: hujjatda ma'lumot sifatida chiqadi (faol vaqt daraja bo'yicha ajratib bo'lmagani uchun chiqmaydi).
5. Administrator tugma bilan beradi; shart bajarilmasa faqat CEO sabab yozib istisno beradi (rol bazadan o'qiladi).
6. Hujjat DaF Sprachzentrum nomidan; filial, rahbar imzosi va muhr yozilmaydi. QR ochiq `/t/<uuid>` sahifaga olib boradi (ketma-ket raqam emas, taxmin qilib bo'lmaydigan UUID); sahifa filial, tug'ilgan sana va foizlarni ko'rsatmaydi.
7. Yangi imkoniyat kaliti yo'q: `students.details` (o'qish), `students.manage` (berish), sozlamalar `@CeoOnly()`.
8. Shrift: IBM Plex Serif + IBM Plex Sans (OFL), 4 fayl `server/assets/fonts/`.

## Ko'rib chiqilgan muqobillar
- Imtihon va mockni shart qilish: hujjat «o'tdi» ma'nosiga o'tib ketadi, daraja imtihoni balli saqlanmaydi.
- Chegara jadvali: `Setting` tizimi bor, yangi jadval keraksiz.
- Hujjatni har safar jonli ma'lumotdan chizish: keyin tuzatilgan davomat berilgan hujjatni o'zgartirardi.

## Oqibatlari
Yutuq: bir qoida, tekshiriladigan hujjat, o'zgarmas raqamlar. Narx: ilova sharti hozir faqat A1 ning ochiq darslarida ma'noli; ilovadan foydalanuvchi kam bo'lgani uchun CEO chegarani tushirishi yoki istisno berishi mumkin. Bekor qilish yo'li (`revokedAt` ustuni bor) hali yo'q.
```

Add the index row to `docs/adr/README.md` in the table's format (`| [00NN](00NN-….md) | title | Qabul qilindi | 2026-10-17 |`).

- [ ] **Step 3: The user guide page**

Create `client/src/qollanma/kontent/oquvchilar/qatnashganlik-hujjati.mdx` (no `# h1`, the title comes from the registry; no `{`, `}` or `<` in prose, MDX reads them as JSX). Use exactly this text:

```mdx
## Kim nima qiladi

- **Administrator, filial direktori va CEO** o'quvchi kartasidagi «Hujjatlar» yorlig'ini ochadi. Yorliq o'quvchi davomatga yozilgan har daraja uchun alohida blok ko'rsatadi.
- Shart bajarilgan bo'lsa «Hujjat berish» tugmasi ochiq. Bosilgach hujjat yaratiladi va PDF o'zi yuklanadi.
- Daraja tugaganini tizim o'zi bilmaydi: hujjatni administrator o'quvchi darajani tugatganini ko'rib beradi.

## Hujjat qachon beriladi

Ikkala shart bajarilishi kerak:

- **Davomat** — kelgan va kech kelgan darslar ulushi kamida **80%**. Sababli kelmagan va bekor bo'lgan darslar hisobga kirmaydi. Oldindan «sababsiz» deb aytilgan kelmaslik kelmagan hisoblanadi. Daraja bir necha guruhda o'tilgan bo'lsa, hamma guruhlar birga sanaladi.
- **Ilova** — o'quvchi shu darajaning hujjat berilgan kunda ochiq darslarining belgilangan foizini tugatgan bo'lishi kerak (boshida 100%). Darajada hali ochiq dars bo'lmasa (A2, B1 hozircha), bu shart qo'llanmaydi, faqat davomat hal qiladi.

Foizlar butun sonlar bilan solishtiriladi: 79,6% hech qachon 80% bo'lib o'tmaydi. Chegaralarni CEO Sozlamalar → «Qatnashganlik hujjati» sahifasida o'zgartiradi.

## Hujjatda nima chiqadi

Bitta A4 sahifa, nemischa. Tepada logotip, hujjat raqami (`TB-2026-0001`) va QR. Ostida o'quvchi ismi, tug'ilgan sana, kurs, davr va darslar soni, so'ng «Teilnahme im Überblick» jadvali: davomat, kech qolishlar, ilova, yakuniy sinovlar va mock imtihon. Ma'lumoti bo'lmagan qator chiqmaydi. Hujjatda filial, imzo va muhr yo'q: u DaF Sprachzentrum nomidan beriladi.

Imtihon, mock va kech qolish shart emas, ular faqat ma'lumot sifatida chiqadi.

## Shart bajarilmasa

Tugma yopiq turadi, sababi yoziladi: masalan, «Davomat 74%, kerak 80%». Faqat **CEO** «Istisno bilan berish» tugmasi orqali, sababini yozib hujjat bera oladi. Sabab hujjat tarixiga va o'quvchi tarixiga tushadi.

<Eslatma tur="diqqat">
Berilgan hujjat raqamlari muhrlanadi: keyin davomat tuzatilsa ham, berilgan hujjat o'zgarmaydi. Tuzatilgandan keyin yangi hujjat berish mumkin, eskisi ro'yxatda qoladi.
</Eslatma>

## QR bilan tekshirish

Hujjatdagi QR ochiq sahifaga olib boradi. Sahifa hujjat haqiqiyligini, raqamini, o'quvchi ismini, darajani, davrni va berilgan sanani ko'rsatadi. Filial, tug'ilgan sana va foizlar u yerda ko'rinmaydi.
```

In `client/src/qollanma/sahifalar/oquvchilar.ts` add (before the closing `];`):

```ts
  {
    bolim: "oquvchilar",
    sahifa: "qatnashganlik-hujjati",
    sarlavha: "Qatnashganlik hujjati",
    qisqacha:
      "O'quvchi darajani tugatgach, «Hujjatlar» tabidan Teilnahmebestätigung beriladi: davomat kamida 80% va ilovadagi ochiq darslar tugatilgan bo'lishi kerak. Hujjatda QR bor, u hujjat haqiqiyligini ko'rsatadi.",
    rollar: [1, 2, 3],
    adr: ["00NN"],
    yollar: ["/settings/participation"],
    kalitSozlar: ["hujjat", "Teilnahmebestätigung", "qatnashganlik", "daraja", "davomat", "QR", "PDF", "istisno"],
    yangilangan: "2026-10-17",
  },
```

(use the real ADR number for `"00NN"`; do not add `/students/profile/*` to `yollar` unless `reyestr.test.ts` accepts it next to the existing student-card page.)

In `client/src/qollanma/yangiliklar.ts` add as the FIRST entry of the array:

```ts
  {
    sana: "2026-10-17",
    sarlavha: "Qatnashganlik hujjati",
    matn: "O'quvchi kartasida «Hujjatlar» yorlig'i paydo bo'ldi. Daraja tugagach shu yerdan Teilnahmebestätigung (nemischa, QR bilan PDF) beriladi. Hujjat uchun davomat kamida 80% bo'lishi va ilovadagi ochiq darslar tugatilgan bo'lishi kerak; sababli kelmagan va bekor bo'lgan darslar hisobga kirmaydi. Shart bajarilmasa faqat CEO sabab yozib berishi mumkin. Chegaralar — Sozlamalar → «Qatnashganlik hujjati» (faqat CEO).",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "qatnashganlik-hujjati" },
  },
```

Run: `cd client && npx vitest run src/qollanma`
Expected: PASS. If `reyestr.test.ts` or the ADR coverage check complains, fix the registry entry (route patterns, ADR number), not the test.

- [ ] **Step 4: Full verification (nothing is «done» before this passes)**

Run each and read the real output:

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/feat-teilnahmebestaetigung/server && npm run typecheck && npm run build && npm test
cd ../client && npx tsc --noEmit -p . && npx vitest run && npx eslint src && npm run build
```
Expected: server typecheck and build clean, `npm test` all green; client tsc clean, vitest green, eslint `0 errors`, build succeeds.

Then the manual check of the real page (the memory rule: look at the result, do not only trust tests). Start the server and client against a local database seeded with at least one student having attendance in a group whose `level` is `A1`, open `/students/profile/<id>?tab=hujjatlar`, give the document, open the PDF, scan or open the QR link `/t/<uuid>` on the same host, and confirm: one page, the numbers match the tab, the QR page shows «Bu hujjat haqiqiy» and no branch or birth date. If no local database is available, say so explicitly in the report instead of claiming this step done.

- [ ] **Step 5: Commit, then hand off**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/feat-teilnahmebestaetigung
git add docs client/src/qollanma
git commit -m "docs(participation): ADR and user guide for the Teilnahmebestätigung

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Do not push or open a PR without the user's explicit instruction. Deploy is manual and separate (the migration `20261017120000_participation_certificate` must be applied by the deploy; the four font files ship with the server).
