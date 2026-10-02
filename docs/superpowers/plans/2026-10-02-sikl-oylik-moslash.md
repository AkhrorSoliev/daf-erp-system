# Sikl → oy (Darslar, Qarzdorlar, qarz kechirish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop cutting MONTHLY enrollments into 12-lesson «sikl» blocks on the «Darslar» tab, the «Qarzdorlar» panel and the debt write-off, keeping pack-era data as it is.

**Architecture:** One rule decides the era: an enrollment is in the monthly era from the month of its first `EnrollmentMonthlyCharge` row. «Darslar» groups monthly-era lessons by month (capacity = the month's CHARGED `coveredLessons`). «Qarzdorlar» in a MONTHLY group shows how far the debtor's money reaches into the month, computed by a new pure `monthReach` in `lesson-admission.ts` (ADR-0047's single place). Write-off refuses monthly-era enrollments, and the profile's write-off section lists nothing while forgiveness is switched off.

**Tech Stack:** NestJS + Prisma + Jest (`server/`), Next.js + React Query + Vitest (`client/`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-02-sikl-oylik-moslash-design.md`; decision: `docs/adr/0062-oylik-yozilish-sikl-emas-oy.md`.
- LESSON_PACK behaviour unchanged for pack-era data (lessons before the first monthly charge, enrollments without monthly charges, LESSON_PACK groups).
- UI text: Latin-script Uzbek, no English words. Approved texts (verbatim): «Shu oy»; «Oktabr: 13 darsdan 5 tasi to'langan (12.10 gacha)»; «Oktabr: to'lanmagan»; «Bu o'quvchilar oylik to'lovni to'liq to'lamagan. «Shu oy» ustuni to'lov oyning nechta darsiga yetishini ko'rsatadi.»
- Never run prettier on `client/`. Server: `npx prettier --write` on every touched `.ts`.
- Commit messages and new code comments in English; ADR and spec in Uzbek. Existing comments untouched.
- No push, PR, merge or deploy without the user's OK. Never touch the production database.
- Deploy order when shipped: client first, then server.
- Server commands run from `server/`, client commands from `client/`.

---

### Task 0: Decision record

**Files:**
- Create: `docs/adr/0062-oylik-yozilish-sikl-emas-oy.md`
- Create: `docs/superpowers/specs/2026-10-02-sikl-oylik-moslash-design.md`
- Create: `docs/superpowers/plans/2026-10-02-sikl-oylik-moslash.md`
- Modify: `docs/adr/README.md` (index row for 0062)

- [ ] **Step 1: Check the ADR number is free**

Run: `git log --all --oneline -- 'docs/adr/0062-*'` (repo root)
Expected: no output (0057–0061 are taken by open branches).

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0062-oylik-yozilish-sikl-emas-oy.md docs/adr/README.md docs/superpowers/specs/2026-10-02-sikl-oylik-moslash-design.md docs/superpowers/plans/2026-10-02-sikl-oylik-moslash.md
git commit -m "docs: ADR-0062 — a monthly enrollment is not cut into 12-lesson cycles"
```

---

### Task 1: `monthReach` — how far payments reach into a group's month

**Files:**
- Modify: `server/src/billing/lesson-admission.ts` (after `lessonAdmission`)
- Test: `server/src/billing/lesson-admission.spec.ts`

**Interfaces:**
- Produces: `export interface MonthReach { lessons: number; paid: number; paidThrough: string | null }` and `export function monthReach(input: { groupId: string; balance: number; charges: readonly AdmissionCharge[]; laterCharges?: readonly AdmissionCharge[] }): MonthReach | null`.

- [ ] **Step 1: Write the failing tests** — add `monthReach` to the spec's import list and append:

```ts
describe('monthReach', () => {
  const reach = (
    balance: number,
    charges: AdmissionCharge[] = [g005],
    laterCharges: AdmissionCharge[] = [],
  ) => monthReach({ groupId: 'g005', balance, charges, laterCharges });

  it('is null with no charge in the group this month', () => {
    expect(reach(-450000, [{ ...g005, groupId: 'g006' }])).toBeNull();
  });

  it('reaches no lesson when nothing of the month is paid', () => {
    expect(reach(-450000)).toEqual({ lessons: 13, paid: 0, paidThrough: null });
  });

  it('counts the run of lessons a part payment reaches', () => {
    // 200 000 of 450 000 paid: lessons 6–13 still hold 8 × 34 615 = 276 920.
    expect(reach(-250000)).toEqual({
      lessons: 13,
      paid: 5,
      paidThrough: '2026-10-12',
    });
  });

  it('agrees with lessonAdmission on the last lesson the money reaches', () => {
    expect(admit(-250000, '2026-10-12')).toMatchObject({
      admitted: true,
      paidThrough: '2026-10-12',
    });
    expect(admit(-250000, '2026-10-14')).toMatchObject({ admitted: false });
  });

  it("counts a later month's charge as still held", () => {
    const nov = { ...g005, coveredDates: [], coveredLessons: 12 };
    expect(reach(-450000, [g005], [nov])).toEqual({
      lessons: 13,
      paid: 13,
      paidThrough: '2026-10-30',
    });
  });

  it('leaves frozen-out lessons out', () => {
    const frozen = { ...g005, frozenOutDates: OCT.slice(10) };
    expect(reach(0, [frozen])).toEqual({
      lessons: 10,
      paid: 10,
      paidThrough: '2026-10-23',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/billing/lesson-admission.spec.ts`
Expected: FAIL — `monthReach` is not exported.

- [ ] **Step 3: Implement** — after `lessonAdmission` in `lesson-admission.ts`:

```ts
/** How far the payments reach into one group's month (ADR-0062). */
export interface MonthReach {
  /** The student's lessons this month in the group, frozen-out ones excluded. */
  lessons: number;
  /** How many of them, from the first, the payments reach. */
  paid: number;
  /** The last lesson paid; null when not even the first. */
  paidThrough: string | null;
}

/**
 * The «Qarzdorlar» panel's «Shu oy» (ADR-0062): the reach `lessonAdmission`
 * judges a lesson by — `balance + heldLater + heldAfter(day) ≥ 0` — walked
 * over the month's lessons. Money only: the first lesson's contract-3.2 pass
 * is admission, not payment. The reach falls day by day, so the paid lessons
 * are a run from the first. Null: no charge in this group for the month.
 */
export function monthReach(input: {
  groupId: string;
  balance: number;
  /** The month's charges. */
  charges: readonly AdmissionCharge[];
  /** Later months' charges, still held for this month (as in `lessonAdmission`). */
  laterCharges?: readonly AdmissionCharge[];
}): MonthReach | null {
  const lessons = groupLessons(input.charges, input.groupId);
  if (lessons.length === 0) return null;
  const later = heldLater(input.laterCharges ?? []);
  let paid = 0;
  for (const day of lessons) {
    if (input.balance + later + heldAfter(input.charges, day) < 0) break;
    paid += 1;
  }
  return {
    lessons: lessons.length,
    paid,
    paidThrough: paid > 0 ? lessons[paid - 1] : null,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/billing/lesson-admission.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/billing/lesson-admission.ts src/billing/lesson-admission.spec.ts
git add src/billing/lesson-admission.ts src/billing/lesson-admission.spec.ts
git commit -m "feat(billing): monthReach — how far payments reach into a group's month"
```

---

### Task 2: «Qarzdorlar» server side — `monthCoverage` for a MONTHLY group

**Files:**
- Modify: `server/src/billing/lesson-admission.service.ts` (new public method)
- Modify: `server/src/attendance/attendance-read.service.ts:583-800` (`getByDate`)
- Modify: `server/src/attendance/attendance.service.ts:41-76` (`getByDate` facade)
- Test: `server/src/billing/lesson-admission.service.spec.ts`, `server/src/attendance/attendance.service.spec.ts`

**Interfaces:**
- Consumes: `monthReach`, `MonthReach` (Task 1).
- Produces: `LessonAdmissionService.monthCoverage(params: { groupId: string; lessonDay: string; studentIds: number[] }, client?: Reader): Promise<Map<number, MonthReach>>` (student missing = no charge in the group that month). `GET /attendance/:groupId/date/:date` gains top-level `paymentModel: 'MONTHLY' | 'LESSON_PACK'`; in a MONTHLY group each `debtorStudents[]` row gains `monthCoverage: MonthReach | null` and its `currentCycle` is `null`.

- [ ] **Step 1: Write the failing service test** (`lesson-admission.service.spec.ts`, inside the describe):

```ts
  it("measures how far each debtor's payments reach into the month, whatever the rule switch (ADR-0062)", async () => {
    settings.get.mockResolvedValue(false);
    prisma.student.findMany.mockResolvedValue([
      { id: 1, balance: -300000 },
      { id: 2, balance: -100000 },
      { id: 3, balance: -50000 },
    ]);
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
      chargeRow(1),
      chargeRow(2),
    ]);

    const result = await service.monthCoverage({
      groupId: 'g005',
      lessonDay: '2026-10-05',
      studentIds: [1, 2, 3],
    });

    expect(result.get(1)).toEqual({ lessons: 3, paid: 0, paidThrough: null });
    expect(result.get(2)).toEqual({
      lessons: 3,
      paid: 2,
      paidThrough: '2026-10-05',
    });
    expect(result.has(3)).toBe(false); // no charge this month
    expect(settings.get).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Write the failing facade tests** (`attendance.service.spec.ts`): change the mock type and default to

```ts
  let admission: { forLesson: jest.Mock; monthCoverage: jest.Mock };
```
```ts
    admission = {
      forLesson: jest.fn().mockResolvedValue(new Map()),
      monthCoverage: jest.fn().mockResolvedValue(new Map()),
    };
```
and append inside `describe('getByDate', …)`:

```ts
    describe('debtors (ADR-0062)', () => {
      const debtor = {
        ...mockEnrollments[0],
        id: 'enr-1',
        student: { ...mockEnrollments[0].student, balance: -250000 },
      };

      beforeEach(() => {
        prisma.attendance.findMany.mockResolvedValue([]);
        prisma.enrollment.findMany.mockResolvedValue([
          debtor,
          mockEnrollments[1],
        ]);
      });

      it("a monthly group shows how far each debtor's money reaches into the month", async () => {
        prisma.group.findFirst.mockResolvedValue({
          ...mockGroup,
          course: { ...mockGroup.course, paymentModel: 'MONTHLY' },
        });
        admission.monthCoverage.mockResolvedValue(
          new Map([[10001, { lessons: 13, paid: 5, paidThrough: '2026-10-12' }]]),
        );

        const result = await service.getByDate('group-uuid-1', '2026-04-01', 1, [
          'Administrator',
        ]);

        expect(result.paymentModel).toBe('MONTHLY');
        expect(admission.monthCoverage).toHaveBeenCalledWith({
          groupId: 'group-uuid-1',
          lessonDay: '2026-04-01',
          studentIds: [10001],
        });
        expect(result.debtorStudents).toEqual([
          expect.objectContaining({
            studentId: 10001,
            currentCycle: null,
            monthCoverage: { lessons: 13, paid: 5, paidThrough: '2026-10-12' },
          }),
        ]);
      });

      it('a monthly debtor with no charge for the month reads null', async () => {
        prisma.group.findFirst.mockResolvedValue({
          ...mockGroup,
          course: { ...mockGroup.course, paymentModel: 'MONTHLY' },
        });

        const result = await service.getByDate('group-uuid-1', '2026-04-01', 1, [
          'Administrator',
        ]);

        expect(result.debtorStudents[0].monthCoverage).toBeNull();
      });

      it('a pack group keeps the cycle and never asks for month coverage', async () => {
        prisma.group.findFirst.mockResolvedValue({
          ...mockGroup,
          course: { ...mockGroup.course, paymentModel: 'LESSON_PACK' },
        });
        prisma.transaction = { findMany: jest.fn().mockResolvedValue([]) };

        const result = await service.getByDate('group-uuid-1', '2026-04-01', 1, [
          'Administrator',
        ]);

        expect(result.paymentModel).toBe('LESSON_PACK');
        expect(admission.monthCoverage).not.toHaveBeenCalled();
        expect(prisma.transaction.findMany).toHaveBeenCalled();
        expect(result.debtorStudents[0]).not.toHaveProperty('monthCoverage');
      });
    });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx jest src/billing/lesson-admission.service.spec.ts src/attendance/attendance.service.spec.ts`
Expected: FAIL — `monthCoverage` is not a function / `paymentModel` undefined.

- [ ] **Step 4: Implement `monthCoverage`** — in `lesson-admission.service.ts` add `monthReach, type MonthReach` to the `./lesson-admission` import and, after `forLesson`:

```ts
  /**
   * «Qarzdorlar» (ADR-0062): how far each student's payments reach into the
   * group's month of `lessonDay`. A money fact, so neither the 01.10 start
   * nor `payment.admissionRuleEnabled` gates it. A student missing from the
   * map has no charge in the group that month.
   */
  async monthCoverage(
    params: { groupId: string; lessonDay: string; studentIds: number[] },
    client: Reader = this.prisma,
  ): Promise<Map<number, MonthReach>> {
    const result = new Map<number, MonthReach>();
    if (params.studentIds.length === 0) return result;
    const [year, month] = params.lessonDay.split('-').map(Number);
    const [students, charges] = await Promise.all([
      client.student.findMany({
        where: { id: { in: params.studentIds } },
        select: { id: true, balance: true },
      }),
      this.loadCharges(client, params.studentIds, year, month, true),
    ]);
    const inMonth = (c: { periodYear: number; periodMonth: number }) =>
      c.periodYear === year && c.periodMonth === month;
    for (const student of students) {
      const own = charges.filter((c) => c.studentId === student.id);
      const reach = monthReach({
        groupId: params.groupId,
        balance: student.balance,
        charges: own.filter(inMonth),
        laterCharges: own.filter((c) => !inMonth(c)),
      });
      if (reach) result.set(student.id, reach);
    }
    return result;
  }
```

- [ ] **Step 5: Implement the read side** — in `attendance-read.service.ts` add `PaymentModel` to the `@prisma/client` import; in `getByDate` select `course: { select: { price: true, lessonPaymentCount: true, paymentModel: true } }`; guard the cycle read and return the model:

```ts
    // A monthly group's debtors get «Shu oy» from the facade instead
    // (ADR-0062): its charge rows never open a cycle, so the cycle read would
    // only find a stale pack from before the switch.
    const monthly = group.course.paymentModel === PaymentModel.MONTHLY;
    if (debtorBase.length > 0 && !monthly) {
```
and in the returned object, after `coursePrice: group.course.price,`:

```ts
      paymentModel: group.course.paymentModel,
```

- [ ] **Step 6: Implement the facade** — in `attendance.service.ts` add `import { PaymentModel } from '@prisma/client';` and replace the `Promise.all` and return of `getByDate`:

```ts
    const [opensMinutesBefore, admission, monthReach] = await Promise.all([
      this.validation.opensMinutesBefore(companyId),
      this.admission.forLesson({
        groupId,
        lessonDay: date,
        studentIds: roster.activeStudents.map((s) => s.studentId),
      }),
      // A monthly group's debtors: how far their money reaches into the
      // register's month (ADR-0062).
      roster.paymentModel === PaymentModel.MONTHLY
        ? this.admission.monthCoverage({
            groupId,
            lessonDay: date,
            studentIds: roster.debtorStudents.map((s) => s.studentId),
          })
        : Promise.resolve(null),
    ]);
    // After the lesson a student the register left out stays out, paid or
    // not — as `save()` judges it.
    const leftOut = new Set(leftOutStudentIds);
    return {
      ...roster,
      opensMinutesBefore,
      activeStudents: roster.activeStudents.map((s) => ({
        ...s,
        admission: leftOut.has(s.studentId)
          ? LEFT_OUT
          : (admission.get(s.studentId) ?? ADMITTED_WITHOUT_RULE),
      })),
      debtorStudents: monthReach
        ? roster.debtorStudents.map((s) => ({
            ...s,
            monthCoverage: monthReach.get(s.studentId) ?? null,
          }))
        : roster.debtorStudents,
    };
```

- [ ] **Step 7: Run to verify they pass**

Run: `npx jest src/billing/lesson-admission.service.spec.ts src/attendance/attendance.service.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/billing/lesson-admission.service.ts src/billing/lesson-admission.service.spec.ts src/attendance/attendance-read.service.ts src/attendance/attendance.service.ts src/attendance/attendance.service.spec.ts
git add src/billing/lesson-admission.service.ts src/billing/lesson-admission.service.spec.ts src/attendance/attendance-read.service.ts src/attendance/attendance.service.ts src/attendance/attendance.service.spec.ts
git commit -m "feat(attendance): a monthly group's debtors show how far they paid into the month"
```

---

### Task 3: «Darslar» server side — month blocks from the first monthly charge

**Files:**
- Modify: `server/src/students/students-read.service.ts:506-692` (`getLessonsOverview`)
- Test: `server/src/students/students-read.service.spec.ts`

**Interfaces:**
- Produces: each group's `cycles[]` item is `{ kind: 'CYCLE' | 'MONTH'; cycleSequenceNumber: number | null; month: string | null; capacity: number | null; lessonCount; attended; firstDate; lastDate }`; each `lessons[]` item is `{ date; status; cycleSequenceNumber: number | null; month: string | null }`.

- [ ] **Step 1: Write the failing tests** — add `enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },` to the `prisma` mock and append inside `describe('getLessonsOverview', …)`:

```ts
    describe('monthly era (ADR-0062)', () => {
      const att = (
        date: string,
        status = 'PRESENT',
        cancellationId: string | null = null,
      ) => ({
        id: `att-${date}`,
        groupId: 'grp-1',
        date: new Date(`${date}T00:00:00.000Z`),
        status,
        cancellationId,
      });
      const charge = (periodMonth: number, coveredLessons: number, status = 'CHARGED') => ({
        enrollmentId: 'enr-1',
        periodYear: 2026,
        periodMonth,
        status,
        coveredLessons,
      });

      beforeEach(() => {
        prisma.student.findFirst.mockResolvedValue({ id: 10001 });
        prisma.enrollment.findMany.mockResolvedValue([
          {
            id: 'enr-1',
            status: 'ACTIVE',
            startDate: new Date('2026-05-01'),
            createdAt: new Date('2026-05-01'),
            group: {
              id: 'grp-1',
              name: '#014',
              course: { name: 'Standart', lessonPaymentCount: 12 },
            },
          },
        ]);
      });

      it('blocks lessons by month from the first monthly charge; earlier ones stay in cycles', async () => {
        prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
          charge(9, 13),
          charge(10, 13),
        ]);
        prisma.attendance.findMany.mockResolvedValue([
          att('2026-08-28'),
          att('2026-08-31'),
          att('2026-09-28'),
          att('2026-09-30', 'ABSENT'),
          att('2026-10-02', 'LATE'),
        ]);

        const g = (await service.getLessonsOverview(10001, 1001)).groups[0];

        expect(prisma.enrollmentMonthlyCharge.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { enrollmentId: { in: ['enr-1'] } } }),
        );
        expect(g.cycles).toEqual([
          {
            kind: 'CYCLE',
            cycleSequenceNumber: 1,
            month: null,
            capacity: 12,
            lessonCount: 2,
            attended: 2,
            firstDate: '2026-08-28',
            lastDate: '2026-08-31',
          },
          {
            kind: 'MONTH',
            cycleSequenceNumber: null,
            month: '2026-09',
            capacity: 13,
            lessonCount: 2,
            attended: 1,
            firstDate: '2026-09-28',
            lastDate: '2026-09-30',
          },
          {
            kind: 'MONTH',
            cycleSequenceNumber: null,
            month: '2026-10',
            capacity: 13,
            lessonCount: 1,
            attended: 1,
            firstDate: '2026-10-02',
            lastDate: '2026-10-02',
          },
        ]);
        expect(
          g.lessons.map((l) => [l.date, l.cycleSequenceNumber, l.month]),
        ).toEqual([
          ['2026-08-28', 1, null],
          ['2026-08-31', 1, null],
          ['2026-09-28', null, '2026-09'],
          ['2026-09-30', null, '2026-09'],
          ['2026-10-02', null, '2026-10'],
        ]);
      });

      it("leaves a month's cancelled lesson out of its block", async () => {
        prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([charge(10, 12)]);
        prisma.attendance.findMany.mockResolvedValue([
          att('2026-10-02'),
          att('2026-10-05', 'EXCUSED', 'canc-1'),
        ]);

        const g = (await service.getLessonsOverview(10001, 1001)).groups[0];

        expect(g.total).toBe(1);
        expect(g.cycles).toEqual([
          expect.objectContaining({
            kind: 'MONTH',
            month: '2026-10',
            capacity: 12,
            lessonCount: 1,
          }),
        ]);
      });

      it('a month whose charge was reversed has no capacity', async () => {
        prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
          charge(9, 13, 'REVERSED'),
        ]);
        prisma.attendance.findMany.mockResolvedValue([att('2026-09-30')]);

        const g = (await service.getLessonsOverview(10001, 1001)).groups[0];

        expect(g.cycles).toEqual([
          expect.objectContaining({ kind: 'MONTH', month: '2026-09', capacity: null }),
        ]);
      });

      it('without a monthly charge a cancelled lesson still counts, as before', async () => {
        prisma.attendance.findMany.mockResolvedValue([
          att('2026-08-28', 'EXCUSED', 'canc-1'),
        ]);

        const g = (await service.getLessonsOverview(10001, 1001)).groups[0];

        expect(g.total).toBe(1);
        expect(g.cycles).toEqual([
          expect.objectContaining({ kind: 'CYCLE', cycleSequenceNumber: 1 }),
        ]);
      });
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/students/students-read.service.spec.ts`
Expected: FAIL — no `kind`/`month` on blocks.

- [ ] **Step 3: Implement** — in `students-read.service.ts` add `MonthlyChargeStatus` to the `@prisma/client` import. In `getLessonsOverview`: add `cancellationId: true` to the attendance `select`; after the attendance query load the charges:

```ts
    // Monthly era (ADR-0062): from the month of an enrollment's first monthly
    // charge on, its lessons are grouped by month; earlier lessons keep the
    // pack-era cycles.
    const charges = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: { enrollmentId: { in: enrollments.map((e) => e.id) } },
      select: {
        enrollmentId: true,
        periodYear: true,
        periodMonth: true,
        status: true,
        coveredLessons: true,
      },
    });
```

and replace the body of `enrollments.map((e) => { … })` up to (not including) the `lastDate`/`sortKey` lines with:

```ts
      // lpc = kurs darslari soni (NEVER hardcoded 12) — sikl blok o'lchami.
      const lpc = e.group.course?.lessonPaymentCount || 12;
      const own = charges.filter((c) => c.enrollmentId === e.id);
      const monthOf = (c: { periodYear: number; periodMonth: number }) =>
        `${c.periodYear}-${String(c.periodMonth).padStart(2, '0')}`;
      const monthlyFrom =
        own.length > 0 ? own.map(monthOf).sort()[0] : null;
      // A month's capacity is what its live charge still covers (frozen-out,
      // cancelled and released days gone); no live charge, no capacity.
      const capacityByMonth = new Map(
        own
          .filter((c) => c.status === MonthlyChargeStatus.CHARGED)
          .map((c) => [monthOf(c), c.coveredLessons]),
      );

      const lessons: OverviewLesson[] = [];
      let packIndex = 0;
      for (const a of attendances) {
        if (a.groupId !== e.group.id) continue;
        const date = tashkentDateStr(a.date);
        const month = date.slice(0, 7);
        if (monthlyFrom !== null && month >= monthlyFrom) {
          // A cancelled day is not one of the month's lessons (ADR-0053).
          if (a.cancellationId) continue;
          lessons.push({ date, status: a.status, cycleSequenceNumber: null, month });
        } else {
          lessons.push({
            date,
            status: a.status,
            cycleSequenceNumber: Math.floor(packIndex / lpc) + 1,
            month: null,
          });
          packIndex += 1;
        }
      }

      const isAttended = (status: AttendanceStatus) =>
        status === AttendanceStatus.PRESENT || status === AttendanceStatus.LATE;
      const attended = lessons.filter((l) => isAttended(l.status)).length;

      // One block per pack cycle or month. Lessons are in date order and the
      // pack era comes first, so insertion order is chronological.
      const blocks = new Map<string, LessonBlock>();
      for (const l of lessons) {
        const key = l.month ?? `cycle-${l.cycleSequenceNumber}`;
        const existing = blocks.get(key);
        if (!existing) {
          blocks.set(key, {
            kind: l.month ? 'MONTH' : 'CYCLE',
            cycleSequenceNumber: l.cycleSequenceNumber,
            month: l.month,
            capacity: l.month ? (capacityByMonth.get(l.month) ?? null) : lpc,
            lessonCount: 1,
            attended: isAttended(l.status) ? 1 : 0,
            firstDate: l.date,
            lastDate: l.date,
          });
        } else {
          existing.lessonCount += 1;
          if (isAttended(l.status)) existing.attended += 1;
          existing.lastDate = l.date;
        }
      }
      const cycles = [...blocks.values()];
```

At module level (end of file) add:

```ts
/** One lesson on the «Darslar» tab. */
interface OverviewLesson {
  date: string;
  status: AttendanceStatus;
  /** Pack era: the lessonPaymentCount block; null in the monthly era. */
  cycleSequenceNumber: number | null;
  /** Monthly era (ADR-0062): 'YYYY-MM'; null in the pack era. */
  month: string | null;
}

/** A «Darslar» block: a pack-era cycle or a month (ADR-0062). */
interface LessonBlock {
  kind: 'CYCLE' | 'MONTH';
  cycleSequenceNumber: number | null;
  month: string | null;
  /** CYCLE: lessonPaymentCount. MONTH: the live charge's covered lessons, null without one. */
  capacity: number | null;
  lessonCount: number;
  attended: number;
  firstDate: string;
  lastDate: string;
}
```

Update the method's doc comment: monthly-era lessons are grouped by month (ADR-0062); `lessonPaymentCount` blocks only for the pack era.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest src/students/students-read.service.spec.ts`
Expected: PASS (old pack tests unchanged).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/students/students-read.service.ts src/students/students-read.service.spec.ts
git add src/students/students-read.service.ts src/students/students-read.service.spec.ts
git commit -m "feat(students): the Darslar tab groups a monthly enrollment's lessons by month"
```

---

### Task 4: Write-off refuses the monthly era; the profile section follows the switch

**Files:**
- Modify: `server/src/billing/debt-write-off.service.ts` (`computeEligibility`, `executeWriteOff`, reason type)
- Modify: `server/src/students/students-read.service.ts:451-504` (`getClosedEnrollments`, constructor)
- Modify: `client/src/components/students/debt-write-off-types.ts`
- Test: `server/src/billing/debt-write-off.service.spec.ts`, `server/src/students/students-read.service.spec.ts`, `client/src/components/students/debt-write-off-notice.test.ts`

**Interfaces:**
- Produces: `DebtWriteOffEligibilityReason` gains `'MONTHLY'` (server and client).

- [ ] **Step 1: Write the failing server tests** — `debt-write-off.service.spec.ts`: add `enrollmentMonthlyCharge: { findFirst: jest.fn().mockResolvedValue(null) },` to `buildClient()`; in the `computeEligibility` describe:

```ts
  it('returns MONTHLY for an enrollment in the monthly era, without reading a cycle (ADR-0062)', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -450_000 }),
    );
    client.enrollmentMonthlyCharge.findFirst.mockResolvedValue({ id: 'emc-1' });

    const result = await service.computeEligibility(ENROLLMENT_ID, COMPANY_ID);

    expect(result).toMatchObject({ eligible: false, reason: 'MONTHLY' });
    expect(result.details).toMatchObject({
      currentBalance: -450_000,
      totalDebtAmount: 450_000,
      suggestedWriteOff: 0,
      maxWriteOff: 0,
    });
    expect(client.enrollmentMonthlyCharge.findFirst).toHaveBeenCalledWith({
      where: { enrollmentId: ENROLLMENT_ID },
      select: { id: true },
    });
    expect(client.attendance.findMany).not.toHaveBeenCalled();
  });
```

in the `executeWriteOff` describe:

```ts
  it('refuses a monthly enrollment in words (ADR-0062)', async () => {
    client.enrollment.findFirst.mockResolvedValue(
      makeEnrollment({ balance: -450_000 }),
    );
    client.enrollmentMonthlyCharge.findFirst.mockResolvedValue({ id: 'emc-1' });

    await expect(
      service.executeWriteOff(
        {
          enrollmentId: ENROLLMENT_ID,
          companyId: COMPANY_ID,
          performedById: PERFORMER_ID,
          reason: "Yo'qolgan o'quvchi",
          confirmAmount: 450_000,
        },
        client,
      ),
    ).rejects.toThrow("Oylik to'lovdagi qarz hisobdan chiqarilmaydi");
    expect(transactionsService.recordDebtWriteOff).not.toHaveBeenCalled();
  });
```

`students-read.service.spec.ts`: add `let settings: { get: jest.Mock };`, in `beforeEach` `settings = { get: jest.fn().mockResolvedValue(false) };` and the provider `{ provide: SettingsService, useValue: settings }` (import `SettingsService` from `'../settings/settings.service'`); append:

```ts
  describe('getClosedEnrollments — write-off candidates (ADR-0062)', () => {
    beforeEach(() => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001 });
    });

    it('lists nothing while debt forgiveness is switched off', async () => {
      await expect(service.getClosedEnrollments(10001, 1001)).resolves.toEqual(
        [],
      );
      expect(settings.get).toHaveBeenCalledWith(
        1001,
        'payment.debtWriteOffEnabled',
      );
      expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    });

    it('lists only pack-era closed enrollments when it is on', async () => {
      settings.get.mockResolvedValue(true);

      await service.getClosedEnrollments(10001, 1001);

      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['DROPPED', 'FROZEN'] },
            monthlyCharges: { none: {} },
          }),
        }),
      );
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/billing/debt-write-off.service.spec.ts src/students/students-read.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the write-off rule** — in `debt-write-off.service.ts`, add `| 'MONTHLY'` to `DebtWriteOffEligibilityReason`; above the class:

```ts
const MONTHLY_REFUSAL =
  "Oylik to'lovdagi qarz hisobdan chiqarilmaydi — pul guruhdan chiqarishda tanlangan tartib bo'yicha hal bo'ladi";
```

in `computeEligibility`, right after `const balance = enrollment.student.balance;`:

```ts
    // ADR-0062: a monthly enrollment's money is settled by the departure
    // policy (contract 6.2, ADR-0044; trial lesson, ADR-0048) and debt is
    // never forgiven (CEO, 21.09.2026, answer 9). The cycle math below is
    // pack-era only — from 01.10 an unpaid student cannot even be marked
    // ABSENT after the month's first lesson (ADR-0047).
    const monthlyCharge = await client.enrollmentMonthlyCharge.findFirst({
      where: { enrollmentId: enrollment.id },
      select: { id: true },
    });
    if (monthlyCharge) {
      return {
        eligible: false,
        reason: 'MONTHLY',
        details: {
          studentId: enrollment.studentId,
          enrollmentId: enrollment.id,
          groupId: enrollment.groupId,
          currentBalance: balance,
          enrollmentStatus: enrollment.status,
          cycleNumber: 0,
          cycleStartIndex: 0,
          cyclePresentCount: 0,
          cycleLateCount: 0,
          cycleAbsentCount: 0,
          cycleExcusedCount: 0,
          lessonPaymentCount: enrollment.group.course.lessonPaymentCount || 12,
          perLessonCost: 0,
          theoreticalCycleDebt: 0,
          suggestedWriteOff: 0,
          attendedCost: 0,
          absentCost: 0,
          realDebtAmount: 0,
          totalDebtAmount: balance < 0 ? -balance : 0,
          maxWriteOff: 0,
        },
      };
    }
```

in `executeWriteOff` replace the not-eligible throw with:

```ts
      if (!eligibility.eligible) {
        throw new BadRequestException(
          eligibility.reason === 'MONTHLY'
            ? MONTHLY_REFUSAL
            : `Joriy siklda yo'qolgan o'quvchi sharti bajarilmadi: ${eligibility.reason}`,
        );
      }
```

- [ ] **Step 4: Implement the list rule** — in `students-read.service.ts` inject `private settings: SettingsService` (import from `'../settings/settings.service'`); in `getClosedEnrollments` after the student check:

```ts
    // ADR-0062: this list exists only for the write-off button. While
    // forgiveness is off (CEO, 21.09.2026, answer 9) the button leads nowhere,
    // and a monthly-era enrollment is never offered one.
    const writeOffEnabled = await this.settings.get(
      companyId,
      'payment.debtWriteOffEnabled',
    );
    if (!writeOffEnabled) return [];
```
and add `monthlyCharges: { none: {} },` to its enrollment `where`. Update the doc comment accordingly.

- [ ] **Step 5: Client reason copy** — `debt-write-off-types.ts`: add `| "MONTHLY"` to the union and to `bodyByReason`:

```ts
    MONTHLY:
      "Oylik to'lovdagi qarz hisobdan chiqarilmaydi — pul guruhdan chiqarishda tanlangan tartib bo'yicha hal bo'ladi.",
```
`debt-write-off-notice.test.ts`: add `"MONTHLY"` to `ALL_REASONS` and:

```ts
  it("MONTHLY matni oylik qarz guruhdan chiqarishda hal bo'lishini aytadi", () => {
    expect(writeOffNoticeCopy("MONTHLY").body).toContain(
      "guruhdan chiqarishda tanlangan tartib",
    );
  });
```

- [ ] **Step 6: Run to verify they pass**

Run (server): `npx jest src/billing/debt-write-off.service.spec.ts src/students/students-read.service.spec.ts src/students/student-enrollment.service.spec.ts`
Run (client): `npx vitest run src/components/students/debt-write-off-notice.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/billing/debt-write-off.service.ts src/billing/debt-write-off.service.spec.ts src/students/students-read.service.ts src/students/students-read.service.spec.ts
cd .. && git add server/src/billing/debt-write-off.service.ts server/src/billing/debt-write-off.service.spec.ts server/src/students/students-read.service.ts server/src/students/students-read.service.spec.ts client/src/components/students/debt-write-off-types.ts client/src/components/students/debt-write-off-notice.test.ts
git commit -m "feat(billing): no write-off for a monthly enrollment; the profile section follows the switch"
```

---

### Task 5: «Darslar» client — month titles

**Files:**
- Create: `client/src/components/students/lesson-trail-labels.ts`
- Modify: `client/src/components/students/lesson-trail-tab.tsx`
- Test: `client/src/components/students/lesson-trail-labels.test.ts`

**Interfaces:**
- Consumes: Task 3's block/lesson shape (`month` absent from an older server → cycle).
- Produces: `blockTitle(block: { cycleSequenceNumber: number | null; month?: string | null }, currentYear: string): string`, `blockCount(lessonCount: number, capacity: number | null): string`.

- [ ] **Step 1: Write the failing test** (`lesson-trail-labels.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { blockCount, blockTitle } from "./lesson-trail-labels";

describe("blockTitle", () => {
  it("names a month block by its month", () => {
    expect(blockTitle({ cycleSequenceNumber: null, month: "2026-10" }, "2026")).toBe("Oktabr");
  });

  it("adds the year to a month of another year", () => {
    expect(blockTitle({ cycleSequenceNumber: null, month: "2026-12" }, "2027")).toBe("Dekabr 2026");
  });

  it("keeps the pack-era cycle name", () => {
    expect(blockTitle({ cycleSequenceNumber: 3, month: null }, "2026")).toBe("3-sikl");
  });

  it("reads a block from an older server, with no month, as a cycle", () => {
    expect(blockTitle({ cycleSequenceNumber: 2 }, "2026")).toBe("2-sikl");
  });
});

describe("blockCount", () => {
  it("shows the share while the block is not full", () => {
    expect(blockCount(1, 13)).toBe("1/13 dars");
  });

  it("shows the count alone when full or when the size is unknown", () => {
    expect(blockCount(13, 13)).toBe("13 dars");
    expect(blockCount(5, null)).toBe("5 dars");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/students/lesson-trail-labels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`lesson-trail-labels.ts`):

```ts
import { MONTH_NAMES } from "@/components/groups/attendance/attendance-cycle-utils";

/**
 * A «Darslar» block's title: a month from the first monthly charge on
 * («Oktabr», another year «Dekabr 2026»), a pack-era cycle before it
 * («3-sikl»). A block without `month` (older server) is a cycle (ADR-0062).
 */
export function blockTitle(
  block: { cycleSequenceNumber: number | null; month?: string | null },
  currentYear: string,
): string {
  if (block.month) {
    const [year, month] = block.month.split("-");
    const name = MONTH_NAMES[Number(month)] ?? block.month;
    return year === currentYear ? name : `${name} ${year}`;
  }
  return `${block.cycleSequenceNumber}-sikl`;
}

/** "1/13 dars" while a block is not full; "13 dars" when full or of unknown size. */
export function blockCount(lessonCount: number, capacity: number | null): string {
  return capacity !== null && lessonCount < capacity
    ? `${lessonCount}/${capacity} dars`
    : `${lessonCount} dars`;
}
```

- [ ] **Step 4: Use it in `lesson-trail-tab.tsx`** — types:

```tsx
interface Cycle {
  /** Absent from an older server: a pack-era cycle. */
  kind?: "CYCLE" | "MONTH";
  cycleSequenceNumber: number | null;
  /** MONTH blocks (ADR-0062): 'YYYY-MM'. */
  month?: string | null;
  /** CYCLE: lessonPaymentCount; MONTH: the month's charged lessons; null when unknown. */
  capacity: number | null;
  lessonCount: number; // shu blokdagi haqiqiy darslar soni
  attended: number;
  firstDate: string;
  lastDate: string;
}

interface Lesson {
  date: string;
  status: DotStatus;
  cycleSequenceNumber: number | null;
  month?: string | null;
}
```

imports: `import { tashkentNow } from "@/lib/tashkent-time";` and `import { blockCount, blockTitle } from "./lesson-trail-labels";`. `cycleLabel` ends with `return \`${range} (${blockCount(c.lessonCount, c.capacity)})\`;` (drop the inline count). `LessonTimeline` takes `year` and marks block changes:

```tsx
function LessonTimeline({ lessons, year }: { lessons: Lesson[]; year: string }) {
  if (lessons.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Hali dars o&apos;tilmagan
      </p>
    );
  }
  // Chronological dots; a title wherever the block (cycle or month) changes.
  const items: ReactNode[] = [];
  let seenBlock: string | null = null;
  lessons.forEach((l, i) => {
    const block =
      l.month ?? (l.cycleSequenceNumber != null ? String(l.cycleSequenceNumber) : null);
    const title = block ? blockTitle(l, year) : null;
    if (block && block !== seenBlock) {
      seenBlock = block;
      items.push(
        <span
          key={`c-${i}`}
          className="ml-1.5 mr-0.5 text-[10px] font-medium text-muted-foreground first:ml-0"
        >
          {title}:
        </span>,
      );
    }
    items.push(
      <AttendanceDot
        key={`${l.date}-${i}`}
        status={l.status}
        date={l.date}
        cycleLabel={title}
      />,
    );
  });
  return <div className="flex flex-wrap items-center gap-1.5">{items}</div>;
}
```

In `GroupCard`: `const year = tashkentNow().dateStr.slice(0, 4);`, list item `key={c.month ?? \`sikl-${c.cycleSequenceNumber}\`}` with title `{blockTitle(c, year)}:`, and `<LessonTimeline lessons={group.lessons} year={year} />`.

- [ ] **Step 5: Verify**

Run: `npx vitest run src/components/students/lesson-trail-labels.test.ts && npx tsc --noEmit -p . && npx eslint src/components/students/lesson-trail-tab.tsx src/components/students/lesson-trail-labels.ts src/components/students/lesson-trail-labels.test.ts`
Expected: PASS, no type errors, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/students/lesson-trail-labels.ts client/src/components/students/lesson-trail-labels.test.ts client/src/components/students/lesson-trail-tab.tsx
git commit -m "feat(client): the Darslar tab names monthly blocks by month"
```

---

### Task 6: «Qarzdorlar» client — «Shu oy» column

**Files:**
- Modify: `client/src/components/groups/attendance/attendance-form-utils.ts`
- Modify: `client/src/components/groups/attendance/attendance-debtors-section.tsx`
- Modify: `client/src/components/groups/attendance/attendance-form.tsx`
- Test: `client/src/components/groups/attendance/attendance-form-utils.test.ts` (create)

**Interfaces:**
- Consumes: Task 2's `paymentModel` and `debtorStudents[].monthCoverage`.
- Produces: `DebtorMonthCoverage`, `monthCoverageText(month: string, coverage: DebtorMonthCoverage | null | undefined): string`; `AttendanceDebtorsSection` props `monthly: boolean`, `month: string`.

- [ ] **Step 1: Write the failing test** (`attendance-form-utils.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { monthCoverageText } from "./attendance-form-utils";

describe("monthCoverageText", () => {
  it("says how many of the month's lessons are paid, and through which day", () => {
    expect(
      monthCoverageText("2026-10", { lessons: 13, paid: 5, paidThrough: "2026-10-12" }),
    ).toBe("Oktabr: 13 darsdan 5 tasi to'langan (12.10 gacha)");
  });

  it("says unpaid when the money reaches no lesson", () => {
    expect(monthCoverageText("2026-10", { lessons: 13, paid: 0, paidThrough: null })).toBe(
      "Oktabr: to'lanmagan",
    );
  });

  it("says paid when it reaches them all", () => {
    expect(
      monthCoverageText("2026-09", { lessons: 13, paid: 13, paidThrough: "2026-09-30" }),
    ).toBe("Sentabr: to'langan");
  });

  it("says the bill is not written yet without a charge", () => {
    expect(monthCoverageText("2026-10", null)).toBe("Oktabr: hisob hali yozilmagan");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/groups/attendance/attendance-form-utils.test.ts`
Expected: FAIL — `monthCoverageText` not exported.

- [ ] **Step 3: Implement** — `attendance-form-utils.ts` (first check `attendance-cycle-utils.ts` does not import this file):

```ts
import { formatShortDate, MONTH_NAMES } from "./attendance-cycle-utils";
```
```ts
/** A monthly group's debtor (ADR-0062): how far their money reaches into the register's month. */
export interface DebtorMonthCoverage {
  /** The student's lessons this month in the group. */
  lessons: number;
  /** How many of them, from the first, are paid. */
  paid: number;
  /** The last paid lesson, 'YYYY-MM-DD'; null when none. */
  paidThrough: string | null;
}

/** The «Shu oy» cell of a monthly group's debtor (ADR-0062); `month` is 'YYYY-MM'. */
export function monthCoverageText(
  month: string,
  coverage: DebtorMonthCoverage | null | undefined,
): string {
  const name = MONTH_NAMES[Number(month.slice(5, 7))] ?? month;
  if (!coverage) return `${name}: hisob hali yozilmagan`;
  if (coverage.paid === 0) return `${name}: to'lanmagan`;
  if (coverage.paid >= coverage.lessons) return `${name}: to'langan`;
  const through = coverage.paidThrough
    ? ` (${formatShortDate(coverage.paidThrough)} gacha)`
    : "";
  return `${name}: ${coverage.lessons} darsdan ${coverage.paid} tasi to'langan${through}`;
}
```
and in `DebtorStudent`:
```ts
  // Monthly group only (ADR-0062); null: no charge for the month yet.
  monthCoverage?: DebtorMonthCoverage | null;
```

- [ ] **Step 4: The panel** — `attendance-debtors-section.tsx`: import `monthCoverageText`; props:

```tsx
  /** A monthly group (ADR-0062): «Shu oy» instead of «Joriy sikl», no «Yetmaydi». */
  monthly: boolean;
  /** The register's month, 'YYYY-MM' — the month «Shu oy» describes. */
  month: string;
```
description:
```tsx
          <CardDescription className="text-amber-700/80 dark:text-amber-400/80">
            {monthly ? (
              <>
                Bu o&apos;quvchilar oylik to&apos;lovni to&apos;liq
                to&apos;lamagan. «Shu oy» ustuni to&apos;lov oyning nechta
                darsiga yetishini ko&apos;rsatadi.
              </>
            ) : (
              <>
                Bu o&apos;quvchilarning balansi manfiyga tushgan. Davomat
                olinishi davom etadi va har bir dars bahosi balansdan
                ushlanmoqda — to&apos;lov qabul qilingach, ustozning oyligiga
                ham hisoblanadi.
              </>
            )}
          </CardDescription>
```
head cells: `<TableHead>{monthly ? "Shu oy" : "Joriy sikl"}</TableHead>` and wrap the «Yetmaydi» head and its body cell in `{!monthly && (…)}`; the cycle cell becomes:
```tsx
                    <TableCell className="text-xs text-muted-foreground">
                      {monthly
                        ? monthCoverageText(month, d.monthCoverage)
                        : currentCycleText(d.currentCycle)}
                    </TableCell>
```

- [ ] **Step 5: The form** — `attendance-form.tsx`:
```tsx
  const [paymentModel, setPaymentModel] = useState<
    "MONTHLY" | "LESSON_PACK" | null
  >(null);
```
`setPaymentModel(data.paymentModel ?? null);` after `setCoursePrice(...)` in `fetchAttendance`, `setPaymentModel(null);` in its `catch`; the panel:
```tsx
        <AttendanceDebtorsSection
          debtors={debtorStudents}
          monthly={paymentModel === "MONTHLY"}
          month={date.slice(0, 7)}
          // A monthly group suggests each row's own debt (0 → debtAmount).
          suggestedAmount={paymentModel === "MONTHLY" ? 0 : coursePrice}
          onPaymentSuccess={refreshRows}
        />
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/components/groups/attendance && npx tsc --noEmit -p . && npx eslint src/components/groups/attendance/attendance-form-utils.ts src/components/groups/attendance/attendance-form-utils.test.ts src/components/groups/attendance/attendance-debtors-section.tsx src/components/groups/attendance/attendance-form.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/groups/attendance/attendance-form-utils.ts client/src/components/groups/attendance/attendance-form-utils.test.ts client/src/components/groups/attendance/attendance-debtors-section.tsx client/src/components/groups/attendance/attendance-form.tsx
git commit -m "feat(client): a monthly group's debtors panel shows the month's coverage"
```

---

### Task 7: Docs that describe the Darslar tab

**Files:**
- Modify: `client/CLAUDE.md:838-846` («"Darslar" tab» section)
- Modify: `server/CLAUDE.md:1290` (Lesson Trail paragraph's last sentence)

- [ ] **Step 1: Client doc** — replace the section's bullets with:

```markdown
- Component: `lesson-trail-tab.tsx`. Visible to CEO / BD / Administrator (`canManage`).
- Question it answers: **"Which lessons did the student attend, block by block?"** — attendance only; which payment covered which lesson is the «To'lovlar» tab's job.
- Reads `GET /students/:id/lessons-overview` (`?includeClosed=true` for the «Yopilgan guruhlarni ko'rsatish» toggle).
- Blocks (ADR-0062): from the month of an enrollment's first monthly charge on, one block per month («Oktabr: 02.10 (1/13 dars)», capacity = that month's charged lessons; a cancelled lesson is not shown); earlier lessons keep the pack-era `lessonPaymentCount` blocks («3-sikl»). Labels: `lesson-trail-labels.ts`.
```

- [ ] **Step 2: Server doc** — replace «Drives the "Darslar" tab (URL `?tab=darslar`) on the student profile.» with «No screen reads it now: the «Darslar» tab reads `GET /students/:id/lessons-overview` (`getLessonsOverview`: month blocks from the first monthly charge on, pack cycles before — ADR-0062).»

- [ ] **Step 3: Commit**

```bash
git add client/CLAUDE.md server/CLAUDE.md
git commit -m "docs: the Darslar tab reads lessons-overview and blocks monthly lessons by month"
```

---

### Task 8: Full verification

- [ ] **Step 1: Server** (from `server/`, one after another, not in parallel): `npx eslint src/billing src/attendance src/students --quiet`, `npm run typecheck`, `npm run build`, `npm test`. Expected: no lint errors, no type errors, build OK, all suites green.
- [ ] **Step 2: Client** (from `client/`): `npx tsc --noEmit -p .`, `npx eslint src/components/students src/components/groups/attendance`, `npx vitest run`, `npm run build`. Expected: green.
- [ ] **Step 3: Screens** — render the «Darslar» tab and the «Qarzdorlar» panel with sample data in the in-app browser and take screenshots for the CEO (never the production database).
