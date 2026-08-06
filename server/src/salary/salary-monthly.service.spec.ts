import { Test, TestingModule } from '@nestjs/testing';
import { SalaryMonthlyService } from './salary-monthly.service';
import { SalaryStaffMonthlyService } from './salary-monthly-staff.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The monthly report resolves a picked month to its payroll period, then per
 * teacher splits the month's earnings BY FUNDER: `covered` (accruals a student
 * actually paid for), `centerFunded` (written center top-up accruals PLUS the
 * still-unsettled billable lessons × rate), and `fullDeserved` = the two added.
 * The split is computed the same way whether or not the month has been settled
 * — settlement only moves money from the forecast leg to the written leg.
 * Manual/config-gap months (May) report blank (`null`) per-lesson columns.
 */
describe('SalaryMonthlyService', () => {
  let service: SalaryMonthlyService;
  let prisma: any;
  let staff: { computeStaff: jest.Mock };

  const ceoCaller = { mainBranch: 1, roles: [{ role: { name: 'CEO' } }] };
  const emptyStaff = {
    staff: [],
    staffTotals: { monthly: 0, advances: 0, netToPay: 0 },
  };

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ systemStartDate: new Date('2026-05-01') }),
      },
      salaryPeriodSetting: {
        findFirst: jest.fn().mockResolvedValue({ cycleStartDay: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(ceoCaller),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salaryAccrual: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]), // carriedOut aggregate
      },
      attendance: {
        findMany: jest.fn().mockResolvedValue([]),
        // BR-09 held-lesson count (studentId::groupId -> attended count). Default
        // empty; gap tests override it so their student clears the new-student gate.
        groupBy: jest.fn().mockResolvedValue([]),
      },
      // Inactive-student list for the top-up cap; default none.
      student: { findMany: jest.fn().mockResolvedValue([]) },
      group: { findMany: jest.fn().mockResolvedValue([]) },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
      lessonTeacherOverride: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: { findMany: jest.fn().mockResolvedValue([]) },
      expense: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salaryPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };

    staff = { computeStaff: jest.fn().mockResolvedValue(emptyStaff) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryMonthlyService,
        { provide: PrismaService, useValue: prisma },
        { provide: SalaryStaffMonthlyService, useValue: staff },
      ],
    }).compile();

    service = module.get<SalaryMonthlyService>(SalaryMonthlyService);
  });

  const teacher = (id: number, first = 'T', last = 'X') => ({
    id,
    firstName: first,
    lastName: last,
    isActive: true,
    branches: [{ branch: { id: 1, name: 'Asosiy' } }],
  });

  it('returns an empty payload (no attendance sweep) when no teachers match', async () => {
    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

    expect(res.data).toEqual([]);
    expect(res.totals).toEqual({
      fullDeserved: 0,
      covered: 0,
      carriedIn: 0,
      carriedOut: 0,
      centerFunded: 0,
      advances: 0,
      netToPay: 0,
      centerAdvanced: 0,
      centerStillFronted: 0,
      centerRecovered: 0,
    });
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    // Staff is computed even on the zero-teacher early return.
    expect(staff.computeStaff).toHaveBeenCalled();
    expect(res.staff).toEqual([]);
    expect(res.staffTotals).toEqual({ monthly: 0, advances: 0, netToPay: 0 });
  });

  it('surfaces the non-teaching staff pass in the response', async () => {
    const staffRows = [
      {
        user: { id: 10030, firstName: 'A', lastName: 'B', position: 'Administrator', branch: null },
        monthly: 5_000_000,
        advances: 0,
        netToPay: 5_000_000,
        payment: null,
      },
    ];
    staff.computeStaff.mockResolvedValue({
      staff: staffRows,
      staffTotals: { monthly: 5_000_000, advances: 0, netToPay: 5_000_000 },
    });

    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

    expect(res.staff).toEqual(staffRows);
    expect(res.staffTotals.netToPay).toBe(5_000_000);
  });

  it('IN-PROGRESS month: the center leg is the not-yet-settled lessons (forecast)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } }, // perLesson = 20_000
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10010 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30, // 30% of 20_000 = 6_000 per lesson
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10010, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    // One covered lesson (a1) already has an accrual; one uncovered (a2) → gap.
    prisma.salaryAccrual.findMany.mockResolvedValue([
      { userId: 10010, attendanceId: 'a1', amount: 6_000 },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', studentId: 20001, groupId: 'g1', date: new Date('2026-07-10') },
      { id: 'a2', studentId: 20001, groupId: 'g1', date: new Date('2026-07-12') },
    ]);
    // Student 20001 has cleared the BR-09 new-student gate (>= 4 attended).
    prisma.attendance.groupBy.mockResolvedValue([
      { studentId: 20001, groupId: 'g1', _count: { _all: 8 } },
    ]);

    // July is a top-up month → netToPay uses the FULL (covered + gap) base.
    const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

    const row = res.data[0];
    expect(row.hasLessonData).toBe(true);
    expect(row.covered).toBe(6_000);
    expect(row.centerFunded).toBe(6_000);
    expect(row.fullDeserved).toBe(12_000);
    expect(row.netToPay).toBe(12_000); // FULL base (covered + gap) − 0 advances
    expect(res.totals).toEqual(
      expect.objectContaining({ fullDeserved: 12_000, covered: 6_000, centerFunded: 6_000 }),
    );
  });

  /**
   * The SAME month once the cron has settled it. Phase 0 turned the uncovered
   * lesson into a written center-funded accrual, so the forecast leg is now 0 —
   * but the funder split must be IDENTICAL to the in-progress case above.
   * Counting a written top-up as `covered` is what made a settled month claim
   * students had paid money they never paid.
   */
  it('SETTLED month: the same split, with the center leg now written as accruals', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
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
    // a1 the student paid for; a2 the center fronted at settlement.
    prisma.salaryAccrual.findMany.mockResolvedValue([
      {
        userId: 10010,
        attendanceId: 'a1',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: false,
        wasCenterTopUp: false,
      },
      {
        userId: 10010,
        attendanceId: 'a2',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: true,
        wasCenterTopUp: true,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', studentId: 20001, groupId: 'g1', date: new Date('2026-07-10') },
      { id: 'a2', studentId: 20001, groupId: 'g1', date: new Date('2026-07-12') },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([
      { studentId: 20001, groupId: 'g1', _count: { _all: 8 } },
    ]);

    const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

    const row = res.data[0];
    // Byte-for-byte the in-progress month's numbers — settlement moved the
    // center's 6 000 from the forecast leg to the written leg, nothing else.
    expect(row.covered).toBe(6_000);
    expect(row.centerFunded).toBe(6_000);
    expect(row.fullDeserved).toBe(12_000);
    expect(row.netToPay).toBe(12_000);
    expect(res.totals).toEqual(
      expect.objectContaining({
        covered: 6_000,
        centerFunded: 6_000,
        fullDeserved: 12_000,
      }),
    );
  });

  /**
   * `hasLessonData` decides whether the per-lesson columns render at all. It
   * used to key off `covered` — which, once that stopped including the center's
   * money, would blank out a teacher whose whole month the center funded.
   */
  it('SETTLED month funded ENTIRELY by the center still reports its columns', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10010 },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([
      {
        userId: 10010,
        attendanceId: 'a1',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: true,
        wasCenterTopUp: true,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', studentId: 20001, groupId: 'g1', date: new Date('2026-07-10') },
    ]);

    const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

    const row = res.data[0];
    expect(row.hasLessonData).toBe(true);
    expect(row.covered).toBe(0); // students paid nothing
    expect(row.centerFunded).toBe(6_000);
    expect(row.fullDeserved).toBe(6_000);
    expect(row.netToPay).toBe(6_000);
  });

  it('exposes carriedIn (part of covered) and carriedOut per teacher', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    // Two covered accruals: one normal (creditPeriodDate null), one carried IN
    // from a prior month (creditPeriodDate set → counts as "oldingi oydan").
    prisma.salaryAccrual.findMany.mockResolvedValue([
      { userId: 10010, attendanceId: 'a1', amount: 6_000, creditPeriodDate: null },
      { userId: 10010, attendanceId: 'a2', amount: 4_000, creditPeriodDate: new Date('2026-06-01') },
    ]);
    // This month's lessons whose earning carried OUT to a later period.
    prisma.salaryAccrual.groupBy.mockResolvedValue([
      { userId: 10010, _sum: { amount: 2_500 } },
    ]);

    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);
    const row = res.data[0];
    expect(row.covered).toBe(10_000); // both covered accruals
    expect(row.carriedIn).toBe(4_000); // the one with creditPeriodDate
    expect(row.carriedOut).toBe(2_500); // from the groupBy
    expect(res.totals).toEqual(
      expect.objectContaining({ carriedIn: 4_000, carriedOut: 2_500 }),
    );
  });

  it('shows the COVERED base (not full) for a pre-top-up month (June)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
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
    prisma.salaryAccrual.findMany.mockResolvedValue([
      { userId: 10010, attendanceId: 'a1', amount: 6_000 },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', groupId: 'g1', date: new Date('2026-06-10') },
      { id: 'a2', groupId: 'g1', date: new Date('2026-06-12') },
    ]);

    // June is BEFORE the top-up switch → there is NO center top-up. The gap is
    // hidden (0) and deserved = covered, so the pre-July view isn't confused by a
    // hypothetical "Qo'shilishi kerak" figure. netToPay also stays on covered.
    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

    const row = res.data[0];
    expect(row.fullDeserved).toBe(6_000); // covered only — no top-up before July
    expect(row.centerFunded).toBe(0); // hidden for pre-July months
    expect(row.netToPay).toBe(6_000); // COVERED base − 0 advances (no top-up)
  });

  it('nets FULL deserved minus advances for an unsettled top-up month', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } }, // perLesson = 20_000
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10010 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30, // 6_000 per lesson
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10010, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    // covered 6_000 + gap 6_000 = fullDeserved 12_000; 2_000 avans given, no payment yet.
    prisma.salaryAccrual.findMany.mockResolvedValue([
      { userId: 10010, attendanceId: 'a1', amount: 6_000 },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', studentId: 20001, groupId: 'g1', date: new Date('2026-07-10') },
      { id: 'a2', studentId: 20001, groupId: 'g1', date: new Date('2026-07-12') },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([
      { studentId: 20001, groupId: 'g1', _count: { _all: 8 } },
    ]);
    prisma.expense.groupBy.mockResolvedValue([
      { relatedUserId: 10010, _sum: { amount: 2_000 } },
    ]);

    const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

    const row = res.data[0];
    expect(row.fullDeserved).toBe(12_000);
    expect(row.advances).toBe(2_000);
    expect(row.netToPay).toBe(10_000); // 12_000 fullDeserved − 2_000 avans
  });

  it('blanks the per-lesson columns for a manual/config-gap month (May)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10010 },
    ]);
    // Config only becomes effective in June → no rate for a May lesson.
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30,
        effectiveFrom: new Date('2026-06-01'),
        effectiveTo: null,
        config: { userId: 10010, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([]); // no accruals in May
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', groupId: 'g1', date: new Date('2026-05-15') },
    ]);
    prisma.salaryPayment.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 10010,
        amount: 20_840_343,
        status: 'CALCULATED',
        settledExpenses: [],
      },
    ]);

    const res = await service.getMonthly({ month: '2026-05' }, 1, 999);

    const row = res.data[0];
    expect(row.hasLessonData).toBe(false);
    expect(row.fullDeserved).toBeNull();
    expect(row.covered).toBeNull();
    expect(row.centerFunded).toBeNull();
    expect(row.netToPay).toBe(20_840_343); // the entered manual amount
    expect(row.payment?.status).toBe('CALCULATED');
  });

  it('does NOT double-subtract advances from a settled payment (net = payment amount)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010)]);
    prisma.salaryPayment.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 10010,
        amount: 500_000, // already net of the settled advance
        status: 'PAID',
        settledExpenses: [{ amount: 100_000 }],
      },
    ]);
    prisma.expense.groupBy.mockResolvedValue([
      { relatedUserId: 10010, _sum: { amount: 100_000 } },
    ]);

    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

    const row = res.data[0];
    expect(row.advances).toBe(100_000);
    expect(row.netToPay).toBe(500_000); // NOT 400_000
  });

  it('flags a FIXED_MONTHLY teacher and computes no gap', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10020, 'Admin')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10020 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'FIXED_MONTHLY',
        value: 4_000_000,
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10020, groupId: null, salaryType: 'FIXED_MONTHLY' },
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', groupId: 'g1', date: new Date('2026-06-10') },
    ]);

    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

    const row = res.data[0];
    expect(row.isFixedMonthly).toBe(true);
    expect(row.centerFunded).toBeNull(); // no fabricated per-lesson gap
    expect(row.hasLessonData).toBe(false);
  });

  it('reports center top-up advanced/recovered/still-fronted per teacher and totals', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10010 },
    ]);
    // Three accruals in the period:
    //  - a1: ordinary student-covered (never a top-up)         → neither flag
    //  - a2: center fronted, STILL fronted (isCenterTopUp)     → advanced + fronted
    //  - a3: center fronted then recovered (was, not is)       → advanced only
    prisma.salaryAccrual.findMany.mockResolvedValue([
      {
        userId: 10010,
        attendanceId: 'a1',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: false,
        wasCenterTopUp: false,
      },
      {
        userId: 10010,
        attendanceId: 'a2',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: true,
        wasCenterTopUp: true,
      },
      {
        userId: 10010,
        attendanceId: 'a3',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: false,
        wasCenterTopUp: true,
      },
    ]);

    const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

    const row = res.data[0];
    // advanced (X) = a2 + a3 = 12_000
    expect(row.centerAdvanced).toBe(12_000);
    expect(res.totals.centerAdvanced).toBe(12_000);
    // still-fronted (Z) = a2 = 6_000
    expect(res.totals.centerStillFronted).toBe(6_000);
    // recovered (Y) = X − Z = 6_000 (a3, which was fronted then paid back)
    expect(res.totals.centerRecovered).toBe(6_000);
    // A RECOVERED top-up stays on the center's leg for the month it funded: the
    // center did pay the teacher then, and getting the money back later is a
    // separate cash event (the X/Y/Z card). Only a1 was ever student money.
    expect(row.covered).toBe(6_000);
    expect(row.centerFunded).toBe(12_000);
    expect(row.fullDeserved).toBe(18_000);
  });

  it('BR-09: tops up a committed student but withholds a new student below the threshold', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } }, // perLesson 20_000, 30% = 6_000
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
    prisma.salaryAccrual.findMany.mockResolvedValue([]); // both lessons uncovered
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', studentId: 20003, groupId: 'g1', date: new Date('2026-07-10') }, // committed
      { id: 'a2', studentId: 20004, groupId: 'g1', date: new Date('2026-07-12') }, // new
    ]);
    prisma.attendance.groupBy.mockResolvedValue([
      { studentId: 20003, groupId: 'g1', _count: { _all: 5 } }, // >= 4 → topped up
      { studentId: 20004, groupId: 'g1', _count: { _all: 2 } }, // < 4 → withheld
    ]);

    const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

    // Only the committed student's uncovered lesson becomes a gap.
    expect(res.data[0].centerFunded).toBe(6_000);
  });

  it('the gap sweep includes ABSENT (a held lesson earns the teacher)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);

    await service.getMonthly({ month: '2026-07' }, 1, 999);

    const call = prisma.attendance.findMany.mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ['PRESENT', 'LATE', 'ABSENT'] });
  });

  it('caps the shown top-up at a student who went inactive (no top-up after status change)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
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
    prisma.salaryAccrual.findMany.mockResolvedValue([]); // both uncovered → would be gap
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'before', studentId: 20005, groupId: 'g1', date: new Date('2026-07-05') },
      { id: 'after', studentId: 20005, groupId: 'g1', date: new Date('2026-07-20') },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([
      { studentId: 20005, groupId: 'g1', _count: { _all: 6 } },
    ]);
    // Frozen on 2026-07-10 → only the pre-freeze lesson is fronted (one gap unit).
    prisma.student.findMany.mockResolvedValue([
      { id: 20005, statusChangedAt: new Date('2026-07-10T09:00:00Z') },
    ]);

    const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

    expect(res.data[0].centerFunded).toBe(6_000); // only 07-05, not 07-20
  });

  it('scopes the teacher query to the mainBranch for a Branch Director', async () => {
    prisma.user.findUnique.mockResolvedValue({
      mainBranch: 7,
      roles: [{ role: { name: 'Branch Director' } }],
    });

    await service.getMonthly({ month: '2026-06' }, 1, 555);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branches: { some: { branchId: 7 } } }),
      }),
    );
  });

  it('does NOT branch-scope for a CEO', async () => {
    await service.getMonthly({ month: '2026-06' }, 1, 999);

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.branches).toBeUndefined();
  });

  it('clamps a month earlier than the company start up to the floor', async () => {
    const res = await service.getMonthly({ month: '2026-03' }, 1, 999);

    expect(res.floorMonth).toBe('2026-05');
    expect(res.month).toBe('2026-05');
  });

  describe('getAdvancesForUser', () => {
    it('lists the teacher TEACHER_ADVANCE expenses for the month with a total', async () => {
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'a1',
          amount: 300_000,
          date: new Date('2026-06-05'),
          paymentMethod: 'CASH',
          description: '1-qism',
          createdAt: new Date('2026-06-05'),
          createdBy: { id: 2, firstName: 'Admin', lastName: 'A' },
        },
        {
          id: 'a2',
          amount: 200_000,
          date: new Date('2026-06-20'),
          paymentMethod: 'CARD',
          description: '2-qism',
          createdAt: new Date('2026-06-20'),
          createdBy: { id: 2, firstName: 'Admin', lastName: 'A' },
        },
      ]);

      const res = await service.getAdvancesForUser(
        10010,
        { month: '2026-06' },
        1,
        999,
      );

      expect(res.month).toBe('2026-06');
      expect(res.count).toBe(2);
      expect(res.total).toBe(500_000);
      const where = prisma.expense.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        relatedUserId: 10010,
        category: 'TEACHER_ADVANCE',
        companyId: 1,
        deletedAt: null,
      });
      expect(where.date.gte).toBeInstanceOf(Date);
      expect(where.date.lt).toBeInstanceOf(Date);
    });
  });

  /**
   * The per-user view backing the teacher profile tab, the profile card and
   * the lehrer portal. It MUST come out of the same pass as the full table —
   * a separate calculation is exactly how the four-different-numbers bug
   * happened.
   */
  describe('getMonthlyForUser', () => {
    it('narrows the teacher roster to the requested user', async () => {
      await service.getMonthlyForUser(10005, { month: '2026-06' }, 1, 999);

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.id).toBe(10005);
    });

    it('returns the single teacher row alongside the month metadata', async () => {
      prisma.user.findMany.mockResolvedValue([teacher(10005, 'Gulnoza', 'S')]);

      const res = await service.getMonthlyForUser(
        10005,
        { month: '2026-06' },
        1,
        999,
      );

      expect(res.month).toBe('2026-06');
      expect(res.floorMonth).toBe('2026-05');
      expect(res.period.cycleStartDay).toBe(1);
      expect(res.row?.user.id).toBe(10005);
    });

    it('falls back to the non-teaching staff row for a fixed-salary employee', async () => {
      const staffRow = {
        user: {
          id: 10030,
          firstName: 'A',
          lastName: 'B',
          position: 'Administrator',
          branch: null,
        },
        monthly: 5_000_000,
        advances: 0,
        netToPay: 5_000_000,
        payment: null,
      };
      staff.computeStaff.mockResolvedValue({
        staff: [staffRow],
        staffTotals: { monthly: 5_000_000, advances: 0, netToPay: 5_000_000 },
      });

      const res = await service.getMonthlyForUser(
        10030,
        { month: '2026-06' },
        1,
        999,
      );

      expect(res.row).toEqual(staffRow);
    });

    it('returns a null row when the user has no salary presence that month', async () => {
      const res = await service.getMonthlyForUser(
        10099,
        { month: '2026-06' },
        1,
        999,
      );

      expect(res.row).toBeNull();
    });
  });
});
