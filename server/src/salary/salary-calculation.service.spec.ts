import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SalaryCalculationService } from './salary-calculation.service';
import { SalaryAccrualService } from './salary-accrual.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Covers the period resolution (cron completed vs manual asOfDate), the
 * future-period guard, and the merge-idempotency of the accrual branch
 * (create / merge-into-CALCULATED / skip-closed) so a re-run never duplicates
 * or double-pays a SalaryPayment.
 */
describe('SalaryCalculationService', () => {
  let service: SalaryCalculationService;
  let accrualService: SalaryAccrualService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      salaryPayment: {
        findFirst: jest.fn().mockResolvedValue(null), // no existing draft
        create: jest.fn().mockResolvedValue({ id: 'sp-new' }),
        update: jest.fn().mockResolvedValue({}),
      },
      salaryAccrual: {
        updateMany: jest.fn().mockResolvedValue({}),
        // Authoritative gross of the linked, non-reversed accruals.
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      expense: {
        // applyPendingAdvances: no pending advances by default.
        findMany: jest.fn().mockResolvedValue([]),
        // already-settled advances against this payment.
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    };

    prisma = {
      // null → default cycleStartDay (8) inside resolveCurrentPeriod.
      salaryPeriodSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      salaryAccrual: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salaryPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Only touched by the center top-up gap sweep (July 2026+).
      attendance: {
        findMany: jest.fn().mockResolvedValue([]),
        // BR-09 held-lesson count; default empty, top-up tests override it so
        // their student clears the new-student gate.
        groupBy: jest.fn().mockResolvedValue([]),
      },
      // Inactive-student list for the top-up cap; default none.
      student: { findMany: jest.fn().mockResolvedValue([]) },
      group: { findMany: jest.fn().mockResolvedValue([]) },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
      lessonTeacherOverride: { findMany: jest.fn().mockResolvedValue([]) },
      // BR-09b backlog scan (un-accrued top-up-era lessons); default none.
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryCalculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: SalaryAccrualService, useValue: { createAccrual: jest.fn() } },
      ],
    }).compile();

    service = module.get<SalaryCalculationService>(SalaryCalculationService);
    accrualService = module.get<SalaryAccrualService>(SalaryAccrualService);
  });

  const now = new Date('2026-06-20T08:00:00.000Z');
  // With default cycleStartDay=8, the period `now` is INSIDE is [Jun 8 → Jul 7].
  // Payroll must settle the COMPLETED one before it: [May 8 → Jun 7].
  const completedStart = new Date('2026-05-07T19:00:00.000Z'); // May 8 00:00 Tashkent
  const completedEnd = new Date('2026-06-07T18:59:59.999Z'); // Jun 8 00:00 Tashkent − 1ms
  // `lessonDate` is a `@db.Date` column: Postgres truncates a timestamp to its
  // UTC date when comparing, so the Tashkent-shifted bounds above pulled the
  // previous period's LAST day into this one (it counted in both). Date columns
  // therefore get unshifted calendar bounds with an EXCLUSIVE upper edge.
  const completedStartDate = new Date('2026-05-08T00:00:00.000Z');
  const completedEndDateExcl = new Date('2026-06-08T00:00:00.000Z');

  it('settles the COMPLETED period and sweeps by effective date (COALESCE(creditPeriodDate, lessonDate))', async () => {
    await service.calculateMonthlySalaries(1, { now });

    expect(prisma.salaryAccrual.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 1,
          salaryPaymentId: null,
          reversedAt: null,
          OR: [
            { creditPeriodDate: { gte: completedStart, lte: completedEnd } },
            {
              creditPeriodDate: null,
              lessonDate: {
                gte: completedStartDate,
                lt: completedEndDateExcl,
              },
            },
          ],
        }),
      }),
    );
  });

  it('manual asOfDate settles the period that date falls INSIDE (resolveCurrentPeriod, not completed)', async () => {
    // asOfDate 15.04 with cycleStartDay=8 → current period [Apr 8 → May 7],
    // distinct from the cron-completed [May 8 → Jun 7].
    const asOfDate = new Date('2026-04-15T00:00:00.000Z');
    const periodStart = new Date('2026-04-07T19:00:00.000Z'); // Apr 8 00:00 Tashkent
    const periodEnd = new Date('2026-05-07T18:59:59.999Z'); // May 8 00:00 Tashkent − 1ms
    const periodStartDate = new Date('2026-04-08T00:00:00.000Z');
    const periodEndDateExcl = new Date('2026-05-08T00:00:00.000Z');

    await service.calculateMonthlySalaries(1, { asOfDate, now });

    expect(prisma.salaryAccrual.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
            {
              creditPeriodDate: null,
              lessonDate: { gte: periodStartDate, lt: periodEndDateExcl },
            },
          ],
        }),
      }),
    );
  });

  it('refuses to settle a period that has not finished yet', async () => {
    // asOfDate in a future month → its periodEnd is after `now`.
    const asOfDate = new Date('2026-07-15T00:00:00.000Z'); // [Jul 8 → Aug 7]
    await expect(
      service.calculateMonthlySalaries(1, { asOfDate, now }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
  });

  describe('center top-up (Phase 0, July 2026+)', () => {
    // A completed JULY period (cycleStartDay=8 → [Jul 8 → Aug 7]); top-up month.
    const julyNow = new Date('2026-08-20T08:00:00.000Z');
    const julyAsOf = new Date('2026-07-15T00:00:00.000Z');

    it('fronts each uncovered billable lesson with a center-funded accrual', async () => {
      // One billable lesson, no covered accrual → a gap for teacher 10010.
      prisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-1',
          studentId: 100,
          groupId: 'g1',
          date: new Date('2026-07-10'),
        },
      ]);
      // Student 100 has cleared the BR-09 new-student gate (>= 4 attended).
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 100, groupId: 'g1', _count: { _all: 6 } },
      ]);
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
      ]);
      prisma.groupTeacher.findMany.mockResolvedValue([
        { groupId: 'g1', teacherId: 10010 },
      ]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          salaryType: 'PERCENTAGE',
          value: 30,
          effectiveFrom: new Date('2026-05-01'),
          effectiveTo: null,
          config: { userId: 10010, groupId: null, salaryType: 'PERCENTAGE' },
        },
      ]);

      await service.calculateMonthlySalaries(1, {
        asOfDate: julyAsOf,
        now: julyNow,
      });

      expect(accrualService.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: 10010,
          studentId: 100,
          groupId: 'g1',
          attendanceId: 'att-1',
          perLessonCost: 20_000,
          centerFunded: true,
        }),
      );
    });

    it('BR-09: withholds the center top-up for a new student below the lesson threshold', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        { id: 'att-1', studentId: 100, groupId: 'g1', date: new Date('2026-07-10') },
      ]);
      // Only 2 attended lessons → below the 4-lesson gate → no top-up yet.
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 100, groupId: 'g1', _count: { _all: 2 } },
      ]);
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
      ]);
      prisma.groupTeacher.findMany.mockResolvedValue([
        { groupId: 'g1', teacherId: 10010 },
      ]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          salaryType: 'PERCENTAGE',
          value: 30,
          effectiveFrom: new Date('2026-05-01'),
          effectiveTo: null,
          config: { userId: 10010, groupId: null, salaryType: 'PERCENTAGE' },
        },
      ]);

      await service.calculateMonthlySalaries(1, { asOfDate: julyAsOf, now: julyNow });

      expect(accrualService.createAccrual).not.toHaveBeenCalled();
    });

    it('the gap-sweep includes ABSENT (a held lesson earns the teacher)', async () => {
      await service.calculateMonthlySalaries(1, { asOfDate: julyAsOf, now: julyNow });

      const statusFilters = prisma.attendance.findMany.mock.calls.map(
        (c: any) => c[0]?.where?.status,
      );
      for (const s of statusFilters) {
        expect(s).toEqual({ in: ['PRESENT', 'LATE', 'ABSENT'] });
      }
      expect(statusFilters.length).toBeGreaterThan(0);
    });

    it('caps the top-up at a student who went inactive: no top-up after statusChangedAt', async () => {
      // Two July lessons: one before the freeze date, one after.
      prisma.attendance.findMany.mockResolvedValue([
        { id: 'before', studentId: 100, groupId: 'g1', date: new Date('2026-07-05') },
        { id: 'after', studentId: 100, groupId: 'g1', date: new Date('2026-07-20') },
      ]);
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 100, groupId: 'g1', _count: { _all: 6 } },
      ]);
      // Student 100 was frozen on 2026-07-10.
      prisma.student.findMany.mockResolvedValue([
        { id: 100, statusChangedAt: new Date('2026-07-10T09:00:00Z') },
      ]);
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
      ]);
      prisma.groupTeacher.findMany.mockResolvedValue([
        { groupId: 'g1', teacherId: 10010 },
      ]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          salaryType: 'PERCENTAGE',
          value: 30,
          effectiveFrom: new Date('2026-05-01'),
          effectiveTo: null,
          config: { userId: 10010, groupId: null, salaryType: 'PERCENTAGE' },
        },
      ]);

      await service.calculateMonthlySalaries(1, { asOfDate: julyAsOf, now: julyNow });

      const attIds = accrualService.createAccrual.mock.calls.map(
        (c: any) => c[0].attendanceId,
      );
      expect(attIds).toContain('before'); // up to the freeze date → fronted
      expect(attIds).not.toContain('after'); // after the freeze date → no top-up
    });

    it('skips a teacher whose payment for the period is already closed (APPROVED/PAID)', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-1',
          studentId: 100,
          groupId: 'g1',
          date: new Date('2026-07-10'),
        },
      ]);
      // Committed student → gap exists; the skip is due to the closed payment.
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 100, groupId: 'g1', _count: { _all: 6 } },
      ]);
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
      ]);
      prisma.groupTeacher.findMany.mockResolvedValue([
        { groupId: 'g1', teacherId: 10010 },
      ]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          salaryType: 'PERCENTAGE',
          value: 30,
          effectiveFrom: new Date('2026-05-01'),
          effectiveTo: null,
          config: { userId: 10010, groupId: null, salaryType: 'PERCENTAGE' },
        },
      ]);
      // 10010's July payment is already PAID → do not front dangling accruals.
      prisma.salaryPayment.findMany.mockResolvedValue([{ userId: 10010 }]);

      await service.calculateMonthlySalaries(1, {
        asOfDate: julyAsOf,
        now: julyNow,
      });

      expect(accrualService.createAccrual).not.toHaveBeenCalled();
    });

    it('BR-09b: backfills a withheld new-student lesson from a closed prior period into the current one', async () => {
      // Settle August [Aug 8 → Sep 7] (cycleStartDay=8). A July lesson sits in
      // the now-closed prior period; it was withheld while the student was below
      // the threshold and has no accrual yet.
      const augNow = new Date('2026-09-20T08:00:00.000Z');
      const augAsOf = new Date('2026-08-15T00:00:00.000Z');
      prisma.attendance.findMany.mockResolvedValue([]); // no in-period lessons
      // Student 100 has now crossed the threshold (>= 4 attended).
      prisma.attendance.groupBy.mockResolvedValue([
        { studentId: 100, groupId: 'g1', _count: { _all: 5 } },
      ]);
      // The backlog scan returns the un-accrued July lesson.
      prisma.$queryRaw.mockResolvedValue([
        { id: 'jul-att', studentId: 100, groupId: 'g1', date: new Date('2026-07-10') },
      ]);
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
      ]);
      prisma.groupTeacher.findMany.mockResolvedValue([
        { groupId: 'g1', teacherId: 10010 },
      ]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          salaryType: 'PERCENTAGE',
          value: 30,
          effectiveFrom: new Date('2026-05-01'),
          effectiveTo: null,
          config: { userId: 10010, groupId: null, salaryType: 'PERCENTAGE' },
        },
      ]);

      await service.calculateMonthlySalaries(1, { asOfDate: augAsOf, now: augNow });

      // The July lesson is fronted, credited to the current (August) period.
      expect(accrualService.createAccrual).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: 10010,
          studentId: 100,
          attendanceId: 'jul-att',
          centerFunded: true,
          creditPeriodDateOverride: expect.any(Date),
        }),
      );
    });

    it('does NOT run the gap sweep for a pre-July (covered-only) period', async () => {
      // Default `now` (2026-06-20) settles the completed May period.
      await service.calculateMonthlySalaries(1, { now });

      expect(accrualService.createAccrual).not.toHaveBeenCalled();
      expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    });
  });

  it('CREATES a fresh draft and links accruals when no payment exists for the period', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValueOnce([
      { id: 'normal-1', userId: 7, amount: 10_000 },
      { id: 'carried-1', userId: 7, amount: 15_000 },
    ]);
    tx.salaryAccrual.aggregate.mockResolvedValueOnce({
      _sum: { amount: 25_000 },
    });

    const result = await service.calculateMonthlySalaries(1, { now });

    // Created with amount 0; the authoritative net is written via update.
    expect(tx.salaryPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 7, amount: 0 }),
      }),
    );
    expect(tx.salaryAccrual.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['normal-1', 'carried-1'] } },
      data: { salaryPaymentId: 'sp-new' },
    });
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'sp-new' },
      data: { amount: 25_000 },
    });
    expect(result.calculated).toBe(1);
    expect(result.details[0].action).toBe('CREATED');
  });

  it('MERGES new accruals into an existing CALCULATED draft (no duplicate payment)', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValueOnce([
      { id: 'late-1', userId: 7, amount: 5_000 },
    ]);
    tx.salaryPayment.findFirst.mockResolvedValueOnce({
      id: 'sp-existing',
      status: 'CALCULATED',
    });
    // Existing 25k + new 5k after linking.
    tx.salaryAccrual.aggregate.mockResolvedValueOnce({
      _sum: { amount: 30_000 },
    });

    const result = await service.calculateMonthlySalaries(1, { now });

    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
    expect(tx.salaryAccrual.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['late-1'] } },
      data: { salaryPaymentId: 'sp-existing' },
    });
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'sp-existing' },
      data: { amount: 30_000 },
    });
    expect(result.calculated).toBe(1);
    expect(result.details[0].action).toBe('MERGED');
  });

  it('SKIPS a user whose payment for the period is already APPROVED/PAID (closed)', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValueOnce([
      { id: 'x', userId: 7, amount: 5_000 },
    ]);
    tx.salaryPayment.findFirst.mockResolvedValueOnce({
      id: 'sp-paid',
      status: 'PAID',
    });

    const result = await service.calculateMonthlySalaries(1, { now });

    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
    expect(tx.salaryPayment.update).not.toHaveBeenCalled();
    expect(tx.salaryAccrual.updateMany).not.toHaveBeenCalled();
    expect(result.calculated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.skippedUserIds).toEqual([7]);
  });

  it('creates no payment when there are no accruals and no fixed-monthly staff', async () => {
    const result = await service.calculateMonthlySalaries(1, { now });
    expect(tx.salaryPayment.create).not.toHaveBeenCalled();
    expect(result.calculated).toBe(0);
  });

  describe('FIXED_MONTHLY (non-teaching staff)', () => {
    it('creates a prorated payment and excludes archived users (deletedAt guard)', async () => {
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([
        { id: 'cfg1', userId: 10030 },
      ]);
      // Full-period version → full flat salary.
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          value: 5_000_000,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
        },
      ]);

      const result = await service.calculateMonthlySalaries(1, { now });

      // 4a guard: the sweep filters out archived/removed employees.
      expect(prisma.employeeSalaryConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            groupId: null,
            salaryType: 'FIXED_MONTHLY',
            user: { deletedAt: null },
          }),
        }),
      );
      expect(tx.salaryPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 10030,
            amount: 5_000_000,
            status: 'CALCULATED',
          }),
        }),
      );
      expect(result.calculated).toBe(1);
    });

    it('skips a config with no version overlapping the settled period', async () => {
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([
        { id: 'cfg1', userId: 10030 },
      ]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([]); // none overlap

      const result = await service.calculateMonthlySalaries(1, { now });
      expect(tx.salaryPayment.create).not.toHaveBeenCalled();
      expect(result.calculated).toBe(0);
    });
  });
});
