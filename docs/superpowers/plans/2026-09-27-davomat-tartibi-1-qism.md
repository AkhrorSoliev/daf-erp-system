# Davomat va to'lov tartibi — 1-qism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close attendance at the end of every lesson for every role, keep an unpaid student off the roster from the month's 2nd lesson (contract 3.2), and let a part payment carry a promise for the rest.

**Architecture:** Two pure rules — `lessonWindowState` (attendance) and `lessonAdmission` / `paymentReach` (billing) — each wrapped by a thin service and called from the existing write paths (manual save, QR start/scan, pre-marks, payment preview, payment create). The roster endpoint returns the window and each student's admission so the client renders the same rule it is held to.

**Tech Stack:** NestJS 11 + Prisma 7 + Jest (server), Next.js 16 + React Query + Vitest node env (client).

**Spec:** `docs/superpowers/specs/2026-09-27-davomat-va-tolov-tartibi-design.md` (Part 1).

## Global Constraints

- UI text: Latin Uzbek only, no English words, no Cyrillic. Repo text (code, comments, commits, PR): English. ADR: Uzbek.
- Do NOT run prettier on `client/` (no config there; it rewrites untouched lines). Server files follow the server's prettier.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Server tests: `npx jest <path> --runInBand` from `server/`; full suite `npx jest --runInBand`.
- Client tests: `npx vitest run <path>` from `client/`.
- The admission rule applies to lessons on/after `2026-10-01` (`ADMISSION_START_DAY`).
- The attendance window is `[start − 10 min, end]` Tashkent time, effective times (a reschedule override wins); no role bypasses it.
- Never touch the production database. The local `server/.env` is the dev database.

---

### Task 0: Worktree setup

- [ ] **Step 1: Install dependencies (no symlinks)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/davomat-tartibi/server && npm ci && npx prisma generate
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/davomat-tartibi/client && npm ci
```

- [ ] **Step 2: Baseline**

Run: `cd server && npx jest src/attendance src/planned-absences src/payments src/billing --runInBand 2>&1 | tail -5`
Expected: all suites pass (this is the baseline to compare against).

---

### Task 1: The lesson window rule and the validation service API

**Files:**
- Create: `server/src/attendance/shared/lesson-window.ts`
- Create: `server/src/attendance/shared/lesson-window.spec.ts`
- Modify: `server/src/attendance/attendance-validation.service.ts` (whole file)
- Modify: `server/src/attendance/attendance.service.ts` (`validateLessonDate`, new `assertWindowOpen`)
- Modify: `server/src/attendance/attendance.service.spec.ts` (`describe('lesson time check')` block)

**Interfaces:**
- Produces:
  - `WINDOW_OPENS_MINUTES_BEFORE = 10`
  - `type LessonWindowState = 'before' | 'open' | 'closed'`
  - `interface LessonTimes { lessonDay: string; startTime: string | null; endTime: string | null }`
  - `interface LessonWindow { state: LessonWindowState; startTime: string | null; endTime: string | null }`
  - `lessonWindowState(input: LessonTimes & { now: Date }): LessonWindowState`
  - `windowRefusal(state: 'before' | 'closed', lesson: LessonTimes, now: Date): string`
  - `AttendanceValidationService.validateLessonDate(groupId: string, date: string, companyId?: number): Promise<{ group; parsedDate: Date; startTime: string | null; endTime: string | null }>` — the `roles` parameter is gone and it no longer checks the clock.
  - `AttendanceValidationService.assertWindowOpen(lesson: LessonTimes, now?: Date): void`
  - `AttendanceValidationService.assertLessonNotEnded(lesson: LessonTimes, now?: Date): void`
  - `AttendanceValidationService.windowFor(groupId: string, date: string, companyId?: number, now?: Date): Promise<LessonWindow>`
  - `AttendanceService.validateLessonDate(groupId, date, companyId?)`, `AttendanceService.assertWindowOpen(lesson: LessonTimes)`

- [ ] **Step 1: Write the failing test for the pure rule**

Create `server/src/attendance/shared/lesson-window.spec.ts`:

```ts
import { lessonWindowState, windowRefusal } from './lesson-window';

// Tashkent is UTC+5: 15:00 Tashkent = 10:00Z.
const lesson = { lessonDay: '2026-10-05', startTime: '15:00', endTime: '16:30' };
const at = (iso: string) => new Date(iso);

describe('lessonWindowState', () => {
  it('is before until 10 minutes ahead of the start', () => {
    expect(lessonWindowState({ ...lesson, now: at('2026-10-05T09:49:00Z') })).toBe('before');
  });
  it('opens 10 minutes before the start', () => {
    expect(lessonWindowState({ ...lesson, now: at('2026-10-05T09:50:00Z') })).toBe('open');
  });
  it('is still open during the last minute of the lesson', () => {
    expect(lessonWindowState({ ...lesson, now: at('2026-10-05T11:30:59Z') })).toBe('open');
  });
  it('closes after the end minute', () => {
    expect(lessonWindowState({ ...lesson, now: at('2026-10-05T11:31:00Z') })).toBe('closed');
  });
  it('is closed on any later day', () => {
    expect(lessonWindowState({ ...lesson, now: at('2026-10-06T04:00:00Z') })).toBe('closed');
  });
  it('is before on any earlier day', () => {
    expect(lessonWindowState({ ...lesson, now: at('2026-10-04T12:00:00Z') })).toBe('before');
  });
  it('uses the Tashkent day, not the UTC day', () => {
    // 2026-10-05T19:30Z is 06.10 00:30 in Tashkent: the 05.10 lesson is over.
    expect(lessonWindowState({ ...lesson, now: at('2026-10-05T19:30:00Z') })).toBe('closed');
  });
  it('is open all lesson day for a group without times', () => {
    const noTimes = { lessonDay: '2026-10-05', startTime: null, endTime: null };
    expect(lessonWindowState({ ...noTimes, now: at('2026-10-05T01:00:00Z') })).toBe('open');
  });
});

describe('windowRefusal', () => {
  it('names the date and the end time of a closed lesson', () => {
    expect(windowRefusal('closed', lesson, at('2026-10-06T04:00:00Z'))).toBe(
      "Dars tugagan (05.10.2026, 16:30). Davomat yopilgan — endi uni saytda kiritib bo'lmaydi",
    );
  });
  it('names the start on the lesson day', () => {
    expect(windowRefusal('before', lesson, at('2026-10-05T08:00:00Z'))).toBe(
      'Davomat dars boshlanishidan 10 daqiqa oldin ochiladi (15:00)',
    );
  });
  it('says a future lesson has not started', () => {
    expect(windowRefusal('before', lesson, at('2026-10-03T08:00:00Z'))).toBe(
      'Bu dars hali boshlanmagan (05.10.2026). Davomat dars kuni ochiladi',
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npx jest src/attendance/shared/lesson-window.spec.ts --runInBand`
Expected: FAIL — `Cannot find module './lesson-window'`.

- [ ] **Step 3: Implement the rule**

Create `server/src/attendance/shared/lesson-window.ts`:

```ts
import {
  TASHKENT_OFFSET_MS,
  tashkentDateStr,
} from '../../common/date/tashkent';

/**
 * The attendance window of one lesson (ADR-0045). It opens 10 minutes before
 * the lesson starts and closes when the lesson ends, Tashkent time. Every
 * role is bound by it — teacher, administrator, branch director and CEO
 * alike; after the end nobody on the site may enter or change attendance.
 */
export const WINDOW_OPENS_MINUTES_BEFORE = 10;

export type LessonWindowState = 'before' | 'open' | 'closed';

export interface LessonTimes {
  /** Tashkent 'YYYY-MM-DD'. */
  lessonDay: string;
  /** 'HH:MM', the effective start: a reschedule's override wins. */
  startTime: string | null;
  endTime: string | null;
}

export interface LessonWindow {
  state: LessonWindowState;
  startTime: string | null;
  endTime: string | null;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const ddmmyyyy = (day: string): string =>
  `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;

export function lessonWindowState(
  input: LessonTimes & { now: Date },
): LessonWindowState {
  const today = tashkentDateStr(input.now);
  if (input.lessonDay < today) return 'closed';
  if (input.lessonDay > today) return 'before';
  // A group without lesson times has no window inside its day to enforce.
  if (!input.startTime || !input.endTime) return 'open';
  const shifted = new Date(input.now.getTime() + TASHKENT_OFFSET_MS);
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  if (minutes < toMinutes(input.startTime) - WINDOW_OPENS_MINUTES_BEFORE) {
    return 'before';
  }
  if (minutes > toMinutes(input.endTime)) return 'closed';
  return 'open';
}

/** The message a refused write carries. */
export function windowRefusal(
  state: 'before' | 'closed',
  lesson: LessonTimes,
  now: Date,
): string {
  if (state === 'closed') {
    const at = lesson.endTime
      ? `${ddmmyyyy(lesson.lessonDay)}, ${lesson.endTime}`
      : ddmmyyyy(lesson.lessonDay);
    return `Dars tugagan (${at}). Davomat yopilgan — endi uni saytda kiritib bo'lmaydi`;
  }
  if (lesson.lessonDay === tashkentDateStr(now) && lesson.startTime) {
    return `Davomat dars boshlanishidan ${WINDOW_OPENS_MINUTES_BEFORE} daqiqa oldin ochiladi (${lesson.startTime})`;
  }
  return `Bu dars hali boshlanmagan (${ddmmyyyy(lesson.lessonDay)}). Davomat dars kuni ochiladi`;
}
```

- [ ] **Step 4: Run the pure test**

Run: `cd server && npx jest src/attendance/shared/lesson-window.spec.ts --runInBand`
Expected: PASS (11 tests).

- [ ] **Step 5: Rewrite the validation service**

Replace the whole of `server/src/attendance/attendance-validation.service.ts` with:

```ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GroupStatus } from '@prisma/client';
import { DAY_NAME_TO_JS, tashkentDateStr } from './shared/date-utils';
import { HolidaysService } from '../holidays/holidays.service';
import {
  lessonWindowState,
  windowRefusal,
  type LessonTimes,
  type LessonWindow,
} from './shared/lesson-window';

@Injectable()
export class AttendanceValidationService {
  constructor(
    private prisma: PrismaService,
    private holidaysService: HolidaysService,
  ) {}

  /**
   * Validate that a date is a lesson of the group: date format, group
   * existence + company, ACTIVE status, date range, schedule or a moved
   * lesson, holiday. It says nothing about the clock — `assertWindowOpen`
   * does (ADR-0045). Returns the lesson's effective times: a reschedule's
   * override wins over the group's.
   */
  async validateLessonDate(groupId: string, date: string, companyId?: number) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(
        "Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting",
      );
    }
    const parsedDate = new Date(date + 'T00:00:00.000Z');
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException(
        "Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting",
      );
    }

    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      select: {
        id: true,
        companyId: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        statusEnum: true,
        lessonStartTime: true,
        lessonEndTime: true,
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    if (group.statusEnum !== GroupStatus.ACTIVE) {
      throw new BadRequestException(
        `Guruh faol emas. Joriy holat: ${group.statusEnum}`,
      );
    }

    // Compare as Tashkent calendar date strings: group.startDate/endDate are
    // stored as Tashkent midnight in UTC (toISOString() of a Tashkent-browser
    // Date). On a UTC server, naive Date comparison cuts off the last day
    // because parsedDate (UTC midnight) > group.endDate (prior 19:00 UTC).
    if (group.startDate && date < tashkentDateStr(group.startDate)) {
      throw new BadRequestException(
        'Bu sana guruh faoliyat muddatiga kirmaydi',
      );
    }
    if (group.endDate && date > tashkentDateStr(group.endDate)) {
      throw new BadRequestException(
        'Bu sana guruh faoliyat muddatiga kirmaydi',
      );
    }

    // LessonReschedule: a moved lesson lands on `newDate` even if that day
    // isn't normally scheduled, and the original day is forbidden once moved.
    const reschedule = await this.prisma.lessonReschedule.findFirst({
      where: {
        groupId: group.id,
        deletedAt: null,
        OR: [{ originalDate: parsedDate }, { newDate: parsedDate }],
      },
      select: {
        originalDate: true,
        newDate: true,
        newLessonStartTime: true,
        newLessonEndTime: true,
      },
    });
    if (
      reschedule &&
      reschedule.originalDate.getTime() === parsedDate.getTime()
    ) {
      throw new BadRequestException(
        "Bu sana boshqa kunga ko'chirilgan — davomatni yangi sanada oling",
      );
    }
    const isMovedLessonDay =
      reschedule != null &&
      reschedule.newDate.getTime() === parsedDate.getTime();

    if (!isMovedLessonDay) {
      const scheduleDays = group.exactDays
        .map((d) => DAY_NAME_TO_JS[d])
        .filter((d) => d !== undefined);
      if (!scheduleDays.includes(parsedDate.getUTCDay())) {
        throw new BadRequestException('Bu kunda dars rejalashtirilmagan');
      }
    }

    const holiday =
      await this.holidaysService.findActiveHolidayCovering(parsedDate);
    if (holiday) {
      throw new BadRequestException(`Bu sana bayram kuni: ${holiday.name}`);
    }

    const startTime =
      isMovedLessonDay && reschedule?.newLessonStartTime
        ? reschedule.newLessonStartTime
        : group.lessonStartTime;
    const endTime =
      isMovedLessonDay && reschedule?.newLessonEndTime
        ? reschedule.newLessonEndTime
        : group.lessonEndTime;

    return { group, parsedDate, startTime, endTime };
  }

  /**
   * ADR-0045: attendance is written only inside the lesson window, by every
   * role. Throws the Uzbek reason otherwise.
   */
  assertWindowOpen(lesson: LessonTimes, now: Date = new Date()): void {
    const state = lessonWindowState({ ...lesson, now });
    if (state !== 'open') {
      throw new BadRequestException(windowRefusal(state, lesson, now));
    }
  }

  /** A pre-marked absence makes sense only until the lesson ends. */
  assertLessonNotEnded(lesson: LessonTimes, now: Date = new Date()): void {
    if (lessonWindowState({ ...lesson, now }) === 'closed') {
      throw new BadRequestException(
        "Dars tugagan — kelmaslikni oldindan belgilab bo'lmaydi",
      );
    }
  }

  /**
   * The window the attendance screen shows. Times include a move's override,
   * so a moved lesson opens and closes at its own hours.
   */
  async windowFor(
    groupId: string,
    date: string,
    companyId?: number,
    now: Date = new Date(),
  ): Promise<LessonWindow> {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      select: { lessonStartTime: true, lessonEndTime: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    const moved = await this.prisma.lessonReschedule.findFirst({
      where: {
        groupId,
        deletedAt: null,
        newDate: new Date(date + 'T00:00:00.000Z'),
      },
      select: { newLessonStartTime: true, newLessonEndTime: true },
    });
    const startTime = moved?.newLessonStartTime ?? group.lessonStartTime;
    const endTime = moved?.newLessonEndTime ?? group.lessonEndTime;
    return {
      state: lessonWindowState({ lessonDay: date, startTime, endTime, now }),
      startTime,
      endTime,
    };
  }
}
```

- [ ] **Step 6: Update the facade**

In `server/src/attendance/attendance.service.ts` add the import and replace `validateLessonDate`:

```ts
import type { LessonTimes } from './shared/lesson-window';
```

```ts
  validateLessonDate(groupId: string, date: string, companyId?: number) {
    return this.validation.validateLessonDate(groupId, date, companyId);
  }

  assertWindowOpen(lesson: LessonTimes) {
    this.validation.assertWindowOpen(lesson);
  }
```

- [ ] **Step 7: Replace the old time tests**

In `server/src/attendance/attendance.service.spec.ts`, replace the whole `describe('lesson time check', () => { ... });` block (it starts after `it('should pass validation for a valid lesson date'` and ends before the closing `});` of `describe('validateLessonDate')`) with:

```ts
    describe('lesson window (ADR-0045)', () => {
      const validation = () =>
        (service as unknown as { validation: AttendanceValidationService })
          .validation;
      // mockGroup: Wednesday 2026-04-01, 09:00–11:00 Tashkent (04:00–06:00Z).
      const lesson = {
        lessonDay: '2026-04-01',
        startTime: '09:00',
        endTime: '11:00',
      };

      it('validateLessonDate no longer looks at the clock and returns the times', async () => {
        const result = await service.validateLessonDate(
          'group-uuid-1',
          '2026-04-01',
        );
        expect(result.startTime).toBe('09:00');
        expect(result.endTime).toBe('11:00');
      });

      it('a moved lesson carries its own times', async () => {
        prisma.lessonReschedule.findFirst.mockResolvedValue({
          originalDate: new Date('2026-03-30T00:00:00.000Z'),
          newDate: new Date('2026-04-02T00:00:00.000Z'),
          newLessonStartTime: '14:00',
          newLessonEndTime: '15:30',
        });
        const result = await service.validateLessonDate(
          'group-uuid-1',
          '2026-04-02',
        );
        expect(result.startTime).toBe('14:00');
        expect(result.endTime).toBe('15:30');
      });

      it('assertWindowOpen passes inside the window', () => {
        expect(() =>
          validation().assertWindowOpen(lesson, new Date('2026-04-01T04:30:00Z')),
        ).not.toThrow();
      });

      it('assertWindowOpen refuses before the window with the start time', () => {
        expect(() =>
          validation().assertWindowOpen(lesson, new Date('2026-04-01T03:49:00Z')),
        ).toThrow('Davomat dars boshlanishidan 10 daqiqa oldin ochiladi (09:00)');
      });

      it('assertWindowOpen refuses after the end, whatever the role', () => {
        expect(() =>
          validation().assertWindowOpen(lesson, new Date('2026-04-01T06:01:00Z')),
        ).toThrow("Dars tugagan (01.04.2026, 11:00). Davomat yopilgan — endi uni saytda kiritib bo'lmaydi");
      });

      it('assertLessonNotEnded allows a future lesson and refuses an ended one', () => {
        expect(() =>
          validation().assertLessonNotEnded(lesson, new Date('2026-03-31T10:00:00Z')),
        ).not.toThrow();
        expect(() =>
          validation().assertLessonNotEnded(lesson, new Date('2026-04-01T07:00:00Z')),
        ).toThrow("Dars tugagan — kelmaslikni oldindan belgilab bo'lmaydi");
      });

      it('windowFor reports the state and the effective times', async () => {
        const window = await validation().windowFor(
          'group-uuid-1',
          '2026-04-01',
          undefined,
          new Date('2026-04-01T04:30:00Z'),
        );
        expect(window).toEqual({ state: 'open', startTime: '09:00', endTime: '11:00' });
      });
    });
```

Also add `AttendanceValidationService` to the spec's imports if the linter flags it as type-only (it is already imported as a value at the top of the file).

- [ ] **Step 8: Run the attendance tests**

Run: `cd server && npx jest src/attendance/attendance.service.spec.ts src/attendance/shared --runInBand 2>&1 | tail -20`
Expected: the new window tests PASS. Some `save` tests and QR/pre-mark suites may now fail to compile because callers still pass `roles` to `validateLessonDate` — Task 2 fixes the callers; run `npx tsc --noEmit -p tsconfig.json 2>&1 | head` to see them listed.

- [ ] **Step 9: Commit**

```bash
git add server/src/attendance/shared/lesson-window.ts server/src/attendance/shared/lesson-window.spec.ts server/src/attendance/attendance-validation.service.ts server/src/attendance/attendance.service.ts server/src/attendance/attendance.service.spec.ts
git commit -m "feat(attendance): one lesson window for every role

validateLessonDate checks only that the date is a lesson and returns its
effective times; assertWindowOpen, assertLessonNotEnded and windowFor carry
the clock (ADR-0045). No role bypasses the window any more.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Enforce the window on every write path

**Files:**
- Modify: `server/src/attendance/attendance-save.service.ts` (signature, first lines of `save`)
- Modify: `server/src/attendance/attendance.service.ts` (`save` passes options)
- Modify: `server/src/attendance/qr-attendance-session.service.ts` (`startSession`)
- Modify: `server/src/attendance/qr-attendance-scan.service.ts` (constructor, `scanQr`)
- Modify: `server/src/planned-absences/planned-absences.service.ts` (`upsert`)
- Test: `server/src/attendance/attendance.service.spec.ts`, `server/src/attendance/qr-attendance.service.spec.ts`, `server/src/planned-absences/planned-absences.service.spec.ts`

**Interfaces:**
- Consumes: Task 1's `validateLessonDate(groupId, date, companyId?)`, `assertWindowOpen(lesson: LessonTimes)`, `assertLessonNotEnded(lesson: LessonTimes)`.
- Produces: `export interface SaveAttendanceOptions { allowClosedLesson?: boolean }`; `AttendanceSaveService.save(groupId, date, dto, userId, roles, companyId, options?: SaveAttendanceOptions)`.

- [ ] **Step 1: Pin the save tests to a moment inside the lesson and add the window tests**

In `server/src/attendance/attendance.service.spec.ts`, at the top of `describe('save', () => {` insert:

```ts
    // mockGroup's lesson: Wednesday 2026-04-01, 09:00–11:00 Tashkent. Every
    // save now needs its window open (ADR-0045), so the clock sits at 09:30.
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
      jest.setSystemTime(new Date('2026-04-01T04:30:00.000Z'));
      prisma.enrollment.findMany.mockResolvedValue(
        mockEnrollments.map((e) => ({
          id: `enr-${e.studentId}`,
          studentId: e.studentId,
          student: { firstName: e.student.firstName, lastName: e.student.lastName },
        })),
      );
    });
    afterEach(() => jest.useRealTimers());

    const twoPresent: SaveAttendanceDto = {
      entries: [
        { studentId: 10001, status: 'PRESENT' },
        { studentId: 10002, status: 'PRESENT' },
      ],
    };

    it('refuses a CEO after the lesson ends', async () => {
      jest.setSystemTime(new Date('2026-04-01T06:01:00.000Z'));
      await expect(
        service.save('group-uuid-1', '2026-04-01', twoPresent, 1, ['CEO'], 1),
      ).rejects.toThrow('Davomat yopilgan');
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('refuses an administrator on a past lesson day', async () => {
      await expect(
        service.save('group-uuid-1', '2026-03-30', twoPresent, 1, ['Administrator'], 1),
      ).rejects.toThrow('Dars tugagan (30.03.2026, 11:00)');
    });

    it('refuses a teacher before the window opens', async () => {
      jest.setSystemTime(new Date('2026-04-01T03:49:00.000Z'));
      await expect(
        service.save('group-uuid-1', '2026-04-01', twoPresent, 1, ['Teacher'], 1),
      ).rejects.toThrow('10 daqiqa oldin ochiladi');
    });

    it('writes a closed lesson only with allowClosedLesson (CEO-ordered script)', async () => {
      jest.setSystemTime(new Date('2026-04-02T06:00:00.000Z'));
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert.mockResolvedValue({ id: 'att-x', studentId: 10001, status: 'PRESENT' });
      const saveService = (service as unknown as { saveService: AttendanceSaveService }).saveService;
      const result = await saveService.save(
        'group-uuid-1', '2026-04-01', twoPresent, 1, ['CEO'], 1, { allowClosedLesson: true },
      );
      expect(result.count).toBe(2);
    });
```

The existing save tests that call `prisma.enrollment.findMany.mockResolvedValue(...)` themselves keep working: they override the default above.

- [ ] **Step 2: Run to see the new tests fail**

Run: `cd server && npx jest src/attendance/attendance.service.spec.ts -t "save" --runInBand 2>&1 | tail -20`
Expected: FAIL — the CEO/administrator writes are accepted (no window yet) and `allowClosedLesson` is not a parameter.

- [ ] **Step 3: Enforce the window in the save service**

In `server/src/attendance/attendance-save.service.ts`, above `@Injectable()` add:

```ts
export interface SaveAttendanceOptions {
  /**
   * Write outside the lesson window. ADR-0045: after a lesson ends nobody on
   * the site may enter or change its attendance; a correction is made only on
   * the CEO's order, from a script. No HTTP route passes this.
   */
  allowClosedLesson?: boolean;
}
```

Replace the signature and the first statement of `save`:

```ts
  async save(
    groupId: string,
    date: string,
    dto: SaveAttendanceDto,
    userId: number,
    roles: string[],
    companyId: number,
    options: SaveAttendanceOptions = {},
  ) {
    const lesson = await this.validation.validateLessonDate(
      groupId,
      date,
      companyId,
    );
    if (!options.allowClosedLesson) {
      this.validation.assertWindowOpen({
        lessonDay: date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
      });
    }
    const { parsedDate } = lesson;
```

(the old `const { parsedDate } = await this.validation.validateLessonDate(groupId, date, companyId, roles);` goes away; `roles` is still used below for `isTeacherOnly`).

In `server/src/attendance/attendance.service.ts` replace `save`:

```ts
  save(
    groupId: string,
    date: string,
    dto: SaveAttendanceDto,
    userId: number,
    roles: string[],
    companyId: number,
    options?: SaveAttendanceOptions,
  ) {
    return this.saveService.save(groupId, date, dto, userId, roles, companyId, options);
  }
```

with `import { AttendanceSaveService, type SaveAttendanceOptions } from './attendance-save.service';`.

- [ ] **Step 4: QR session start**

In `server/src/attendance/qr-attendance-session.service.ts`, `startSession`, replace

```ts
    const { group: validatedGroup, parsedDate } =
      await this.attendanceService.validateLessonDate(
        groupId,
        date,
        companyId,
        roles,
      );
```

with

```ts
    const lesson = await this.attendanceService.validateLessonDate(
      groupId,
      date,
      companyId,
    );
    // ADR-0045: a QR session is attendance too — inside the window only.
    this.attendanceService.assertWindowOpen({
      lessonDay: date,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
    });
    const { group: validatedGroup, parsedDate } = lesson;
```

If `roles` becomes unused in `startSession`, keep the parameter (the controller passes it) and prefix nothing — ESLint's unused-args rule in this repo ignores parameters followed by used ones; if it complains, rename to `_roles`.

- [ ] **Step 5: QR scan**

In `server/src/attendance/qr-attendance-scan.service.ts` add the import and constructor parameter:

```ts
import { AttendanceValidationService } from './attendance-validation.service';
```

```ts
    private eventEmitter: EventEmitter2,
    private validation: AttendanceValidationService,
  ) {}
```

After the `if (!group) { throw ... }` block in `scanQr`, insert:

```ts
    // ADR-0045: a scan writes attendance, so the lesson window applies — a
    // token that outlives the lesson must not mark anyone.
    const lesson = await this.validation.validateLessonDate(
      groupId,
      date,
      companyId,
    );
    this.validation.assertWindowOpen({
      lessonDay: date,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
    });
```

- [ ] **Step 6: Pre-marks**

In `server/src/planned-absences/planned-absences.service.ts`, replace

```ts
    const { parsedDate } = await this.validation.validateLessonDate(
      groupId,
      date,
      companyId,
      roles,
    );
```

with

```ts
    const lesson = await this.validation.validateLessonDate(
      groupId,
      date,
      companyId,
    );
    // ADR-0045: after the lesson ends its attendance is closed, and a
    // pre-mark only ever seeds that attendance.
    this.validation.assertLessonNotEnded({
      lessonDay: date,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
    });
    const { parsedDate } = lesson;
```

and update the comment above it: the admin time-window bypass no longer exists; the lesson must not have ended.

- [ ] **Step 7: Update the QR and pre-mark specs**

In `server/src/attendance/qr-attendance.service.spec.ts`:
- the `attendanceService` mock gains `assertWindowOpen: jest.fn()` next to `validateLessonDate`, and `validateLessonDate` resolves `{ group: ..., parsedDate: ..., startTime: '09:00', endTime: '11:00' }` (keep its existing `group`/`parsedDate`);
- `expect(attendanceService.validateLessonDate).toHaveBeenCalledWith(...)` drops the roles argument;
- the providers list gains
  `{ provide: AttendanceValidationService, useValue: { validateLessonDate: jest.fn().mockResolvedValue({ startTime: '09:00', endTime: '11:00' }), assertWindowOpen: jest.fn() } }`
  with `import { AttendanceValidationService } from './attendance-validation.service';`;
- add a test:

```ts
    it('refuses a scan once the lesson window is closed', async () => {
      const validation = module.get(AttendanceValidationService) as unknown as {
        assertWindowOpen: jest.Mock;
      };
      validation.assertWindowOpen.mockImplementation(() => {
        throw new BadRequestException('Davomat yopilgan');
      });
      await expect(
        scanService.scanQr('tok', 10001, 1, 1),
      ).rejects.toThrow('Davomat yopilgan');
    });
```

Adapt `module` / `scanService` / the redis token setup to the names the spec already uses for its scan tests (copy the arrange part of the nearest existing `scanQr` test).

In `server/src/planned-absences/planned-absences.service.spec.ts`:
- `validation` becomes `{ validateLessonDate: jest.Mock; assertLessonNotEnded: jest.Mock }` and is built as

```ts
    validation = {
      validateLessonDate: jest.fn().mockResolvedValue({
        parsedDate,
        group: {},
        startTime: '09:00',
        endTime: '11:00',
      }),
      assertLessonNotEnded: jest.fn(),
    };
```

- `toHaveBeenCalledWith('g1', '2026-06-10', 1, ['Administrator'])` becomes `toHaveBeenCalledWith('g1', '2026-06-10', 1)`, and its comment says the lesson must not have ended;
- add:

```ts
    it('refuses a pre-mark once the lesson has ended', async () => {
      validation.assertLessonNotEnded.mockImplementation(() => {
        throw new BadRequestException("Dars tugagan — kelmaslikni oldindan belgilab bo'lmaydi");
      });
      await expect(
        service.upsert('g1', '2026-06-10', dto, 99, ['Administrator'], 1),
      ).rejects.toThrow('Dars tugagan');
      expect(prisma.plannedAbsence.upsert).not.toHaveBeenCalled();
    });
```

- [ ] **Step 8: Run the three suites and the typecheck**

Run: `cd server && npx jest src/attendance src/planned-absences --runInBand 2>&1 | tail -15 && npm run typecheck 2>&1 | tail -5`
Expected: all PASS, typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add server/src/attendance server/src/planned-absences
git commit -m "feat(attendance): the lesson window guards save, QR and pre-marks

Every role saves only inside the window; a QR session and each scan obey
it; a pre-mark is refused once its lesson has ended. allowClosedLesson is
the one bypass, reserved for a CEO-ordered correction script.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The admission rule (contract 3.2) and its service

**Files:**
- Create: `server/src/billing/lesson-admission.ts`
- Create: `server/src/billing/lesson-admission.spec.ts`
- Create: `server/src/billing/lesson-admission.service.ts`
- Create: `server/src/billing/lesson-admission.service.spec.ts`
- Modify: `server/src/billing/billing.module.ts` (provider + export)

**Interfaces:**
- Consumes: `departureRelease` (`billing/departure-release.ts`), `paymentDueDate` (`billing/payment-due-date.ts`).
- Produces:
  - `ADMISSION_START_DAY = '2026-10-01'`
  - `type AdmissionReason = 'NOT_APPLIED' | 'FIRST_LESSON' | 'PAID' | 'NOT_PAID'`
  - `interface LessonAdmission { admitted: boolean; reason: AdmissionReason; shortfall: number; paidThrough: string | null }`
  - `const ADMITTED_WITHOUT_RULE: LessonAdmission`
  - `interface AdmissionCharge { groupId: string; coveredDates: readonly string[]; frozenOutDates: readonly string[]; coveredLessons: number; perLessonCost: number; discountPercent: number; chargedAmount: number }`
  - `heldAfter(charges: readonly AdmissionCharge[], day: string): number`
  - `lessonAdmission(input: { lessonDay: string; groupId: string; balance: number; charges: readonly AdmissionCharge[] }): LessonAdmission`
  - `interface PaymentReach { paidThrough: string | null; next: { date: string; groupName: string; needed: number } | null; clearsDebt: boolean }`
  - `paymentReach(input: { today: string; balanceAfter: number; charges: readonly (AdmissionCharge & { groupName: string })[] }): PaymentReach | null`
  - `LessonAdmissionService.forLesson(params: { groupId: string; lessonDay: string; studentIds: number[] }, client?: Prisma.TransactionClient): Promise<Map<number, LessonAdmission>>`
  - `LessonAdmissionService.reachForPayment(params: { studentId: number; balanceAfter: number; today: string }): Promise<PaymentReach | null>`

- [ ] **Step 1: Write the failing pure tests**

Create `server/src/billing/lesson-admission.spec.ts`:

```ts
import {
  ADMITTED_WITHOUT_RULE,
  heldAfter,
  lessonAdmission,
  paymentReach,
  type AdmissionCharge,
} from './lesson-admission';

// #005 in October 2026: Mon/Wed/Fri, 13 lessons, 450 000 a month.
const OCT = [
  '2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12',
  '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23',
  '2026-10-26', '2026-10-28', '2026-10-30',
];
const g005: AdmissionCharge = {
  groupId: 'g005',
  coveredDates: OCT,
  frozenOutDates: [],
  coveredLessons: 13,
  perLessonCost: 34615, // 450 000 / 13, undiscounted
  discountPercent: 0,
  chargedAmount: 450000,
};
const admit = (balance: number, lessonDay: string, charges = [g005]) =>
  lessonAdmission({ lessonDay, groupId: 'g005', balance, charges });

describe('heldAfter', () => {
  it('holds the lessons after the day, the day itself counted as held', () => {
    expect(heldAfter([g005], '2026-10-05')).toBe(11 * 34615);
  });
  it('holds nothing after the last lesson', () => {
    expect(heldAfter([g005], '2026-10-30')).toBe(0);
  });
  it('skips lessons a freeze already released', () => {
    const frozen = { ...g005, frozenOutDates: OCT.slice(10) };
    expect(heldAfter([frozen], '2026-10-05')).toBe(8 * 34615);
  });
});

describe('lessonAdmission', () => {
  it('does not apply before 2026-10-01', () => {
    expect(admit(-450000, '2026-09-30')).toEqual(ADMITTED_WITHOUT_RULE);
  });
  it('admits the first lesson of the month unpaid', () => {
    expect(admit(-450000, '2026-10-02')).toEqual({
      admitted: true, reason: 'FIRST_LESSON', shortfall: 0, paidThrough: null,
    });
  });
  it('blocks the second lesson with nothing paid, naming the shortfall', () => {
    expect(admit(-450000, '2026-10-05')).toEqual({
      admitted: false, reason: 'NOT_PAID', shortfall: 450000 - 11 * 34615, paidThrough: null,
    });
  });
  it('admits the second lesson once lessons 1–2 are paid, and says how far', () => {
    const balance = -(11 * 34615); // paid exactly the first two lessons
    expect(admit(balance, '2026-10-05')).toEqual({
      admitted: true, reason: 'PAID', shortfall: 0, paidThrough: '2026-10-05',
    });
  });
  it('one so\'m short is still blocked', () => {
    expect(admit(-(11 * 34615) - 1, '2026-10-05').admitted).toBe(false);
  });
  it('a part payment reaches the lessons it covers (150 000 → 09.10)', () => {
    expect(admit(-300000, '2026-10-05')).toEqual({
      admitted: true, reason: 'PAID', shortfall: 0, paidThrough: '2026-10-09',
    });
  });
  it('a full payment leaves no paidThrough', () => {
    expect(admit(0, '2026-10-14').paidThrough).toBeNull();
  });
  it('older debt must be paid first', () => {
    // October paid in full, 50 000 still owed from September.
    expect(admit(-50000, '2026-10-05')).toMatchObject({ admitted: false, shortfall: 50000 });
  });
  it('a second group adds its own held lessons', () => {
    const g010: AdmissionCharge = { ...g005, groupId: 'g010', chargedAmount: 400000, perLessonCost: 30769 };
    const both = [g005, g010];
    const held = heldAfter(both, '2026-10-05');
    expect(admit(-held, '2026-10-05', both).admitted).toBe(true);
    expect(admit(-held - 1, '2026-10-05', both).admitted).toBe(false);
  });
  it('applies the discount to the held lessons', () => {
    const half = { ...g005, discountPercent: 50, chargedAmount: 225000 };
    // 11 lessons after 05.10 at 17 308 (34 615 × 50 %, rounded) are still held.
    expect(admit(-225000, '2026-10-05', [half]).shortfall).toBe(225000 - 11 * 17308);
  });
  it('has nothing to judge without a charge in this group', () => {
    expect(admit(-450000, '2026-10-05', [])).toEqual(ADMITTED_WITHOUT_RULE);
  });
  it('the first lesson after a mid-month join is free', () => {
    const joined = { ...g005, coveredDates: OCT.slice(8), coveredLessons: 5 };
    expect(admit(-173077, '2026-10-21').reason).toBe('FIRST_LESSON');
    expect(admit(-173077, '2026-10-23').admitted).toBe(false);
  });
});

describe('paymentReach', () => {
  const charges = [{ ...g005, groupName: '#005' }];
  it('is null before the rule starts', () => {
    expect(paymentReach({ today: '2026-09-28', balanceAfter: -350000, charges })).toBeNull();
  });
  it('100 000 on 05.10 reaches 05.10 and names what 07.10 still needs', () => {
    expect(paymentReach({ today: '2026-10-05', balanceAfter: -350000, charges })).toEqual({
      paidThrough: '2026-10-05',
      next: { date: '2026-10-07', groupName: '#005', needed: 350000 - 10 * 34615 },
      clearsDebt: false,
    });
  });
  it('a payment that clears the debt reaches the month\'s last lesson', () => {
    expect(paymentReach({ today: '2026-10-05', balanceAfter: 0, charges })).toEqual({
      paidThrough: '2026-10-30', next: null, clearsDebt: true,
    });
  });
  it('nothing on today\'s lesson when even today is not covered', () => {
    const reach = paymentReach({ today: '2026-10-05', balanceAfter: -450000, charges });
    expect(reach?.paidThrough).toBeNull();
    expect(reach?.next?.date).toBe('2026-10-05');
  });
  it('is null when no lesson is left this month', () => {
    expect(paymentReach({ today: '2026-10-31', balanceAfter: -1000, charges })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npx jest src/billing/lesson-admission.spec.ts --runInBand`
Expected: FAIL — `Cannot find module './lesson-admission'`.

- [ ] **Step 3: Implement the pure rule**

Create `server/src/billing/lesson-admission.ts`:

```ts
import { departureRelease } from './departure-release';
import { paymentDueDate } from './payment-due-date';

/**
 * Contract 3.2 (ADR-0045): the first lesson of a month may be attended
 * unpaid; from the 2nd a student attends only as far as their payments
 * reach, older debt included. It applies to lessons from the new contract's
 * first day.
 */
export const ADMISSION_START_DAY = '2026-10-01';

export type AdmissionReason =
  | 'NOT_APPLIED'
  | 'FIRST_LESSON'
  | 'PAID'
  | 'NOT_PAID';

export interface LessonAdmission {
  admitted: boolean;
  reason: AdmissionReason;
  /** The least payment that admits the student to this lesson; 0 when admitted. */
  shortfall: number;
  /**
   * Admitted while still owing (a part payment): the last lesson of the
   * month in this group the current balance reaches. Null otherwise.
   */
  paidThrough: string | null;
}

export const ADMITTED_WITHOUT_RULE: LessonAdmission = {
  admitted: true,
  reason: 'NOT_APPLIED',
  shortfall: 0,
  paidThrough: null,
};

/** One CHARGED month charge of an ACTIVE enrollment. */
export interface AdmissionCharge {
  groupId: string;
  coveredDates: readonly string[];
  frozenOutDates: readonly string[];
  coveredLessons: number;
  /** Undiscounted, as stored; `departureRelease` applies the discount. */
  perLessonCost: number;
  discountPercent: number;
  chargedAmount: number;
}

/**
 * What the month's charges still hold for lessons after `day` — the same
 * figure a departure on `day` would credit back (`departureRelease`), so the
 * lesson on `day` itself counts as held.
 */
export function heldAfter(
  charges: readonly AdmissionCharge[],
  day: string,
): number {
  let total = 0;
  for (const c of charges) {
    const release = departureRelease({
      departureDay: day,
      coveredDates: c.coveredDates,
      frozenOutDates: c.frozenOutDates,
      coveredLessons: c.coveredLessons,
      perLessonCost: c.perLessonCost,
      discountPercent: c.discountPercent,
      chargedAmount: c.chargedAmount,
      // A row without dates predates October; release all of it so the rule
      // never blocks on data it cannot read.
      lessonsThroughDeparture: 0,
    });
    total += release?.amount ?? 0;
  }
  return total;
}

/** The student's lessons in one group this month, frozen-out ones excluded, sorted. */
function groupLessons(
  charges: readonly AdmissionCharge[],
  groupId: string,
): string[] {
  const days = new Set<string>();
  for (const c of charges) {
    if (c.groupId !== groupId) continue;
    const out = new Set(c.frozenOutDates);
    for (const d of c.coveredDates) if (!out.has(d)) days.add(d);
  }
  return [...days].sort();
}

export function lessonAdmission(input: {
  lessonDay: string;
  groupId: string;
  balance: number;
  charges: readonly AdmissionCharge[];
}): LessonAdmission {
  if (input.lessonDay < ADMISSION_START_DAY) return ADMITTED_WITHOUT_RULE;
  const lessons = groupLessons(input.charges, input.groupId);
  // No charge in this group for the month: nothing to measure against. The
  // monthly cron writes one on the 1st; until it does the rule stays out of
  // the way instead of blocking on missing data.
  if (lessons.length === 0) return ADMITTED_WITHOUT_RULE;

  const secondLesson = paymentDueDate(lessons);
  if (secondLesson === null || input.lessonDay < secondLesson) {
    return { admitted: true, reason: 'FIRST_LESSON', shortfall: 0, paidThrough: null };
  }

  const reach = input.balance + heldAfter(input.charges, input.lessonDay);
  if (reach < 0) {
    return { admitted: false, reason: 'NOT_PAID', shortfall: -reach, paidThrough: null };
  }

  let paidThrough: string | null = null;
  if (input.balance < 0) {
    paidThrough = input.lessonDay;
    for (const day of lessons) {
      if (day <= input.lessonDay) continue;
      if (input.balance + heldAfter(input.charges, day) < 0) break;
      paidThrough = day;
    }
  }
  return { admitted: true, reason: 'PAID', shortfall: 0, paidThrough };
}

export interface PaymentReach {
  /** The last lesson from today the new balance admits; null when not even the next one. */
  paidThrough: string | null;
  /** The first lesson from today the new balance does not admit, and what it still needs. */
  next: { date: string; groupName: string; needed: number } | null;
  /** The new balance leaves no debt: no promise is needed. */
  clearsDebt: boolean;
}

/**
 * How far a payment reaches this month (the payment dialog, ADR-0045).
 * Null when the rule does not apply or no lesson is left this month.
 */
export function paymentReach(input: {
  today: string;
  balanceAfter: number;
  charges: readonly (AdmissionCharge & { groupName: string })[];
}): PaymentReach | null {
  if (input.today < ADMISSION_START_DAY) return null;

  const upcoming: { day: string; groupName: string; free: boolean }[] = [];
  for (const groupId of new Set(input.charges.map((c) => c.groupId))) {
    const lessons = groupLessons(input.charges, groupId);
    if (lessons.length === 0) continue;
    const second = paymentDueDate(lessons);
    const groupName = input.charges.find((c) => c.groupId === groupId)!.groupName;
    for (const day of lessons) {
      if (day < input.today) continue;
      upcoming.push({ day, groupName, free: second === null || day < second });
    }
  }
  if (upcoming.length === 0) return null;
  upcoming.sort(
    (a, b) => a.day.localeCompare(b.day) || a.groupName.localeCompare(b.groupName),
  );

  if (input.balanceAfter >= 0) {
    return { paidThrough: upcoming[upcoming.length - 1].day, next: null, clearsDebt: true };
  }

  let paidThrough: string | null = null;
  for (const lesson of upcoming) {
    const reach = input.balanceAfter + heldAfter(input.charges, lesson.day);
    if (!lesson.free && reach < 0) {
      return {
        paidThrough,
        next: { date: lesson.day, groupName: lesson.groupName, needed: -reach },
        clearsDebt: false,
      };
    }
    paidThrough = lesson.day;
  }
  return { paidThrough, next: null, clearsDebt: false };
}
```

- [ ] **Step 4: Run the pure tests**

Run: `cd server && npx jest src/billing/lesson-admission.spec.ts --runInBand`
Expected: PASS. If the discount case is off by rounding, read `applyDiscount` in `billing/monthly-price.ts` and fix the TEST's expected per-lesson price (the rule must stay `departureRelease`'s).

- [ ] **Step 5: Write the failing service test**

Create `server/src/billing/lesson-admission.service.spec.ts`:

```ts
import { LessonAdmissionService } from './lesson-admission.service';

const OCT = ['2026-10-02', '2026-10-05', '2026-10-07'];
const chargeRow = (studentId: number) => ({
  studentId,
  groupId: 'g005',
  coveredDates: OCT,
  frozenOutDates: [],
  coveredLessons: 3,
  perLessonCost: 100000,
  discountPercent: 0,
  chargedAmount: 300000,
  group: { name: '#005' },
});

describe('LessonAdmissionService', () => {
  const prisma = {
    student: { findMany: jest.fn() },
    enrollmentMonthlyCharge: { findMany: jest.fn() },
  };
  const service = new LessonAdmissionService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('judges every student of a lesson from their balance and month charges', async () => {
    prisma.student.findMany.mockResolvedValue([
      { id: 1, balance: -300000 },
      { id: 2, balance: -100000 },
    ]);
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([chargeRow(1), chargeRow(2)]);

    const result = await service.forLesson({ groupId: 'g005', lessonDay: '2026-10-05', studentIds: [1, 2] });

    expect(result.get(1)).toMatchObject({ admitted: false, shortfall: 200000 });
    expect(result.get(2)).toMatchObject({ admitted: true, paidThrough: '2026-10-05' });
    expect(prisma.enrollmentMonthlyCharge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          periodYear: 2026,
          periodMonth: 10,
          status: 'CHARGED',
          enrollment: { status: 'ACTIVE', deletedAt: null },
        }),
      }),
    );
  });

  it('reads nothing before the rule starts', async () => {
    const result = await service.forLesson({ groupId: 'g005', lessonDay: '2026-09-30', studentIds: [1] });
    expect(result.size).toBe(0);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('reaches for a payment with the group names', async () => {
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([chargeRow(1)]);
    const reach = await service.reachForPayment({ studentId: 1, balanceAfter: -150000, today: '2026-10-05' });
    expect(reach).toEqual({
      paidThrough: '2026-10-05',
      next: { date: '2026-10-07', groupName: '#005', needed: 50000 },
      clearsDebt: false,
    });
  });
});
```

- [ ] **Step 6: Implement the service and register it**

Create `server/src/billing/lesson-admission.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  EnrollmentStatus,
  MonthlyChargeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMISSION_START_DAY,
  lessonAdmission,
  paymentReach,
  type AdmissionCharge,
  type LessonAdmission,
  type PaymentReach,
} from './lesson-admission';

type Reader = Prisma.TransactionClient | PrismaService;

/**
 * Loads what `lessonAdmission` / `paymentReach` judge (ADR-0045): the
 * student's balance and their CHARGED month charges on ACTIVE enrollments —
 * a departed or frozen enrollment's lessons are not "still held".
 */
@Injectable()
export class LessonAdmissionService {
  constructor(private prisma: PrismaService) {}

  /** Contract 3.2 for every student of one lesson. A student missing from the map is admitted. */
  async forLesson(
    params: { groupId: string; lessonDay: string; studentIds: number[] },
    client: Reader = this.prisma,
  ): Promise<Map<number, LessonAdmission>> {
    const result = new Map<number, LessonAdmission>();
    if (params.studentIds.length === 0) return result;
    if (params.lessonDay < ADMISSION_START_DAY) return result;

    const [year, month] = params.lessonDay.split('-').map(Number);
    const [students, charges] = await Promise.all([
      client.student.findMany({
        where: { id: { in: params.studentIds } },
        select: { id: true, balance: true },
      }),
      this.loadCharges(client, params.studentIds, year, month),
    ]);
    for (const student of students) {
      result.set(
        student.id,
        lessonAdmission({
          lessonDay: params.lessonDay,
          groupId: params.groupId,
          balance: student.balance,
          charges: charges.filter((c) => c.studentId === student.id),
        }),
      );
    }
    return result;
  }

  /** How far a payment reaches this month (payment dialog). Null: the rule does not apply. */
  async reachForPayment(params: {
    studentId: number;
    balanceAfter: number;
    today: string;
  }): Promise<PaymentReach | null> {
    if (params.today < ADMISSION_START_DAY) return null;
    const [year, month] = params.today.split('-').map(Number);
    const charges = await this.loadCharges(this.prisma, [params.studentId], year, month);
    return paymentReach({
      today: params.today,
      balanceAfter: params.balanceAfter,
      charges,
    });
  }

  private async loadCharges(
    client: Reader,
    studentIds: number[],
    year: number,
    month: number,
  ): Promise<(AdmissionCharge & { studentId: number; groupName: string })[]> {
    const rows = await client.enrollmentMonthlyCharge.findMany({
      where: {
        studentId: { in: studentIds },
        periodYear: year,
        periodMonth: month,
        status: MonthlyChargeStatus.CHARGED,
        enrollment: { status: EnrollmentStatus.ACTIVE, deletedAt: null },
      },
      select: {
        studentId: true,
        groupId: true,
        coveredDates: true,
        frozenOutDates: true,
        coveredLessons: true,
        perLessonCost: true,
        discountPercent: true,
        chargedAmount: true,
        group: { select: { name: true } },
      },
    });
    return rows.map(({ group, ...row }) => ({ ...row, groupName: group.name }));
  }
}
```

In `server/src/billing/billing.module.ts` import it, add `LessonAdmissionService` to `providers` and to `exports`.

- [ ] **Step 7: Run the tests**

Run: `cd server && npx jest src/billing/lesson-admission --runInBand && npm run typecheck 2>&1 | tail -3`
Expected: PASS, typecheck clean. (The service test uses `'CHARGED'`/`'ACTIVE'` strings; Prisma enums are string values, so `toHaveBeenCalledWith` matches.)

- [ ] **Step 8: Commit**

```bash
git add server/src/billing/lesson-admission.ts server/src/billing/lesson-admission.spec.ts server/src/billing/lesson-admission.service.ts server/src/billing/lesson-admission.service.spec.ts server/src/billing/billing.module.ts
git commit -m "feat(billing): contract 3.2 admission rule

From the month's 2nd lesson a student is admitted only while their balance
plus the month's still-held lessons is not negative — everything up to and
including today paid, older debt too. The first lesson stays free.
paymentReach tells the payment dialog how far an amount goes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The roster shows the window and admission; saves and scans obey admission

**Files:**
- Modify: `server/src/attendance/attendance.service.ts` (constructor, `getByDate`)
- Modify: `server/src/attendance/attendance-save.service.ts` (constructor, enrollment select, admission block)
- Modify: `server/src/attendance/qr-attendance-scan.service.ts` (constructor, admission check, stale comment)
- Test: `server/src/attendance/attendance.service.spec.ts`, `server/src/attendance/qr-attendance.service.spec.ts`

**Interfaces:**
- Consumes: `LessonAdmissionService.forLesson`, `ADMITTED_WITHOUT_RULE`, `AttendanceValidationService.windowFor`.
- Produces: `GET /attendance/:groupId/date/:date` now returns `window: LessonWindow` and every `activeStudents[i].admission: LessonAdmission`.

- [ ] **Step 1: Write the failing tests**

In `server/src/attendance/attendance.service.spec.ts`:
- add `import { LessonAdmissionService } from '../billing/lesson-admission.service';` and a variable `let admission: { forLesson: jest.Mock };`
- in the outer `beforeEach`, before `Test.createTestingModule`, add `admission = { forLesson: jest.fn().mockResolvedValue(new Map()) };` and the provider `{ provide: LessonAdmissionService, useValue: admission }`;
- in `describe('getByDate')` add:

```ts
    it('returns the lesson window and each student\'s admission', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      admission.forLesson.mockResolvedValue(
        new Map([[10002, { admitted: false, reason: 'NOT_PAID', shortfall: 69231, paidThrough: null }]]),
      );
      const result = await service.getByDate('group-uuid-1', '2026-04-01');
      expect(result.window).toEqual(
        expect.objectContaining({ startTime: '09:00', endTime: '11:00' }),
      );
      expect(result.activeStudents[0].admission).toEqual({
        admitted: true, reason: 'NOT_APPLIED', shortfall: 0, paidThrough: null,
      });
      expect(result.activeStudents[1].admission).toMatchObject({ admitted: false, shortfall: 69231 });
    });
```

- in `describe('save')` add:

```ts
    it('refuses a new mark for a student the admission rule blocks', async () => {
      admission.forLesson.mockResolvedValue(
        new Map([[10002, { admitted: false, reason: 'NOT_PAID', shortfall: 69231, paidThrough: null }]]),
      );
      prisma.attendance.findMany.mockResolvedValue([]);
      await expect(
        service.save('group-uuid-1', '2026-04-01', twoPresent, 1, ['Teacher'], 1),
      ).rejects.toThrow("Dilnoza Rashidova to'lov qilmagan");
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('lets a blocked student be left off the roster', async () => {
      admission.forLesson.mockResolvedValue(
        new Map([[10002, { admitted: false, reason: 'NOT_PAID', shortfall: 69231, paidThrough: null }]]),
      );
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert.mockResolvedValue({ id: 'att-1', studentId: 10001, status: 'PRESENT' });
      const result = await service.save(
        'group-uuid-1', '2026-04-01',
        { entries: [{ studentId: 10001, status: 'PRESENT' }] }, 1, ['Teacher'], 1,
      );
      expect(result.count).toBe(1);
    });

    it('lets a blocked student be marked EXCUSED', async () => {
      admission.forLesson.mockResolvedValue(
        new Map([[10002, { admitted: false, reason: 'NOT_PAID', shortfall: 69231, paidThrough: null }]]),
      );
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.attendance.upsert.mockResolvedValue({ id: 'att-2', studentId: 10002, status: 'EXCUSED' });
      await expect(
        service.save(
          'group-uuid-1', '2026-04-01',
          { entries: [{ studentId: 10001, status: 'PRESENT' }, { studentId: 10002, status: 'EXCUSED' }] },
          1, ['Administrator'], 1,
        ),
      ).resolves.toMatchObject({ count: 2 });
    });

    it('does not re-judge an unchanged mark', async () => {
      admission.forLesson.mockResolvedValue(
        new Map([[10002, { admitted: false, reason: 'NOT_PAID', shortfall: 1, paidThrough: null }]]),
      );
      prisma.attendance.findMany.mockResolvedValue([
        { studentId: 10002, status: 'PRESENT', note: null },
      ]);
      prisma.attendance.upsert.mockResolvedValue({ id: 'att-1', studentId: 10001, status: 'PRESENT' });
      await expect(
        service.save('group-uuid-1', '2026-04-01', twoPresent, 1, ['Administrator'], 1),
      ).resolves.toMatchObject({ count: 2 });
    });
```

- [ ] **Step 2: Run to see them fail**

Run: `cd server && npx jest src/attendance/attendance.service.spec.ts --runInBand 2>&1 | tail -20`
Expected: FAIL — no `window`/`admission` in the roster; the blocked mark is saved.

- [ ] **Step 3: Enrich the roster**

In `server/src/attendance/attendance.service.ts`:

```ts
import { LessonAdmissionService } from '../billing/lesson-admission.service';
import { ADMITTED_WITHOUT_RULE } from '../billing/lesson-admission';
```

Constructor gains `private admission: LessonAdmissionService,`. Replace `getByDate`:

```ts
  /**
   * The roster plus what the screen must obey (ADR-0045): the lesson window
   * and, per student, whether contract 3.2 admits them to this lesson.
   */
  async getByDate(
    groupId: string,
    date: string,
    companyId?: number,
    roles?: string[],
  ) {
    const roster = await this.read.getByDate(groupId, date, companyId, roles);
    const [window, admission] = await Promise.all([
      this.validation.windowFor(groupId, date, companyId),
      this.admission.forLesson({
        groupId,
        lessonDay: date,
        studentIds: roster.activeStudents.map((s) => s.studentId),
      }),
    ]);
    return {
      ...roster,
      window,
      activeStudents: roster.activeStudents.map((s) => ({
        ...s,
        admission: admission.get(s.studentId) ?? ADMITTED_WITHOUT_RULE,
      })),
    };
  }
```

- [ ] **Step 4: Enforce admission in the save**

In `server/src/attendance/attendance-save.service.ts`:
- import `LessonAdmissionService` from `'../billing/lesson-admission.service'` and add `private admission: LessonAdmissionService,` as the last constructor parameter;
- the enrollment query's `select` becomes `{ id: true, studentId: true, student: { select: { firstName: true, lastName: true } } }`, and right after `enrollmentIdByStudent` add

```ts
        const nameByStudent = new Map(
          enrolledStudents.map((e) => [
            e.studentId,
            `${e.student?.firstName ?? ''} ${e.student?.lastName ?? ''}`.trim(),
          ]),
        );

        // ADR-0045 / contract 3.2: from the month's 2nd lesson a student
        // attends only as far as their payments reach. A blocked student may
        // be left off the roster or marked EXCUSED (an announced absence);
        // any other new mark is refused below.
        const admission = await this.admission.forLesson(
          { groupId, lessonDay: date, studentIds: [...enrolledStudentIds] },
          tx,
        );
        const blocked = new Set(
          [...admission].filter(([, a]) => !a.admitted).map(([id]) => id),
        );
```

  (place it after `enrolledStudentIds` is built and before the `for (const entry of dto.entries)` enrollment check);
- the full-roster check skips blocked students:

```ts
        const missingStudentIds = [...expectedStudentIds].filter(
          (id) => !submittedStudentIds.has(id) && !blocked.has(id),
        );
```

- after the teacher-once check (`if (isTeacherOnly && existingRecords.length > 0) { ... }`) insert:

```ts
        for (const entry of dto.entries) {
          if (!blocked.has(entry.studentId)) continue;
          if (entry.status === AttendanceStatus.EXCUSED) continue;
          if (existingMap.get(entry.studentId)?.status === entry.status) continue;
          const name = nameByStudent.get(entry.studentId) || `#${entry.studentId}`;
          throw new BadRequestException(
            `${name} to'lov qilmagan: shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi`,
          );
        }
```

- [ ] **Step 5: Enforce admission on a QR scan**

In `server/src/attendance/qr-attendance-scan.service.ts` import `LessonAdmissionService` and add `private admission: LessonAdmissionService,` as the last constructor parameter. Replace the comment block that starts `// No balance gate: a student with insufficient balance is allowed to` (5 lines) with:

```ts
    // Contract 3.2 (ADR-0045): from the month's 2nd lesson a scan admits only
    // a student whose payments reach this lesson.
    const admission = await this.admission.forLesson({
      groupId,
      lessonDay: date,
      studentIds: [studentId],
    });
    if (admission.get(studentId)?.admitted === false) {
      throw new BadRequestException(
        "To'lov qilinmagan: shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaysiz",
      );
    }
```

In `server/src/attendance/qr-attendance.service.spec.ts` add the provider `{ provide: LessonAdmissionService, useValue: { forLesson: jest.fn().mockResolvedValue(new Map()) } }` (with its import) and a test: `forLesson` resolving `new Map([[10001, { admitted: false, reason: 'NOT_PAID', shortfall: 1, paidThrough: null }]])` makes `scanQr` reject with `"To'lov qilinmagan"`.

- [ ] **Step 6: Run the attendance suites**

Run: `cd server && npx jest src/attendance --runInBand 2>&1 | tail -15 && npm run typecheck 2>&1 | tail -3`
Expected: PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add server/src/attendance
git commit -m "feat(attendance): the roster carries the window and contract 3.2 admission

getByDate returns the lesson window and each student's admission. A save
refuses a new mark for a blocked student (EXCUSED stays allowed, an
unchanged mark is not re-judged) and no longer requires one for them; a QR
scan refuses a blocked student.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Payment preview reach and the promise for the rest

**Files:**
- Modify: `server/src/payments/payments-preview.service.ts` (`MonthlyPreview`, constructor, monthly branch)
- Modify: `server/src/payments/dto/create-payment.dto.ts`
- Modify: `server/src/payments/payments-write.service.ts` (constructor, end of `create`)
- Modify: `server/src/payments/payments.module.ts` (import `PaymentPromisesModule`)
- Test: `server/src/payments/payments-preview.service.spec.ts`, `server/src/payments/payments.service.spec.ts`, `server/src/payments/payments.branch-isolation.spec.ts`

**Interfaces:**
- Consumes: `LessonAdmissionService.reachForPayment`, `PaymentReach`, `PaymentPromisesService.upsertOpenPromise({ studentId, promiseDate, comment }, userId, companyId)`.
- Produces: `MonthlyPreview.admission: PaymentReach | null`; `CreatePaymentDto.promiseDate?: string` (ISO date).

- [ ] **Step 1: Write the failing preview test**

In `server/src/payments/payments-preview.service.spec.ts`, add the provider `{ provide: LessonAdmissionService, useValue: admission }` with `const admission = { reachForPayment: jest.fn().mockResolvedValue(null) };` declared at the top of the describe (import from `'../billing/lesson-admission.service'`), and the test:

```ts
  it('attaches how far a monthly payment reaches', async () => {
    const reach = { paidThrough: '2026-10-05', next: { date: '2026-10-07', groupName: '#005', needed: 3846 }, clearsDebt: false };
    admission.reachForPayment.mockResolvedValue(reach);
    // Arrange a MONTHLY student exactly as the file's existing monthly test does
    // (copy its prisma mocks), with balance -450000 and amount 100000.
    const preview = await service.preview(1, 100000, 1, null);
    expect(preview.monthly?.admission).toEqual(reach);
    expect(admission.reachForPayment).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 1, balanceAfter: -350000 }),
    );
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `cd server && npx jest src/payments/payments-preview.service.spec.ts --runInBand 2>&1 | tail -10`
Expected: FAIL — `monthly.admission` is undefined.

- [ ] **Step 3: Attach the reach**

In `server/src/payments/payments-preview.service.ts`:

```ts
import { LessonAdmissionService } from '../billing/lesson-admission.service';
import type { PaymentReach } from '../billing/lesson-admission';
import { tashkentDateStr } from '../common/date/tashkent';
```

`MonthlyPreview` gains:

```ts
  // Contract 3.2 (ADR-0045): how far the balance after this payment reaches
  // this month's lessons, and what the next one still needs. Null before the
  // rule starts or with no lesson left this month.
  admission: PaymentReach | null;
```

Constructor: `constructor(private prisma: PrismaService, private admission: LessonAdmissionService) {}`.

In `buildMonthlyPreview`, the returned `monthly` becomes `{ debt, nextMonthAmount, discountPercent, enrollments: lines, admission: null }`. In `preview()`, replace the monthly `return this.buildMonthlyPreview(...)` with:

```ts
      const monthly = this.buildMonthlyPreview(
        amount,
        student.balance,
        student.discountPercent ?? 0,
        enrollments,
      );
      if (monthly.monthly) {
        monthly.monthly.admission = await this.admission.reachForPayment({
          studentId,
          balanceAfter: newBalance,
          today: tashkentDateStr(new Date()),
        });
      }
      return monthly;
```

In `server/src/payments/payments.service.spec.ts` add the same `LessonAdmissionService` provider mock to its providers list.

- [ ] **Step 4: Write the failing promise test**

In `server/src/payments/payments.service.spec.ts` add `import { PaymentPromisesService } from '../payment-promises/payment-promises.service';`, a `const paymentPromises = { upsertOpenPromise: jest.fn().mockResolvedValue({}) };` and the provider `{ provide: PaymentPromisesService, useValue: paymentPromises }` (also in `payments.branch-isolation.spec.ts`). Then, next to the existing `create` tests (copy the arrange part of the nearest successful `create` test so the transaction returns a balance), add:

```ts
    it('records the promise for the rest of a part payment', async () => {
      // arrange: the create succeeds and the student's balance after it is -350000
      await service.create({ studentId: 1, amount: 100000, method: 'CASH', promiseDate: '2026-10-07' } as never, 9, 1);
      expect(paymentPromises.upsertOpenPromise).toHaveBeenCalledWith(
        { studentId: 1, promiseDate: '2026-10-07', comment: "Qisman to'lov 100 000 so'm; qolgan 350 000 so'm" },
        9,
        1,
      );
    });

    it('keeps the payment when the promise fails', async () => {
      paymentPromises.upsertOpenPromise.mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.create({ studentId: 1, amount: 100000, method: 'CASH', promiseDate: '2026-10-07' } as never, 9, 1),
      ).resolves.toBeDefined();
    });

    it('writes no promise when the payment clears the debt', async () => {
      // arrange: balance after the create is 0
      await service.create({ studentId: 1, amount: 450000, method: 'CASH', promiseDate: '2026-10-07' } as never, 9, 1);
      expect(paymentPromises.upsertOpenPromise).not.toHaveBeenCalled();
    });
```

(`service` is whatever the spec calls the object whose `create` it exercises — `PaymentsService` delegates to `PaymentsWriteService.create`.)

- [ ] **Step 5: Implement the promise**

`server/src/payments/dto/create-payment.dto.ts`: add `IsDateString` to the `class-validator` import and the field

```ts
  // ADR-0045: a part payment carries the date the rest will be paid by.
  @IsOptional()
  @IsDateString()
  promiseDate?: string;
```

`server/src/payments/payments-write.service.ts`: import `PaymentPromisesService` from `'../payment-promises/payment-promises.service'`, add `private paymentPromises: PaymentPromisesService,` as the last constructor parameter, and just before `return { ...payment, studentBalance };` at the end of `create` insert:

```ts
    // ADR-0045 / contract 3.2: a part payment carries a promise for the rest.
    // The payment stands whatever happens to the promise.
    if (dto.promiseDate && (studentBalance ?? 0) < 0) {
      try {
        await this.paymentPromises.upsertOpenPromise(
          {
            studentId: dto.studentId,
            promiseDate: dto.promiseDate,
            comment: `Qisman to'lov ${formatSom(dto.amount)} so'm; qolgan ${formatSom(-(studentBalance ?? 0))} so'm`,
          },
          userId,
          companyId,
        );
      } catch (err) {
        this.logger.warn(
          `Promise after payment ${payment.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
```

`server/src/payments/payments.module.ts`: add `PaymentPromisesModule` (from `'../payment-promises/payment-promises.module'`) to `imports`.

- [ ] **Step 6: Run the payment suites**

Run: `cd server && npx jest src/payments src/payment-promises --runInBand 2>&1 | tail -15 && npm run typecheck 2>&1 | tail -3`
Expected: PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add server/src/payments
git commit -m "feat(payments): a part payment shows its reach and records a promise

The monthly preview says how far the balance after the payment reaches
this month's lessons and what the next one still needs. A payment that
leaves a debt and carries promiseDate upserts the student's open promise;
the payment stands if that fails.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reminder texts

**Files:**
- Modify: `server/src/attendance/attendance-reminder.service.ts` (`sendTeacherWarning`, `sendMissingToTeacher`, `notifyBranchAdmins`)
- Test: `server/src/attendance/attendance-reminder.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `server/src/attendance/attendance-reminder.service.spec.ts`, reusing the spec's existing arrange for the end-of-lesson trigger (copy the nearest test that asserts a MISSING notification), assertions on the delivered message text:

```ts
    expect(deliveredMessage).toContain("Bu dars uchun ish haqi yozilmadi. Davomatni endi saytda kiritib bo'lmaydi.");
```

and for the 30-minute warning:

```ts
    expect(deliveredMessage).toContain("Dars tugaguncha olinmasa, bu dars uchun sizga ish haqi yozilmaydi.");
```

(`deliveredMessage` = the message argument of the spec's notification/Telegram mock call — use the accessor the neighbouring tests use.)

- [ ] **Step 2: Run to see it fail**

Run: `cd server && npx jest src/attendance/attendance-reminder.service.spec.ts --runInBand 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Change the four texts**

`sendTeacherWarning` message:

```ts
      `⏰ Dars tugashiga 30 daqiqa qoldi\n\n${details}\n\nDavomat hali olinmagan. Dars tugaguncha olinmasa, bu dars uchun sizga ish haqi yozilmaydi.\n🔗 ${TEACHER_PORTAL_URL}`,
```

`sendMissingToTeacher` title and message:

```ts
      'Davomat olinmadi',
      `📝 Darsingiz tugadi, davomat olinmadi\n\n${details}\n\nBu dars uchun ish haqi yozilmadi. Davomatni endi saytda kiritib bo'lmaydi.\n🔗 ${TEACHER_PORTAL_URL}`,
```

`notifyBranchAdmins`:

```ts
    const title =
      kind === 'ADMIN_ALERT' ? 'Davomat hali olinmagan' : 'Davomat olinmadi';
    const message =
      kind === 'ADMIN_ALERT'
        ? `👀 Dars tugashiga 30 daqiqa qoldi, o'qituvchi hali davomat olmadi\n\n${details}\n\nDars tugaguncha siz olsangiz, ustoz haqi saqlanib qoladi.\n🔗 ${ADMIN_PORTAL_URL}`
        : `📋 Davomat olinmadi\n\n${details}\n\nUstozga bu dars uchun ish haqi yozilmadi. Davomatni endi saytda kiritib bo'lmaydi.\n🔗 ${ADMIN_PORTAL_URL}`;
```

- [ ] **Step 4: Run and commit**

Run: `cd server && npx jest src/attendance/attendance-reminder.service.spec.ts --runInBand 2>&1 | tail -5`
Expected: PASS.

```bash
git add server/src/attendance/attendance-reminder.service.ts server/src/attendance/attendance-reminder.service.spec.ts
git commit -m "feat(attendance): reminders say what a missed attendance costs

The 30-minute warnings say an untaken attendance is not paid and that an
admin taking it keeps the teacher's pay; the end-of-lesson messages no
longer ask anyone to restore it — it can no longer be entered on the site.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client — one window rule on the attendance screen

**Files:**
- Create: `client/src/lib/lesson-window.ts`, `client/src/lib/lesson-window.test.ts`
- Create: `client/src/components/groups/attendance/attendance-window.ts`, `client/src/components/groups/attendance/attendance-window.test.ts`
- Modify: `client/src/components/groups/attendance/attendance-form-utils.ts` (types)
- Modify: `client/src/components/groups/attendance/attendance-form.tsx` (window state, lock, planning, banner)
- Modify: `client/src/components/groups/attendance/attendance-missed-lessons.tsx`

**Interfaces:**
- Produces:
  - `lessonWindowState(p: { lessonDay: string; startTime: string | null; endTime: string | null; now?: Date }): "before" | "open" | "closed"`
  - `windowBanner(p: { state; startTime: string | null; endTime: string | null; isAdmin: boolean; isToday: boolean; hasAttendance: boolean; alreadyTakenForTeacher: boolean }): { tone: "info" | "success" | "warning" | "danger"; text: string } | null`
  - `interface LessonWindowInfo { state: LessonWindowState; startTime: string | null; endTime: string | null }`
  - `interface LessonAdmission { admitted: boolean; reason: "NOT_APPLIED" | "FIRST_LESSON" | "PAID" | "NOT_PAID"; shortfall: number; paidThrough: string | null }`
  - `StudentAttendance.admission?: LessonAdmission`

- [ ] **Step 1: Write the failing tests**

`client/src/lib/lesson-window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lessonWindowState } from "./lesson-window";

const lesson = { lessonDay: "2026-10-05", startTime: "15:00", endTime: "16:30" };

describe("lessonWindowState (mirror of the server rule)", () => {
  it("before, open, closed around the lesson", () => {
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-05T09:49:00Z") })).toBe("before");
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-05T09:50:00Z") })).toBe("open");
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-05T11:30:30Z") })).toBe("open");
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-05T11:31:00Z") })).toBe("closed");
  });
  it("past days are closed and future days are before", () => {
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-06T04:00:00Z") })).toBe("closed");
    expect(lessonWindowState({ ...lesson, now: new Date("2026-10-04T12:00:00Z") })).toBe("before");
  });
});
```

`client/src/components/groups/attendance/attendance-window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { windowBanner } from "./attendance-window";

const base = {
  startTime: "15:00",
  endTime: "16:30",
  isToday: true,
  hasAttendance: false,
  alreadyTakenForTeacher: false,
};

describe("windowBanner", () => {
  it("tells the teacher the attendance is taken once and closes at the end", () => {
    expect(windowBanner({ ...base, state: "open", isAdmin: false })).toEqual({
      tone: "info",
      text: "Davomatni bir marta olasiz. U 16:30 da yopiladi: dars tugaguncha olinmasa, bu dars uchun ish haqi yozilmaydi.",
    });
  });
  it("tells an admin how long corrections stay open", () => {
    expect(windowBanner({ ...base, state: "open", isAdmin: true, hasAttendance: true })?.text).toBe(
      "Tuzatish 16:30 gacha ochiq (dars tugaguncha). Keyin davomat yopiladi: hech kim o'zgartira olmaydi.",
    );
  });
  it("tells an admin the teacher has not taken it yet", () => {
    expect(windowBanner({ ...base, state: "open", isAdmin: true })?.text).toBe(
      "Ustoz hali davomat olmagan. 16:30 gacha siz olsangiz, ustoz haqi saqlanib qoladi.",
    );
  });
  it("says a lesson without attendance cost the teacher its pay", () => {
    expect(windowBanner({ ...base, state: "closed", isAdmin: false })).toEqual({
      tone: "danger",
      text: "Dars tugadi, davomat olinmadi. Bu dars uchun ustozga ish haqi yozilmadi. Davomatni endi saytda hech kim kirita olmaydi.",
    });
  });
  it("says a taken lesson is closed", () => {
    expect(windowBanner({ ...base, state: "closed", isAdmin: true, hasAttendance: true })?.text).toBe(
      "Dars tugagan. Davomat yopilgan: endi uni saytda o'zgartirib bo'lmaydi.",
    );
  });
  it("announces when a lesson opens", () => {
    expect(windowBanner({ ...base, state: "before", isAdmin: false })?.text).toBe(
      "Dars 15:00 da boshlanadi. Davomat 14:50 da ochiladi.",
    );
    expect(windowBanner({ ...base, state: "before", isAdmin: false, isToday: false })?.text).toBe(
      "Bu dars hali boshlanmagan. Davomat dars kuni ochiladi.",
    );
  });
  it("confirms the teacher's own save", () => {
    expect(windowBanner({ ...base, state: "open", isAdmin: false, hasAttendance: true, alreadyTakenForTeacher: true })).toEqual({
      tone: "success",
      text: "Davomat olib bo'lingan. Dars tugaguncha administrator tuzata oladi.",
    });
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd client && npx vitest run src/lib/lesson-window.test.ts src/components/groups/attendance/attendance-window.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both helpers**

`client/src/lib/lesson-window.ts`:

```ts
import { tashkentNow } from "@/lib/tashkent-time";

/**
 * Mirror of the server's attendance window (ADR-0045,
 * `server/src/attendance/shared/lesson-window.ts`): it opens 10 minutes
 * before the lesson and closes when it ends, Tashkent time, for every role.
 * The server enforces it; this copy only drives the screen between fetches.
 */
export const WINDOW_OPENS_MINUTES_BEFORE = 10;

export type LessonWindowState = "before" | "open" | "closed";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function lessonWindowState(p: {
  lessonDay: string;
  startTime: string | null;
  endTime: string | null;
  now?: Date;
}): LessonWindowState {
  const now = tashkentNow(p.now ?? new Date());
  if (p.lessonDay < now.dateStr) return "closed";
  if (p.lessonDay > now.dateStr) return "before";
  if (!p.startTime || !p.endTime) return "open";
  if (now.minutes < toMinutes(p.startTime) - WINDOW_OPENS_MINUTES_BEFORE) {
    return "before";
  }
  if (now.minutes > toMinutes(p.endTime)) return "closed";
  return "open";
}

/** 'HH:MM' minus the opening lead, for the banner. */
export function windowOpensAt(startTime: string): string {
  const m = toMinutes(startTime) - WINDOW_OPENS_MINUTES_BEFORE;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
```

`client/src/components/groups/attendance/attendance-window.ts`:

```ts
import { windowOpensAt, type LessonWindowState } from "@/lib/lesson-window";

export type WindowBannerTone = "info" | "success" | "warning" | "danger";

/** The one line the attendance screen shows about its window (ADR-0045). */
export function windowBanner(p: {
  state: LessonWindowState;
  startTime: string | null;
  endTime: string | null;
  isAdmin: boolean;
  isToday: boolean;
  hasAttendance: boolean;
  alreadyTakenForTeacher: boolean;
}): { tone: WindowBannerTone; text: string } | null {
  if (p.state === "before") {
    if (p.isToday && p.startTime) {
      return {
        tone: "info",
        text: `Dars ${p.startTime} da boshlanadi. Davomat ${windowOpensAt(p.startTime)} da ochiladi.`,
      };
    }
    return { tone: "info", text: "Bu dars hali boshlanmagan. Davomat dars kuni ochiladi." };
  }
  if (p.state === "closed") {
    if (p.hasAttendance) {
      return {
        tone: "success",
        text: "Dars tugagan. Davomat yopilgan: endi uni saytda o'zgartirib bo'lmaydi.",
      };
    }
    return {
      tone: "danger",
      text: "Dars tugadi, davomat olinmadi. Bu dars uchun ustozga ish haqi yozilmadi. Davomatni endi saytda hech kim kirita olmaydi.",
    };
  }
  const end = p.endTime ?? "";
  if (!p.isAdmin) {
    if (p.alreadyTakenForTeacher) {
      return {
        tone: "success",
        text: "Davomat olib bo'lingan. Dars tugaguncha administrator tuzata oladi.",
      };
    }
    return {
      tone: "info",
      text: `Davomatni bir marta olasiz. U ${end} da yopiladi: dars tugaguncha olinmasa, bu dars uchun ish haqi yozilmaydi.`,
    };
  }
  if (p.hasAttendance) {
    return {
      tone: "info",
      text: `Tuzatish ${end} gacha ochiq (dars tugaguncha). Keyin davomat yopiladi: hech kim o'zgartira olmaydi.`,
    };
  }
  return {
    tone: "warning",
    text: `Ustoz hali davomat olmagan. ${end} gacha siz olsangiz, ustoz haqi saqlanib qoladi.`,
  };
}
```

- [ ] **Step 4: Types**

In `client/src/components/groups/attendance/attendance-form-utils.ts` add (import `LessonWindowState` from `@/lib/lesson-window`):

```ts
/** The lesson's attendance window from GET /attendance/:groupId/date/:date (ADR-0045). */
export interface LessonWindowInfo {
  state: LessonWindowState;
  startTime: string | null;
  endTime: string | null;
}

/** Contract 3.2 admission of one student to this lesson (ADR-0045). */
export interface LessonAdmission {
  admitted: boolean;
  reason: "NOT_APPLIED" | "FIRST_LESSON" | "PAID" | "NOT_PAID";
  /** The least payment that admits the student today. */
  shortfall: number;
  /** Admitted while owing: the last lesson this month the balance reaches. */
  paidThrough: string | null;
}
```

and `admission?: LessonAdmission;` inside `StudentAttendance`.

- [ ] **Step 5: Wire the form**

In `client/src/components/groups/attendance/attendance-form.tsx`:

1. Imports: add `import { lessonWindowState, type LessonWindowState } from "@/lib/lesson-window";`, `import { windowBanner } from "./attendance-window";`, and `type LessonWindowInfo` in the `./attendance-form-utils` import list.
2. State next to `coursePrice`:

```tsx
  const [serverWindow, setServerWindow] = useState<LessonWindowInfo | null>(null);
  // Re-evaluate the window every 30 s so the screen locks at the lesson's end
  // without a refetch (the server refuses a late save regardless).
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
```

3. Replace the whole `const lessonTimeInfo = (() => { ... })();` block and the `isLocked` / `isPlanningContext` definitions with:

```tsx
  // ADR-0045: one window for every role — 10 minutes before the start until
  // the end. The server sends the lesson's effective times (a move's override
  // included); before the first fetch the group's own times stand in.
  const windowTimes = serverWindow ?? {
    startTime: group.lessonStartTime ?? null,
    endTime: group.lessonEndTime ?? null,
  };
  const windowState: LessonWindowState = lessonWindowState({
    lessonDay: date,
    startTime: windowTimes.startTime,
    endTime: windowTimes.endTime,
    now: new Date(clock),
  });

  // Teacher bir marta davomat olib saqlagan bo'lsa — qayta tahrirlab bo'lmaydi.
  const alreadyTakenForTeacher =
    !isAdmin && students.some((s) => s.status !== null);
  const hasAttendance = students.some((s) => s.status !== null);

  const isLocked = alreadyTakenForTeacher || windowState !== "open";

  // Oldindan belgilash: admin, davomat hali olinmagan va dars hali
  // boshlanmagan (oyna ochilmagan). Dars tugagach oldindan belgilash yo'q.
  const isPlanningContext =
    isAdmin &&
    students.length > 0 &&
    students.every((s) => s.status === null) &&
    windowState === "before";
  const planningMode = isPlanningContext && !forceFinalizeMode;

  const banner = windowBanner({
    state: windowState,
    startTime: windowTimes.startTime,
    endTime: windowTimes.endTime,
    isAdmin,
    isToday,
    hasAttendance,
    alreadyTakenForTeacher,
  });
```

   (Delete the old `const planningMode = isPlanningContext && !forceFinalizeMode;` line that followed the old block; `isToday` stays as defined above it.)
4. In `fetchAttendance` after `setCoursePrice(...)`: `setServerWindow(data.window ?? null);` and in its `catch`: `setServerWindow(null);`.
5. Replace the two banners (`{alreadyTakenForTeacher && ( ... )}` and `{lessonTimeInfo && !alreadyTakenForTeacher && ( ... )}`) with one:

```tsx
      {banner && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm",
            banner.tone === "info" &&
              "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400",
            banner.tone === "success" &&
              "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400",
            banner.tone === "warning" &&
              "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300",
            banner.tone === "danger" &&
              "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400",
          )}
        >
          {banner.tone === "success" ? (
            <Check className="size-4 shrink-0" />
          ) : (
            <Clock className="size-4 shrink-0" />
          )}
          {banner.text}
        </div>
      )}
```

6. The save button block keeps `!alreadyTakenForTeacher && !planningMode` and its `disabled={submitting || isLocked || unmarkedStudents.length > 0}`; add `windowState === "open" &&` to its render condition so a closed or future lesson shows no save button.

- [ ] **Step 6: The missed-lessons list only reports**

Replace the `missedLessons.map(...)` body in `client/src/components/groups/attendance/attendance-missed-lessons.tsx` so each item is a plain `div` (no `button`, no `onClick`, no chevron) reading:

```tsx
          <div
            key={lesson.date}
            className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-left dark:border-red-800 dark:bg-red-950/30"
          >
            <div>
              <p className="text-sm font-medium">
                {lessonIndex + 1}-dars ({formatShortDate(lesson.date)},{" "}
                {DAY_SHORT[lesson.dayName] ?? lesson.dayName})
              </p>
              <p className="text-xs text-red-700 dark:text-red-400">
                Davomat olinmagan · ustozga haq yozilmadi
              </p>
            </div>
          </div>
```

The heading becomes `Davomat olinmagan darslar (endi kiritib bo'lmaydi):` in the same red tone. Remove the now-unused `onSelectDate` prop from the component and from its caller in `attendance-cycle-dashboard.tsx` (keep `onSelectDate` where the dashboard uses it for other lessons). Remove the unused `GoIcon` import.

- [ ] **Step 7: Run tests, lint, types**

Run: `cd client && npx vitest run src/lib/lesson-window.test.ts src/components/groups/attendance && npx eslint src/lib/lesson-window.ts src/components/groups/attendance && npx tsc --noEmit -p . 2>&1 | head -5`
Expected: tests PASS, no lint errors, no type errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/lesson-window.ts client/src/lib/lesson-window.test.ts client/src/components/groups/attendance
git commit -m "feat(client): the attendance screen follows the lesson window

One window for every role, driven by the lesson's effective times from the
server and re-evaluated every 30 s. Pre-marking only before the lesson; no
save button outside the window; the missed-lessons list reports instead of
opening the form.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client — blocked and part-paid students on the roster

**Files:**
- Create: `client/src/components/groups/attendance/attendance-admission.ts`, `.../attendance-admission.test.ts`
- Modify: `client/src/components/groups/attendance/attendance-student-row.tsx`
- Modify: `client/src/components/groups/attendance/attendance-form.tsx`

**Interfaces:**
- Consumes: `LessonAdmission` (Task 7 types).
- Produces: `admissionCopy(admission: LessonAdmission | undefined, isAdmin: boolean): { blocked: boolean; label: string | null; warning: string | null }`; `AttendanceStudentRow` prop `onCollectPayment?: (student: StudentAttendance) => void`.

- [ ] **Step 1: Write the failing test**

`client/src/components/groups/attendance/attendance-admission.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { admissionCopy } from "./attendance-admission";

const blocked = { admitted: false, reason: "NOT_PAID" as const, shortfall: 69231, paidThrough: null };

describe("admissionCopy", () => {
  it("warns the teacher in the CEO's words", () => {
    expect(admissionCopy(blocked, false)).toEqual({
      blocked: true,
      label: "To'lov qilinmagan · darsga qo'yilmaydi",
      warning:
        "Bu o'quvchi oylik to'lovni qilmagan. Shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.",
    });
  });
  it("tells the admin the least payment for today", () => {
    expect(admissionCopy(blocked, true).warning).toBe(
      "Bugungi darsga kirishi uchun kamida 69 231 so'm kerak. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.",
    );
  });
  it("names how far a part payment reaches", () => {
    expect(
      admissionCopy({ admitted: true, reason: "PAID", shortfall: 0, paidThrough: "2026-10-09" }, false),
    ).toEqual({ blocked: false, label: "Qisman to'lagan · 09.10 gacha qatnasha oladi", warning: null });
  });
  it("says nothing for a paid or ungated student", () => {
    expect(admissionCopy({ admitted: true, reason: "PAID", shortfall: 0, paidThrough: null }, true)).toEqual({
      blocked: false, label: null, warning: null,
    });
    expect(admissionCopy(undefined, true)).toEqual({ blocked: false, label: null, warning: null });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd client && npx vitest run src/components/groups/attendance/attendance-admission.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the copy**

`client/src/components/groups/attendance/attendance-admission.ts`:

```ts
import { formatPrice } from "@/lib/format-utils";
import type { LessonAdmission } from "./attendance-form-utils";

const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** What a roster row says about contract 3.2 admission (ADR-0045). */
export function admissionCopy(
  admission: LessonAdmission | undefined,
  isAdmin: boolean,
): { blocked: boolean; label: string | null; warning: string | null } {
  if (!admission) return { blocked: false, label: null, warning: null };
  if (!admission.admitted) {
    return {
      blocked: true,
      label: "To'lov qilinmagan · darsga qo'yilmaydi",
      warning: isAdmin
        ? `Bugungi darsga kirishi uchun kamida ${formatPrice(admission.shortfall)} so'm kerak. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.`
        : "Bu o'quvchi oylik to'lovni qilmagan. Shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.",
    };
  }
  if (admission.paidThrough) {
    return {
      blocked: false,
      label: `Qisman to'lagan · ${ddmm(admission.paidThrough)} gacha qatnasha oladi`,
      warning: null,
    };
  }
  return { blocked: false, label: null, warning: null };
}
```

If `formatPrice(69231)` does not print `69 231` (check `client/src/lib/format-utils.ts`), use the helper that does and adjust nothing else.

- [ ] **Step 4: Render it in the row**

In `client/src/components/groups/attendance/attendance-student-row.tsx`:
- imports: `Lock` from `lucide-react`, `import { Button } from "@/components/ui/button";`, `import { admissionCopy } from "./attendance-admission";`
- new optional prop `onCollectPayment?: (student: StudentAttendance) => void;`
- at the top of the component: `const admission = admissionCopy(student.admission, isAdmin);`
- the `student.isDebtor` badge renders only for admins: `{isAdmin && student.isDebtor && (`, and its tooltip text becomes
  `Oylik to'lov to'liq qilinmagan. 2-darsdan boshlab o'quvchi to'lagan puli yetgan darslargacha qatnashadi.`
- under the name `<div className="flex items-center gap-1.5">…</div>` add:

```tsx
          {admission.label && (
            <p
              className={cn(
                "flex items-center gap-1 text-[11px] font-medium",
                admission.blocked
                  ? "text-yellow-800 dark:text-yellow-300"
                  : "text-muted-foreground",
              )}
            >
              {admission.blocked && <Lock className="size-3" />}
              {admission.label}
            </p>
          )}
```

- each status button's `disabled` becomes
  `disabled={isLocked || (admission.blocked && opt.value !== "EXCUSED")}`
  and the dimming class uses the same condition;
- after the row's main flex `div` (before the note input) add:

```tsx
      {admission.warning && !planningMode && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200 sm:ml-[4.25rem]">
          <p>{admission.warning}</p>
          {isAdmin && onCollectPayment && (
            <Button
              size="sm"
              className="self-start"
              onClick={() => onCollectPayment(student)}
            >
              To&apos;lov qabul qilish
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 5: Wire payment from the form**

In `client/src/components/groups/attendance/attendance-form.tsx`:
- import `RecordPaymentDialog` from `@/components/payments/record-payment-dialog`;
- state `const [paymentFor, setPaymentFor] = useState<StudentAttendance | null>(null);`
- `markAllPresent` skips blocked students: inside its loop `if (student.admission && !student.admission.admitted) continue;`
- `unmarkedStudents` skips blocked students without a seeded mark:

```tsx
  const unmarkedStudents = students.filter((s) => {
    const entry = entries.get(s.studentId);
    if (entry?.status) return false;
    return !(s.admission && !s.admission.admitted);
  });
```

- pass `onCollectPayment={isAdmin ? setPaymentFor : undefined}` to `AttendanceStudentRow`;
- render once, next to `QrAttendanceDialog`:

```tsx
      <RecordPaymentDialog
        open={paymentFor !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentFor(null);
        }}
        preSelectedStudent={
          paymentFor
            ? {
                id: paymentFor.studentId,
                firstName: paymentFor.firstName,
                lastName: paymentFor.lastName,
                balance: paymentFor.balance ?? 0,
              }
            : null
        }
        suggestedAmount={
          paymentFor?.admission
            ? Math.max(1000, Math.ceil(paymentFor.admission.shortfall / 1000) * 1000)
            : undefined
        }
        onSuccess={() => {
          setPaymentFor(null);
          fetchAttendance();
        }}
      />
```

- [ ] **Step 6: Run tests, lint, types, commit**

Run: `cd client && npx vitest run src/components/groups/attendance && npx eslint src/components/groups/attendance && npx tsc --noEmit -p . 2>&1 | head -5`
Expected: PASS, clean.

```bash
git add client/src/components/groups/attendance
git commit -m "feat(client): blocked and part-paid students on the roster

A student contract 3.2 blocks stays on the roster, locked, with the CEO's
warning for the teacher and, for an admin, the least payment for today and
a «To'lov qabul qilish» button. A part-paid student shows how far the money
reaches. The debt badge is admin-only with a monthly tooltip.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client — the payment dialog's reach and promise date

**Files:**
- Create: `client/src/components/payments/record-payment-admission.ts`, `.../record-payment-admission.test.ts`
- Modify: `client/src/components/payments/record-payment-quick-amounts.ts` (`MonthlyPreviewBlock.admission`)
- Modify: `client/src/components/payments/record-payment-dialog.tsx`

**Interfaces:**
- Consumes: server `monthly.admission: PaymentReach | null` (Task 5), `promiseDate` on `POST /payments`.
- Produces: `interface PaymentReach { paidThrough: string | null; next: { date: string; groupName: string; needed: number } | null; clearsDebt: boolean }`; `reachLines(reach: PaymentReach): string[]`; `promiseNeeded(reach: PaymentReach | null | undefined): boolean`; `promiseDefault(reach: PaymentReach): string | null`.

- [ ] **Step 1: Write the failing test**

`client/src/components/payments/record-payment-admission.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { promiseDefault, promiseNeeded, reachLines } from "./record-payment-admission";

const part = {
  paidThrough: "2026-10-05",
  next: { date: "2026-10-07", groupName: "#005", needed: 3846 },
  clearsDebt: false,
};

describe("record-payment-admission", () => {
  it("says how far the money reaches and what the next lesson needs", () => {
    expect(reachLines(part)).toEqual([
      "Bu pul 05.10 gacha yetadi: bugungi darsga kiradi.",
      "Keyingi dars 07.10 (#005): yana kamida 3 846 so'm kerak.",
    ]);
  });
  it("says when even today is not covered", () => {
    expect(reachLines({ ...part, paidThrough: null, next: { ...part.next, date: "2026-10-05", needed: 69231 } })).toEqual([
      "Bu pul bugungi darsga yetmaydi: kamida yana 69 231 so'm kerak (05.10, #005).",
    ]);
  });
  it("a clearing payment needs no promise", () => {
    const full = { paidThrough: "2026-10-30", next: null, clearsDebt: true };
    expect(reachLines(full)).toEqual(["Qarz to'liq yopiladi: oyning oxirigacha qatnashadi."]);
    expect(promiseNeeded(full)).toBe(false);
  });
  it("a part payment needs a promise, defaulting to the first unpaid lesson", () => {
    expect(promiseNeeded(part)).toBe(true);
    expect(promiseDefault(part)).toBe("2026-10-07");
    expect(promiseNeeded(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd client && npx vitest run src/components/payments/record-payment-admission.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers and the type**

`client/src/components/payments/record-payment-admission.ts`:

```ts
import { formatPrice } from "@/lib/format-utils";

/** GET /payments/preview → monthly.admission (ADR-0045, contract 3.2). */
export interface PaymentReach {
  paidThrough: string | null;
  next: { date: string; groupName: string; needed: number } | null;
  clearsDebt: boolean;
}

const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

export function reachLines(reach: PaymentReach): string[] {
  if (reach.clearsDebt) {
    return ["Qarz to'liq yopiladi: oyning oxirigacha qatnashadi."];
  }
  if (!reach.paidThrough && reach.next) {
    return [
      `Bu pul bugungi darsga yetmaydi: kamida yana ${formatPrice(reach.next.needed)} so'm kerak (${ddmm(reach.next.date)}, ${reach.next.groupName}).`,
    ];
  }
  const lines: string[] = [];
  if (reach.paidThrough) {
    lines.push(`Bu pul ${ddmm(reach.paidThrough)} gacha yetadi: bugungi darsga kiradi.`);
  }
  if (reach.next) {
    lines.push(
      `Keyingi dars ${ddmm(reach.next.date)} (${reach.next.groupName}): yana kamida ${formatPrice(reach.next.needed)} so'm kerak.`,
    );
  }
  return lines;
}

/** A payment that leaves a debt carries a promise for the rest. */
export function promiseNeeded(reach: PaymentReach | null | undefined): boolean {
  return !!reach && !reach.clearsDebt;
}

/** The first lesson the money does not reach: the natural promise date. */
export function promiseDefault(reach: PaymentReach): string | null {
  return reach.next?.date ?? null;
}
```

In `client/src/components/payments/record-payment-quick-amounts.ts` add `import type { PaymentReach } from "./record-payment-admission";` and, inside `MonthlyPreviewBlock`, `admission?: PaymentReach | null;`.

- [ ] **Step 4: Wire the dialog**

In `client/src/components/payments/record-payment-dialog.tsx`:
- import `{ promiseDefault, promiseNeeded, reachLines }` from `./record-payment-admission`;
- state: `const [promiseDate, setPromiseDate] = useState("");` and `const [promiseTouched, setPromiseTouched] = useState(false);`;
- after `const preview = previewQuery.data;`:

```tsx
  const reach = preview?.monthly?.admission ?? null;
  const needsPromise = promiseNeeded(reach);
  // Prefill the promise with the first lesson the money does not reach,
  // until the cashier picks a date themselves.
  useEffect(() => {
    if (!promiseTouched) setPromiseDate(reach ? promiseDefault(reach) ?? "" : "");
  }, [reach, promiseTouched]);
```

- in the `/payments` POST body add `...(needsPromise && promiseDate && { promiseDate }),`;
- `resetForm` also runs `setPromiseDate(""); setPromiseTouched(false);`;
- right after the `PaymentPreviewCard` block render:

```tsx
          {reach && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
              {reachLines(reach).map((line) => (
                <p key={line}>{line}</p>
              ))}
              {needsPromise && (
                <div className="space-y-1">
                  <Label htmlFor="promise-date" className="text-xs">
                    Qolgan qismi qachon to&apos;lanadi?
                  </Label>
                  <Input
                    id="promise-date"
                    type="date"
                    value={promiseDate}
                    onChange={(e) => {
                      setPromiseTouched(true);
                      setPromiseDate(e.target.value);
                    }}
                    className="h-8 w-44 text-xs"
                  />
                  <p className="text-muted-foreground">
                    To&apos;lov va&apos;dasi. To&apos;lovsiz muddat cho&apos;zilmaydi.
                  </p>
                </div>
              )}
            </div>
          )}
```

- the submit button's `disabled` gains `|| (needsPromise && !promiseDate)`.

- [ ] **Step 5: Run tests, lint, types, commit**

Run: `cd client && npx vitest run src/components/payments && npx eslint src/components/payments && npx tsc --noEmit -p . 2>&1 | head -5`
Expected: PASS, clean.

```bash
git add client/src/components/payments
git commit -m "feat(client): the payment dialog shows a part payment's reach

For a monthly student it says how far the amount reaches this month and
what the next lesson still needs; a payment that leaves a debt asks when
the rest will be paid (prefilled with the first unpaid lesson) and sends
it as the promise.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ADR, docs, full verification

**Files:**
- Create: `docs/adr/0045-davomat-oynasi-va-tolovsiz-oquvchi.md`
- Modify: `docs/adr/README.md` (row 0045)
- Modify: `server/CLAUDE.md` (Attendance section)
- Modify: `docs/superpowers/specs/2026-09-27-davomat-va-tolov-tartibi-design.md` (script line)

- [ ] **Step 1: Write ADR-0045 (Uzbek)**

```markdown
# ADR-0045 — Davomat dars tugashi bilan yopiladi; to'lov qilmagan o'quvchi 2-darsdan puli yetgan darslargacha qatnashadi

**Holati:** Qabul qilindi
**Sana:** 2026-09-27
**Bog'liq:** shartnomaning 3.2, 5.1-bandlari; ADR-0042 (2-dars eslatmasi), ADR-0044 (40% qoidasi); `server/src/attendance/shared/lesson-window.ts`, `server/src/billing/lesson-admission.ts`, `server/src/billing/lesson-admission.service.ts`

## Kontekst

Davomat vaqti faqat bugungi sana uchun tekshirilardi, administrator, filial
direktori va CEO esa vaqtdan butunlay ozod edi. Sentabrda davomatning sezilarli qismi dars
tugagandan keyin kiritilgan (asosan administrator, ba'zan ertasi kuni),
administratorlar tugagan darslarni tuzatgan, ayrim darslar umuman davomatsiz
qolgan.
«Davomat olinmagan darslar» ro'yxati eski darsga kiritishga undardi, dars
oxiridagi xabarlar «tiklang» derdi.

Oylik hisobda qarzdorning har belgilangan darsi ustozga yozilardi (oy hisobi
tranzaksiyasi qoplama sifatida o'tadi) — o'quvchi hech qachon to'lamasa ham.
Markaz to'lanmagan hamma darsni jimgina qoplardi. Shartnomaning 3.2-bandi esa
oyning 1-darsidan keyin qarzdorni darsga qo'ymaydi.

## Qaror

1. **Davomat oynasi** — dars boshlanishidan 10 daqiqa oldin ochiladi, dars
   tugashi bilan yopiladi (Toshkent vaqti, ko'chirilgan darsning o'z
   vaqtlari). Hamma rol uchun bir xil: ustoz bir marta oladi, administrator
   (filial direktori, CEO) oyna ichida oladi va tuzatadi. Oynadan tashqarida
   saqlash, QR sessiya va skan, oldindan belgilash rad etiladi. Yagona
   istisno — `allowClosedLesson`, uni faqat CEO buyrug'i bilan ishlatiladigan
   dastur beradi; saytdagi hech bir yo'l bermaydi.
2. **Darsga qo'yish (1.10.2026 dan, oylik kurs).** O'quvchining oydagi 1-darsi
   — to'lovsiz. 2-darsdan boshlab o'quvchi D kuni darsga qo'yiladi, agar
   `balans + oyning D dan keyingi darslari qiymati ≥ 0` bo'lsa (qiymat —
   `departureRelease` bilan bir xil: chegirmali, muzlatilganlari chiqarilgan,
   hisob bilan cheklangan). Ya'ni bugungacha bo'lgan darslar va eski qarz
   to'langan. To'lov va'dasi hech kimni darsga qo'ymaydi; to'lovsiz muddat
   cho'zilmaydi.
3. **Qo'yilmagan o'quvchi** ro'yxatda qoladi, lekin «Keldi», «Kelmadi»,
   «Kechikdi» rad etiladi; «Sababli» (oldindan xabar) mumkin; umuman
   belgilanmasligi mumkin — to'liq ro'yxat talabi uni o'tkazib yuboradi.
   O'zgarmagan belgi qayta tekshirilmaydi.
4. **Ustoz haqi.** Qo'yilmagan dars qatori yo'q — haq yozilmaydi, o'quvchi
   keyin to'lasa ham. 2-darsdan qo'yilgan har dars puli to'langan.
   Qarzdorning 1-darsi — markaz qoplaydi (avvalgidek).
5. **Qisman to'lov.** To'lov oynasi summa qaysi darsgacha yetishini va
   keyingi darsga yana qancha kerakligini ko'rsatadi; qarz qolsa, qolgan
   qismi uchun va'da sanasi so'raladi va to'lovdan keyin ochiq va'da
   yoziladi. Va'da yozilmasa ham to'lov saqlanadi.
6. **Xabarlar.** Dars tugashidan 30 daqiqa oldin ustozga «olinmasa haq
   yozilmaydi», administratorga «siz olsangiz ustoz haqi saqlanadi»; dars
   oxirida ikkalasiga «olinmadi, endi saytda kiritib bo'lmaydi».

**Taqiqlanadi:** biror rolni oynadan ozod qilish; to'lov va'dasi bilan darsga
qo'yish; qo'yish qoidasini `lessonAdmission` dan boshqa joyda hisoblash.

## Ko'rib chiqilgan muqobillar

- **Dars tugagach o'sha kuni tuzatish**. CEO rad etdi:
  dars tugashi bilan hammasi yopiladi.
- **Dars tugagach 15 daqiqa qo'shimcha vaqt** (kechikib kiritilganlarning bir
  qismi shu ichida). Qoida «dars tugaguncha» deydi; 30 daqiqa oldingi eslatma bor.
- **Va'da bilan darsga qo'yish (muddat uzaytirish).** CEO rad etdi: to'lovsiz
  hech narsa yo'q, faqat qisman to'lov qolgan qismi uchun va'da bilan.
- **Qarzdorni balans < 0 bo'yicha to'sish.** Qisman to'lagan o'quvchini
  to'lagan darslariga ham qo'ymasdi.

## Oqibatlari

**Yutuq:** ustoz davomatni dars ichida oladi; markaz to'lanmagan darslarni
qoplamaydi (1-darsdan tashqari); administrator o'quvchiga aniq summa aytadi.

**Narx:** dars tugagach aniqlangan xato faqat CEO buyrug'i bilan tuzatiladi;
administrator yangi o'quvchini dars ichida ro'yxatga qo'shishi kerak;
1-oktabrdan 2-darsgacha to'lamaganlar darsga kirmaydi (A5 eslatmasi bir kun
oldin boradi).
```

- [ ] **Step 2: README row, docs, spec**

`docs/adr/README.md`, after the 0044 row:

```markdown
| [0045](0045-davomat-oynasi-va-tolovsiz-oquvchi.md) | Davomat dars tugashi bilan yopiladi; to'lov qilmagan o'quvchi 2-darsdan puli yetgan darslargacha qatnashadi | Qabul qilindi | 2026-09-27 |
```

`server/CLAUDE.md`: in «Date & Time Validation», replace item 7 (the three «Lesson time check» bullets) with:

```markdown
7. **The lesson window is NOT here.** `validateLessonDate` returns the effective `startTime`/`endTime` (a reschedule's override wins); the clock lives in `assertWindowOpen` / `assertLessonNotEnded` / `windowFor` (ADR-0045).

#### Lesson window (ADR-0045)

- `lessonWindowState` (`src/attendance/shared/lesson-window.ts`): `[start − 10 min, end]` Tashkent time. **Every role** — Teacher, Administrator, Branch Director, CEO — is bound: `save`, QR `startSession` and `scanQr` call `assertWindowOpen`; pre-marks call `assertLessonNotEnded`. Past and future dates are therefore closed to everyone. The only bypass is `SaveAttendanceOptions.allowClosedLesson`, reserved for a script run on the CEO's order — no HTTP route passes it.
- `GET /attendance/:groupId/date/:date` returns `window` (state + effective times) so the client (`client/src/lib/lesson-window.ts`, a mirror) locks the form at the end.

#### Admission (contract 3.2, ADR-0045)

- `lessonAdmission` (`src/billing/lesson-admission.ts`), loaded by `LessonAdmissionService`: from 2026-10-01, a student's first lesson of the month in a group is free; from the 2nd they are admitted iff `balance + heldAfter(month charges, day) ≥ 0` (`heldAfter` = `departureRelease` summed over the student's CHARGED charges on ACTIVE enrollments). A payment promise never admits.
- The roster returns `admission` per student. `save` refuses PRESENT/LATE/ABSENT for a blocked student (EXCUSED allowed, unchanged mark not re-judged) and the full-roster check skips them; `scanQr` refuses them.
- `GET /payments/preview` → `monthly.admission` (`paymentReach`); `POST /payments` with `promiseDate` upserts the OPEN promise when the payment leaves a debt (failure never undoes the payment).
```

In the «Full-Roster Requirement» bullets add: `- A student \`lessonAdmission\` blocks (contract 3.2) is not required; see «Admission» above.`

Spec: in Part 1 «Server», replace the line `- CLI \`scripts/attendance-closed-lesson.ts\` (dry run by default).` with `- \`SaveAttendanceOptions.allowClosedLesson\` (the script that uses it is written on the CEO's first correction order: booting the app from a script also starts its crons).`

- [ ] **Step 3: Full verification**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/davomat-tartibi/server && npm run typecheck && npx eslint src --max-warnings=0 2>&1 | tail -3 && npx jest --runInBand 2>&1 | tail -6
cd /Users/a1111/Desktop/daf-erp-system/.worktrees/davomat-tartibi/client && npx tsc --noEmit -p . && npx eslint src 2>&1 | tail -3 && npx vitest run 2>&1 | tail -6 && npm run build 2>&1 | tail -5
```

Expected: typecheck clean, lint 0 errors, every server suite and client test passes, client build succeeds. If lint reports only pre-existing warnings, compare against `origin/main` before touching them.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0045-davomat-oynasi-va-tolovsiz-oquvchi.md docs/adr/README.md server/CLAUDE.md docs/superpowers/specs/2026-09-27-davomat-va-tolov-tartibi-design.md
git commit -m "docs: ADR-0045 — the lesson window and contract 3.2 admission

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the plan

Push, PR and deploy only with the CEO's explicit permission. Deploy order: server first (the roster and preview gain fields; an old client keeps working and gets a clear 400 outside the window), then the client and the 5 domains. Must be live before the first October 2nd lesson (03.10 for Tue/Thu/Sat groups).
