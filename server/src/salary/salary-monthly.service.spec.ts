import { Test, TestingModule } from '@nestjs/testing';
import { SalaryMonthlyService } from './salary-monthly.service';
import { SalaryStaffMonthlyService } from './salary-monthly-staff.service';
import { SalaryMissedLessonsService } from './salary-missed-lessons.service';
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
  let missed: { forTeacher: jest.Mock };

  const ceoCaller = { mainBranch: 1, roles: [{ role: { name: 'CEO' } }] };
  const emptyStaff = {
    staff: [],
    staffTotals: { monthly: 0, advances: 0, netToPay: 0, advanceCount: 0 },
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
      // Oylik kursning MUZLATILGAN dars narxi (`loadFrozenMonthlyCharges`).
      // Odatiy — bo'sh: bu testlarning kurslari 12 talik modelda.
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },
      // Pack markers of monthly-course lessons with no charge (ADR-0051).
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      // Lessons whose teacher pay is forfeited (ADR-0054); default none.
      unmarkedLesson: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Unsettled TEACHER_ADVANCE rows the payout would net (ADR-0082).
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      salaryPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };

    staff = { computeStaff: jest.fn().mockResolvedValue(emptyStaff) };
    missed = {
      forTeacher: jest.fn().mockResolvedValue({ lessons: [], total: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryMonthlyService,
        { provide: PrismaService, useValue: prisma },
        { provide: SalaryStaffMonthlyService, useValue: staff },
        { provide: SalaryMissedLessonsService, useValue: missed },
      ],
    }).compile();

    service = module.get<SalaryMonthlyService>(SalaryMonthlyService);

    // A fixed clock decides which month is the OPEN one (its advances are not
    // capped, spec §3): 10 Oct 2026, so every month the cases below ask for is
    // a past month unless a case moves the clock back into it.
    jest.useFakeTimers({ now: new Date('2026-10-10T07:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Where and when an accrual's lesson was held. Every real accrual has them
   * (the report buckets each one by group), so a fixture spreads this in and
   * names only what the case is about.
   */
  const LESSON = {
    groupId: 'g1',
    studentId: 20001,
    lessonDate: new Date('2026-07-10'),
  };

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
      centerUnpaidShare: 0,
      carriedIn: 0,
      carriedOut: 0,
      centerFunded: 0,
      advances: 0,
      advanceCount: 0,
      netToPay: 0,
      centerAdvanced: 0,
      centerStillFronted: 0,
      centerRecovered: 0,
      centerOwedByStudents: 0,
    });
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    // Staff is computed even on the zero-teacher early return.
    expect(staff.computeStaff).toHaveBeenCalled();
    expect(res.staff).toEqual([]);
    expect(res.staffTotals).toEqual({
      monthly: 0,
      advances: 0,
      netToPay: 0,
      advanceCount: 0,
    });
  });

  it('surfaces the non-teaching staff pass in the response', async () => {
    const staffRows = [
      {
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
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } }, // perLesson = 20_000
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30, // 30% of 20_000 = 6_000 per lesson
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    // One covered lesson (a1) already has an accrual; one uncovered (a2) → gap.
    prisma.salaryAccrual.findMany.mockResolvedValue([
      { ...LESSON, userId: 10001, attendanceId: 'a1', amount: 6_000 },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      {
        id: 'a1',
        studentId: 20001,
        groupId: 'g1',
        date: new Date('2026-07-10'),
      },
      {
        id: 'a2',
        studentId: 20001,
        groupId: 'g1',
        date: new Date('2026-07-12'),
      },
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
      expect.objectContaining({
        fullDeserved: 12_000,
        covered: 6_000,
        centerFunded: 6_000,
      }),
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
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30,
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    // a1 the student paid for; a2 the center fronted at settlement.
    prisma.salaryAccrual.findMany.mockResolvedValue([
      {
        ...LESSON,
        userId: 10001,
        attendanceId: 'a1',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: false,
        wasCenterTopUp: false,
      },
      {
        ...LESSON,
        userId: 10001,
        attendanceId: 'a2',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: true,
        wasCenterTopUp: true,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      {
        id: 'a1',
        studentId: 20001,
        groupId: 'g1',
        date: new Date('2026-07-10'),
      },
      {
        id: 'a2',
        studentId: 20001,
        groupId: 'g1',
        date: new Date('2026-07-12'),
      },
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
   * ADR-0052: on monthly billing the charge is written whether or not the
   * student pays, so a debtor's lessons accrue as "students paid". The part
   * of that charge still unpaid moves to the centre's column; the teacher's
   * pay and net do not change.
   */
  it('MONTHLY charge still unpaid: its share of pay moves to the centre', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 400_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([
      {
        ...LESSON,
        userId: 10001,
        studentId: 20001,
        attendanceId: 'a1',
        amount: 8_000,
        creditPeriodDate: null,
        isCenterTopUp: false,
        wasCenterTopUp: false,
        deductionTransactionId: 'charge-sep',
      },
      {
        ...LESSON,
        userId: 10001,
        studentId: 20001,
        attendanceId: 'a2',
        amount: 8_000,
        creditPeriodDate: null,
        isCenterTopUp: false,
        wasCenterTopUp: false,
        deductionTransactionId: 'charge-sep',
      },
    ]);
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
      { transactionId: 'charge-sep' },
    ]);
    prisma.student.findMany.mockResolvedValue([{ id: 20001 }]);
    // 400 000 charged, 100 000 paid: three quarters still unpaid.
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'charge-sep',
        studentId: 20001,
        type: 'LESSON_DEDUCTION',
        amount: -400_000,
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
      {
        id: 'pay',
        studentId: 20001,
        type: 'PAYMENT',
        amount: 100_000,
        createdAt: new Date('2026-09-05T00:00:00Z'),
      },
    ]);

    const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

    const row = res.data[0];
    expect(row.fullDeserved).toBe(16_000);
    expect(row.covered).toBe(4_000);
    expect(row.centerFunded).toBe(12_000);
    expect(row.centerUnpaidShare).toBe(12_000);
    expect(row.netToPay).toBe(16_000);
    expect(res.totals).toEqual(
      expect.objectContaining({ covered: 4_000, centerFunded: 12_000 }),
    );
  });

  /**
   * `hasLessonData` decides whether the per-lesson columns render at all. It
   * used to key off `covered` — which, once that stopped including the center's
   * money, would blank out a teacher whose whole month the center funded.
   */
  it('SETTLED month funded ENTIRELY by the center still reports its columns', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([
      {
        ...LESSON,
        userId: 10001,
        attendanceId: 'a1',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: true,
        wasCenterTopUp: true,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      {
        id: 'a1',
        studentId: 20001,
        groupId: 'g1',
        date: new Date('2026-07-10'),
      },
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
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    // Two covered accruals: one normal (creditPeriodDate null), one carried IN
    // from a prior month (creditPeriodDate set → counts as "oldingi oydan").
    prisma.salaryAccrual.findMany.mockResolvedValue([
      {
        ...LESSON,
        userId: 10001,
        attendanceId: 'a1',
        amount: 6_000,
        creditPeriodDate: null,
      },
      {
        ...LESSON,
        userId: 10001,
        attendanceId: 'a2',
        amount: 4_000,
        creditPeriodDate: new Date('2026-06-01'),
      },
    ]);
    // This month's lessons whose earning carried OUT to a later period.
    prisma.salaryAccrual.groupBy.mockResolvedValue([
      { userId: 10001, _sum: { amount: 2_500 } },
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
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30,
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([
      { ...LESSON, userId: 10001, attendanceId: 'a1', amount: 6_000 },
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
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } }, // perLesson = 20_000
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30, // 6_000 per lesson
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    // covered 6_000 + gap 6_000 = fullDeserved 12_000; 2_000 avans given, no payment yet.
    prisma.salaryAccrual.findMany.mockResolvedValue([
      { ...LESSON, userId: 10001, attendanceId: 'a1', amount: 6_000 },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      {
        id: 'a1',
        studentId: 20001,
        groupId: 'g1',
        date: new Date('2026-07-10'),
      },
      {
        id: 'a2',
        studentId: 20001,
        groupId: 'g1',
        date: new Date('2026-07-12'),
      },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([
      { studentId: 20001, groupId: 'g1', _count: { _all: 8 } },
    ]);
    prisma.expense.findMany.mockResolvedValue([
      {
        id: 'e1',
        relatedUserId: 10001,
        amount: 2_000,
        date: new Date('2026-07-05'),
        createdAt: new Date('2026-07-05T06:00:00Z'),
      },
    ]);

    const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

    const row = res.data[0];
    expect(row.fullDeserved).toBe(12_000);
    expect(row.advances).toBe(2_000);
    expect(row.netToPay).toBe(10_000); // 12_000 fullDeserved − 2_000 avans
  });

  it('blanks the per-lesson columns for a manual/config-gap month (May)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    // Config only becomes effective in June → no rate for a May lesson.
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30,
        effectiveFrom: new Date('2026-06-01'),
        effectiveTo: null,
        config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([]); // no accruals in May
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', groupId: 'g1', date: new Date('2026-05-15') },
    ]);
    prisma.salaryPayment.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 10001,
        amount: 15_000_000,
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
    expect(row.netToPay).toBe(15_000_000); // the entered manual amount
    expect(row.payment?.status).toBe('CALCULATED');
  });

  /**
   * Narxlanmagan darslar ekranga chiqishi kerak — aks holda o'qituvchining
   * qatori sababsiz kam ko'rinadi va buning sababini faqat serverning
   * jurnalidan bilish mumkin bo'lardi.
   *
   * `noConfigUnits` bu paytgacha `Agg` ichida yig'ilardi-yu, javobga
   * umuman qo'shilmasdi — ya'ni sanoq bor, ko'radigan hech kim yo'q edi.
   */
  it("stavkasi yo'q darslarni qatorda SANAB ko'rsatadi (noConfigUnits)", async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    // Stavka faqat 2026-08 dan kuchga kiradi — iyul darsini qamramaydi.
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30,
        effectiveFrom: new Date('2026-08-01'),
        effectiveTo: null,
        config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([
      {
        id: 'a1',
        studentId: 20001,
        groupId: 'g1',
        date: new Date('2026-07-10'),
      },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([
      { studentId: 20001, groupId: 'g1', _count: { _all: 8 } },
    ]);

    const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

    const row = res.data[0];
    expect(row.noConfigUnits).toBe(1);
    expect(row.noChargeUnits).toBe(0);
    // Stavka to'qib chiqarilmaydi, shuning uchun narxlangan dars ham yo'q:
    // qatorning pul ustunlari BO'SH bo'lib qoladi. Ya'ni bu sanagich —
    // "dars o'tilgan, lekin narxlanmagan" ni ko'rsatadigan YAGONA belgi.
    expect(row.hasLessonData).toBe(false);
    expect(row.centerFunded).toBeNull();
  });

  /**
   * Oylik kursda muzlatilgan `EnrollmentMonthlyCharge` topilmasa dars
   * narxlanmaydi (`Course.price` bir OYning narxi — uni 12 ga bo'lish
   * o'qituvchiga noto'g'ri haq yozardi). Bu «stavka yo'q» dan BOSHQA
   * sabab, shuning uchun alohida sanagichda.
   */
  it("oylik kursda muzlatilgan hisobsiz darslarni SANAB ko'rsatadi (noChargeUnits)", async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      {
        id: 'g1',
        course: {
          price: 240_000,
          lessonPaymentCount: 12,
          paymentModel: 'MONTHLY',
        },
      },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30,
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([
      {
        id: 'a1',
        studentId: 20001,
        groupId: 'g1',
        date: new Date('2026-07-10'),
      },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([
      { studentId: 20001, groupId: 'g1', _count: { _all: 8 } },
    ]);
    // Muzlatilgan hisob yo'q (odatiy mock — bo'sh ro'yxat).

    const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

    const row = res.data[0];
    expect(row.noChargeUnits).toBe(1);
    // Stavka BOR edi — bu «konfiguratsiya yo'q» holati emas.
    expect(row.noConfigUnits).toBe(0);
    // Narx taxmin qilinmagani uchun bo'shliq narxlanmaydi va pul ustunlari
    // bo'sh qoladi — sanagich yagona belgi bo'lib qoladi.
    expect(row.hasLessonData).toBe(false);
    expect(row.centerFunded).toBeNull();
  });

  it('does NOT double-subtract advances from a settled payment (net = payment amount)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10001)]);
    prisma.salaryPayment.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 10001,
        amount: 500_000, // already net of the settled advance
        status: 'PAID',
        settledExpenses: [{ amount: 100_000 }],
      },
    ]);

    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

    const row = res.data[0];
    expect(row.advances).toBe(100_000); // the settled advance, from the payment
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
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    // Three accruals in the period:
    //  - a1: ordinary student-covered (never a top-up)         → neither flag
    //  - a2: center fronted, STILL fronted (isCenterTopUp)     → advanced + fronted
    //  - a3: center fronted then recovered (was, not is)       → advanced only
    prisma.salaryAccrual.findMany.mockResolvedValue([
      {
        ...LESSON,
        userId: 10001,
        attendanceId: 'a1',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: false,
        wasCenterTopUp: false,
      },
      {
        ...LESSON,
        userId: 10001,
        attendanceId: 'a2',
        amount: 6_000,
        creditPeriodDate: null,
        isCenterTopUp: true,
        wasCenterTopUp: true,
      },
      {
        ...LESSON,
        userId: 10001,
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
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } }, // perLesson 20_000, 30% = 6_000
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30,
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([]); // both lessons uncovered
    prisma.attendance.findMany.mockResolvedValue([
      {
        id: 'a1',
        studentId: 20003,
        groupId: 'g1',
        date: new Date('2026-07-10'),
      }, // committed
      {
        id: 'a2',
        studentId: 20004,
        groupId: 'g1',
        date: new Date('2026-07-12'),
      }, // new
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
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);

    await service.getMonthly({ month: '2026-07' }, 1, 999);

    const call = prisma.attendance.findMany.mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ['PRESENT', 'LATE', 'ABSENT'] });
  });

  it('caps the shown top-up at a student who went inactive (no top-up after status change)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10001 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30,
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([]); // both uncovered → would be gap
    prisma.attendance.findMany.mockResolvedValue([
      {
        id: 'before',
        studentId: 20005,
        groupId: 'g1',
        date: new Date('2026-07-05'),
      },
      {
        id: 'after',
        studentId: 20005,
        groupId: 'g1',
        date: new Date('2026-07-20'),
      },
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
      branches: [],
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

  /**
   * ADR-0082: the «Avans» column is what THIS month's payout nets, not what was
   * given in the calendar month. Open month: the walk over unsettled advances
   * (`planAdvanceNetting` — the cron's own function). Calculated month: what
   * the payment really settled.
   */
  describe('«Avans» — what the payout nets (ADR-0082)', () => {
    const createdBy = { id: 2, firstName: 'Admin', lastName: 'A' };
    const advance = (
      id: string,
      amount: number,
      date: string,
      createdAt: string,
      paymentMethod: 'CASH' | 'CARD' = 'CASH',
    ) => ({
      id,
      amount,
      date: new Date(date),
      createdAt: new Date(createdAt),
      relatedUserId: 10001,
      paymentMethod,
      createdBy,
    });

    beforeEach(() => {
      // 15 Sep 2026: September is the OPEN month unless a case says otherwise.
      jest.setSystemTime(new Date('2026-09-15T07:00:00Z'));
      prisma.user.findMany.mockResolvedValue([teacher(10001, 'Madina')]);
      // The month's base: 9 840 000 so'm of written accruals, no gap.
      prisma.salaryAccrual.findMany.mockResolvedValue([
        {
          ...LESSON,
          userId: 10001,
          attendanceId: 'a1',
          amount: 9_840_000,
          creditPeriodDate: null,
          isCenterTopUp: false,
          wasCenterTopUp: false,
        },
      ]);
    });

    it('open month: nets the advance dated in the month, not the one dated on the 1st of the next', async () => {
      prisma.expense.findMany.mockResolvedValue([
        advance('e1', 1_000_000, '2026-09-10', '2026-09-10T06:00:00Z'),
        advance('e2', 300_000, '2026-10-01', '2026-10-01T06:00:00Z'),
      ]);

      const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

      const row = res.data[0];
      expect(row.advances).toBe(1_000_000);
      expect(row.netToPay).toBe(8_840_000);
      expect(res.totals.advanceCount).toBe(1);
      expect(res.totals.advances).toBe(1_000_000);
    });

    it('open month: an older unsettled advance (never netted) is counted too', async () => {
      prisma.expense.findMany.mockResolvedValue([
        advance('e0', 800_000, '2026-08-28', '2026-08-28T06:00:00Z'),
        advance('e1', 1_000_000, '2026-09-10', '2026-09-10T06:00:00Z'),
      ]);

      const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

      const row = res.data[0];
      expect(row.advances).toBe(1_800_000);
      expect(row.netToPay).toBe(8_040_000);
      expect(res.totals.advanceCount).toBe(2);
    });

    it('open month: asks only for unsettled advances dated before the end of the month', async () => {
      await service.getMonthly({ month: '2026-09' }, 1, 999);

      const where = prisma.expense.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        relatedUserId: { in: [10001] },
        category: 'TEACHER_ADVANCE',
        companyId: 1,
        deletedAt: null,
        settledBySalaryPaymentId: null,
      });
      expect(where.date).toEqual({ lt: new Date('2026-10-01T00:00:00Z') });
    });

    // Mid-month the earnings are still growing: an advance bigger than today's
    // partial base is shown whole (the month-end payout will take it), not 0.
    it('open month: an advance above the partial base is shown whole, net is 0, the row stays', async () => {
      prisma.salaryAccrual.findMany.mockResolvedValue([
        {
          ...LESSON,
          userId: 10001,
          attendanceId: 'a1',
          amount: 600_000,
          creditPeriodDate: null,
          isCenterTopUp: false,
          wasCenterTopUp: false,
        },
      ]);
      prisma.expense.findMany.mockResolvedValue([
        advance('big', 1_000_000, '2026-09-10', '2026-09-10T06:00:00Z'),
      ]);

      const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

      expect(res.data).toHaveLength(1);
      expect(res.data[0].advances).toBe(1_000_000);
      expect(res.data[0].netToPay).toBe(0);
      expect(res.totals.advanceCount).toBe(1);
      expect(res.totals.advances).toBe(1_000_000);
    });

    it('open month: every unsettled advance is listed in walk order, even when they exceed the base', async () => {
      prisma.salaryAccrual.findMany.mockResolvedValue([]);
      prisma.expense.findMany.mockResolvedValue([
        advance('b', 400_000, '2026-09-12', '2026-09-12T06:00:00Z'),
        advance('a', 300_000, '2026-09-03', '2026-09-03T06:00:00Z'),
      ]);

      const res = await service.getMonthlyForUser(
        10001,
        { month: '2026-09' },
        1,
        999,
      );

      const row = res.row as {
        advances: number;
        advanceItems: { id: string }[];
      };
      expect(row.advances).toBe(700_000);
      expect(row.advanceItems.map((i) => i.id)).toEqual(['a', 'b']);
    });

    // A past month with no payment yet (the hours before the cron): exactly
    // what the cron will net, so the advance that does not fit stays pending.
    it('past month without a payment: an advance above the base does not fit — advances 0, net is the base', async () => {
      jest.setSystemTime(new Date('2026-10-01T00:30:00Z'));
      prisma.salaryAccrual.findMany.mockResolvedValue([
        {
          ...LESSON,
          userId: 10001,
          attendanceId: 'a1',
          amount: 600_000,
          creditPeriodDate: null,
          isCenterTopUp: false,
          wasCenterTopUp: false,
        },
      ]);
      prisma.expense.findMany.mockResolvedValue([
        advance('big', 1_000_000, '2026-09-10', '2026-09-10T06:00:00Z'),
      ]);

      const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

      expect(res.data[0].advances).toBe(0);
      expect(res.data[0].netToPay).toBe(600_000);
      expect(res.totals.advanceCount).toBe(0);
    });

    it('past month without a payment: nets what fits, in walk order', async () => {
      jest.setSystemTime(new Date('2026-10-01T00:30:00Z'));
      prisma.expense.findMany.mockResolvedValue([
        advance('a', 1_000_000, '2026-09-05', '2026-09-05T06:00:00Z'),
        advance('b', 9_000_000, '2026-09-10', '2026-09-10T06:00:00Z'),
        advance('c', 100_000, '2026-09-12', '2026-09-12T06:00:00Z'),
      ]);

      const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

      // 9 840 000 base: a fits, b does not (10 000 000 > 9 840 000), the walk stops.
      expect(res.data[0].advances).toBe(1_000_000);
      expect(res.data[0].netToPay).toBe(8_840_000);
      expect(res.totals.advanceCount).toBe(1);
    });

    it('calculated month: shows what the payment settled; an unsettled advance is NOT counted', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 10001,
          amount: 7_840_000,
          status: 'CALCULATED',
          paidAt: null,
          settledExpenses: [{ id: 's1', amount: 2_000_000 }],
        },
      ]);
      // Given inside the month, but the payment is already there — it is the
      // NEXT month's to net.
      prisma.expense.findMany.mockResolvedValue([
        advance('e1', 300_000, '2026-09-20', '2026-09-20T06:00:00Z'),
      ]);

      const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

      const row = res.data[0];
      expect(row.advances).toBe(2_000_000);
      expect(row.netToPay).toBe(7_840_000);
      expect(res.totals.advanceCount).toBe(1);
      expect(res.totals.advances).toBe(2_000_000);
    });

    it('passes the payment day through as an ISO string, null while unpaid', async () => {
      prisma.salaryPayment.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 10001,
          amount: 9_840_000,
          status: 'PAID',
          paidAt: new Date('2026-10-02T05:00:00Z'),
          settledExpenses: [],
        },
      ]);
      const paid = await service.getMonthly({ month: '2026-09' }, 1, 999);
      expect(paid.data[0].payment).toEqual({
        id: 'p1',
        amount: 9_840_000,
        status: 'PAID',
        paidAt: '2026-10-02T05:00:00.000Z',
      });

      prisma.salaryPayment.findMany.mockResolvedValue([
        {
          id: 'p2',
          userId: 10001,
          amount: 9_840_000,
          status: 'CALCULATED',
          paidAt: null,
          settledExpenses: [],
        },
      ]);
      const open = await service.getMonthly({ month: '2026-09' }, 1, 999);
      expect(open.data[0].payment?.paidAt).toBeNull();
    });

    it('selects the settled advances with their detail and the payment day', async () => {
      await service.getMonthly({ month: '2026-09' }, 1, 999);

      const select = prisma.salaryPayment.findMany.mock.calls[0][0].select;
      expect(select.paidAt).toBe(true);
      expect(select.settledExpenses.select).toMatchObject({
        id: true,
        amount: true,
        date: true,
        paymentMethod: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      });
    });

    it('a single-user call lists the netted advances in netting order, without the bookkeeping fields', async () => {
      // Handed over out of order: the plan walks createdAt, then id.
      prisma.expense.findMany.mockResolvedValue([
        advance(
          'e-late',
          200_000,
          '2026-09-12',
          '2026-09-12T06:00:00Z',
          'CARD',
        ),
        advance('e-early', 100_000, '2026-09-03', '2026-09-03T06:00:00Z'),
      ]);

      const res = await service.getMonthlyForUser(
        10001,
        { month: '2026-09' },
        1,
        999,
      );

      expect(res.row).toMatchObject({ advances: 300_000 });
      expect((res.row as { advanceItems?: unknown[] }).advanceItems).toEqual([
        {
          id: 'e-early',
          date: new Date('2026-09-03'),
          amount: 100_000,
          paymentMethod: 'CASH',
          createdBy,
        },
        {
          id: 'e-late',
          date: new Date('2026-09-12'),
          amount: 200_000,
          paymentMethod: 'CARD',
          createdBy,
        },
      ]);
    });

    it('a single-user call on a calculated month lists the settled advances in createdAt order', async () => {
      const settled = (id: string, createdAt: string, amount: number) => ({
        id,
        amount,
        date: new Date('2026-09-05'),
        createdAt: new Date(createdAt),
        paymentMethod: 'CASH',
        createdBy,
      });
      prisma.salaryPayment.findMany.mockResolvedValue([
        {
          id: 'p1',
          userId: 10001,
          amount: 9_540_000,
          status: 'PAID',
          paidAt: null,
          settledExpenses: [
            settled('s-b', '2026-09-08T06:00:00Z', 200_000),
            settled('s-a', '2026-09-05T06:00:00Z', 100_000),
          ],
        },
      ]);

      const res = await service.getMonthlyForUser(
        10001,
        { month: '2026-09' },
        1,
        999,
      );

      const items = (res.row as { advanceItems?: { id: string }[] })
        .advanceItems;
      expect(items?.map((i) => i.id)).toEqual(['s-a', 's-b']);
      expect(res.row).toMatchObject({ advances: 300_000 });
      expect(items?.[0]).not.toHaveProperty('createdAt');
    });

    it('the list call (no userId) carries no advanceItems', async () => {
      prisma.expense.findMany.mockResolvedValue([
        advance('e1', 1_000_000, '2026-09-10', '2026-09-10T06:00:00Z'),
      ]);

      const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

      expect(res.data[0]).not.toHaveProperty('advanceItems');
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
      await service.getMonthlyForUser(10040, { month: '2026-06' }, 1, 999);

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.id).toBe(10040);
    });

    it('returns the single teacher row alongside the month metadata', async () => {
      prisma.user.findMany.mockResolvedValue([teacher(10040, 'Vali', 'S')]);

      const res = await service.getMonthlyForUser(
        10040,
        { month: '2026-06' },
        1,
        999,
      );

      expect(res.month).toBe('2026-06');
      expect(res.floorMonth).toBe('2026-05');
      expect(res.period.cycleStartDay).toBe(1);
      expect(res.row?.user.id).toBe(10040);
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

    it("carries the month's «Berilmadi» lessons for the same user and month", async () => {
      const missedLessons = {
        lessons: [
          {
            date: '2026-06-03',
            groupId: 'g1',
            groupName: 'A1-1',
            students: 4,
            amount: 40_000,
          },
        ],
        total: 40_000,
      };
      missed.forTeacher.mockResolvedValue(missedLessons);
      const res = await service.getMonthlyForUser(
        10030,
        { month: '2026-06' },
        1,
        999,
      );
      expect(missed.forTeacher).toHaveBeenCalledWith(10030, 1, res.month);
      expect(res.missedLessons).toEqual(missedLessons);
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
  /**
   * Ish haqi ro'yxati bo'shatilgan odamlarni ko'rsatmasligi kerak — LEKIN
   * "faol emas" ni butunlay filtrlash pulni yashirib qo'yadi: 27.07 da
   * bo'shatilgan ustozning may va iyul oyliklari hali CALCULATED turibdi.
   * Qoida shuning uchun holatga emas, o'sha oyda puli qolgan-qolmaganiga
   * tayanadi.
   */
  describe("faol emas ustozlarni ro'yxatdan olib tashlash", () => {
    const inactive = (id: number) => ({
      ...teacher(id, 'Bo', 'Shagan'),
      isActive: false,
    });

    it("bo'sh oyda faol emas ustozni ro'yxatdan olib tashlaydi", async () => {
      prisma.user.findMany.mockResolvedValue([
        teacher(10001, 'Ali'),
        inactive(10009),
      ]);

      const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

      expect(res.data.map((r) => r.user.id)).toEqual([10001]);
    });

    it("faol emas ustoz dars ma'lumoti bo'lsa ro'yxatda qoladi", async () => {
      prisma.user.findMany.mockResolvedValue([inactive(10009)]);
      prisma.salaryAccrual.findMany.mockResolvedValue([
        { ...LESSON, userId: 10009, attendanceId: 'a1', amount: 79_998 },
      ]);

      const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

      expect(res.data).toHaveLength(1);
      expect(res.data[0].covered).toBe(79_998);
      // Ro'yxatdan tushib ketsa, JAMI ham shuncha kamayib ketardi.
      expect(res.totals.covered).toBe(79_998);
    });

    it("faol emas ustoz to'lanmagan oyligi bo'lsa ro'yxatda qoladi", async () => {
      prisma.user.findMany.mockResolvedValue([inactive(10009)]);
      prisma.salaryPayment.findMany.mockResolvedValue([
        {
          id: 'sp-1',
          userId: 10009,
          amount: 13_333,
          status: 'CALCULATED',
          settledExpenses: [],
        },
      ]);

      const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

      expect(res.data.map((r) => r.user.id)).toEqual([10009]);
      expect(res.data[0].netToPay).toBe(13_333);
    });

    // The cron writes a payment only for someone with accruals, so an advance
    // of a person who can no longer earn is never netted: the open month does
    // not show it as one that will be deducted (it stays in «Avanslar»).
    describe('joriy oyda, endi ishlay olmaydigan odamning avansi', () => {
      const unsettled = (userId: number) => ({
        id: 'e9',
        relatedUserId: userId,
        amount: 500_000,
        date: new Date('2026-06-05'),
        createdAt: new Date('2026-06-05T06:00:00Z'),
      });

      beforeEach(() => {
        jest.setSystemTime(new Date('2026-06-15T07:00:00Z')); // June is the open month
      });

      it("faol emas, darssiz ustozning avansi ushlanadigan deb ko'rsatilmaydi va qator ro'yxatdan tushadi", async () => {
        prisma.user.findMany.mockResolvedValue([inactive(10009)]);
        prisma.expense.findMany.mockResolvedValue([unsettled(10009)]);

        const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

        expect(res.data).toEqual([]);
        expect(res.totals.advances).toBe(0);
        expect(res.totals.advanceCount).toBe(0);
      });

      it("o'sha ustoz bitta odam so'ralganda (filtrsiz) avans 0 bilan qaytadi", async () => {
        prisma.user.findMany.mockResolvedValue([inactive(10009)]);
        prisma.expense.findMany.mockResolvedValue([unsettled(10009)]);

        const res = await service.getMonthlyForUser(
          10009,
          { month: '2026-06' },
          1,
          999,
        );

        expect(res.row).toMatchObject({ advances: 0, netToPay: 0 });
        expect((res.row as { advanceItems: unknown[] }).advanceItems).toEqual(
          [],
        );
      });

      it("faol ustoz hali darssiz bo'lsa ham avansi to'liq ko'rsatiladi (o'zgarmagan)", async () => {
        prisma.user.findMany.mockResolvedValue([teacher(10001, 'Ali')]);
        prisma.expense.findMany.mockResolvedValue([unsettled(10001)]);

        const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

        expect(res.data[0].advances).toBe(500_000);
        expect(res.data[0].netToPay).toBe(0);
        expect(res.totals.advanceCount).toBe(1);
      });

      it("faol emas, lekin shu oyda darsi bor ustozning avansi bazadan katta bo'lsa ham to'liq ko'rsatiladi", async () => {
        prisma.user.findMany.mockResolvedValue([inactive(10009)]);
        prisma.salaryAccrual.findMany.mockResolvedValue([
          { ...LESSON, userId: 10009, attendanceId: 'a1', amount: 300_000 },
        ]);
        prisma.expense.findMany.mockResolvedValue([unsettled(10009)]);

        const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

        expect(res.data[0].advances).toBe(500_000);
        expect(res.data[0].netToPay).toBe(0);
      });
    });

    it("faol emas ustozning o'tgan oydagi, sig'adigan avansi bo'lsa ro'yxatda qoladi", async () => {
      prisma.user.findMany.mockResolvedValue([inactive(10009)]);
      prisma.salaryAccrual.findMany.mockResolvedValue([
        { ...LESSON, userId: 10009, attendanceId: 'a1', amount: 300_000 },
      ]);
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'e9',
          relatedUserId: 10009,
          amount: 200_000,
          date: new Date('2026-06-05'),
          createdAt: new Date('2026-06-05T06:00:00Z'),
        },
      ]);

      const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

      expect(res.data.map((r) => r.user.id)).toEqual([10009]);
      expect(res.data[0].advances).toBe(200_000);
      expect(res.data[0].netToPay).toBe(100_000);
    });

    // ADR-0082: a PAST month without a payment shows what the cron will net.
    // An advance nothing can net (no earnings that month) is not on this page —
    // it waits in the advance calendar for the month that can take it.
    it("faol emas ustozning o'tgan oydagi hech narsadan ushlanmaydigan avansi uni ro'yxatda ushlab turmaydi", async () => {
      prisma.user.findMany.mockResolvedValue([inactive(10009)]);
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'e9',
          relatedUserId: 10009,
          amount: 200_000,
          date: new Date('2026-06-05'),
          createdAt: new Date('2026-06-05T06:00:00Z'),
        },
      ]);

      const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

      expect(res.data).toEqual([]);
    });

    it("bitta odam so'ralganda (profil/portal) filtr ishlamaydi", async () => {
      prisma.user.findMany.mockResolvedValue([inactive(10009)]);

      const res = await service.getMonthlyForUser(
        10009,
        { month: '2026-06' },
        1,
        999,
      );

      expect(res.row).not.toBeNull();
      expect(res.row?.user.id).toBe(10009);
    });
  });

  /**
   * B3 «Ish haqi»: what the page's summary pill, its «Nimadan» column, the
   * row drawer and the «E'tibor talab qiladi» card read from the same pass.
   */
  describe('B3 — month state, group buckets, attention', () => {
    const paidPayment = (userId: number, status: string) => ({
      id: `p${userId}`,
      userId,
      amount: 500_000,
      status,
      paidAt: status === 'PAID' ? new Date('2026-07-10T05:00:00Z') : null,
      settledExpenses: [],
    });
    const staffRow = (id: number, status: string | null) => ({
      user: { id, firstName: 'Dilnoza', lastName: 'Q', position: 'Kassir' },
      monthly: 3_000_000,
      advances: 0,
      netToPay: 3_000_000,
      payment: status
        ? { id: `s${id}`, amount: 3_000_000, status, paidAt: null }
        : null,
    });
    const staffOnly = (rows: unknown[]) =>
      staff.computeStaff.mockResolvedValue({
        staff: rows,
        staffTotals: { monthly: 0, advances: 0, netToPay: 0, advanceCount: 0 },
      });

    describe('monthState', () => {
      it('is OPEN for the current Tashkent month', async () => {
        prisma.user.findMany.mockResolvedValue([teacher(10001, 'Madina')]);

        const res = await service.getMonthly({ month: '2026-10' }, 1, 999);

        expect(res.monthState).toEqual({
          kind: 'OPEN',
          paidCount: 0,
          payableCount: 0,
        });
      });

      it('counts teacher and staff payments together: PAID + CALCULATED is PARTLY_PAID 1/2', async () => {
        prisma.user.findMany.mockResolvedValue([teacher(10001, 'Madina')]);
        prisma.salaryPayment.findMany.mockResolvedValue([
          paidPayment(10001, 'PAID'),
        ]);
        staffOnly([staffRow(10030, 'CALCULATED')]);

        const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

        expect(res.monthState).toEqual({
          kind: 'PARTLY_PAID',
          paidCount: 1,
          payableCount: 2,
        });
      });

      it('is NOT_CALCULATED for a past month nobody has a payment in', async () => {
        prisma.user.findMany.mockResolvedValue([teacher(10001, 'Madina')]);
        staffOnly([staffRow(10030, null)]);

        const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

        expect(res.monthState.kind).toBe('NOT_CALCULATED');
      });

      it('leaves out a teacher the list drops (an inactive one with nothing left)', async () => {
        prisma.user.findMany.mockResolvedValue([
          { ...teacher(10009, 'Eski'), isActive: false },
          teacher(10001, 'Madina'),
        ]);
        prisma.salaryPayment.findMany.mockResolvedValue([
          paidPayment(10001, 'PAID'),
        ]);

        const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

        expect(res.data.map((r) => r.user.id)).toEqual([10001]);
        expect(res.monthState).toEqual({
          kind: 'PAID',
          paidCount: 1,
          payableCount: 1,
        });
      });

      it('is also answered on the zero-teacher early return, from the staff alone', async () => {
        staffOnly([staffRow(10030, 'PAID')]);

        const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

        expect(res.data).toEqual([]);
        expect(res.monthState).toEqual({
          kind: 'PAID',
          paidCount: 1,
          payableCount: 1,
        });
      });
    });

    describe('group buckets', () => {
      const groups = [
        {
          id: 'g1',
          name: 'A1-12',
          course: { price: 240_000, lessonPaymentCount: 12 }, // 20 000 a lesson
        },
        {
          id: 'g2',
          name: 'B1-3',
          course: { price: 240_000, lessonPaymentCount: 12 },
        },
      ];
      const versions = [
        {
          salaryType: 'PERCENTAGE',
          value: 30, // 6 000 a lesson
          effectiveFrom: new Date('2026-05-01'),
          effectiveTo: null,
          config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
        },
        {
          salaryType: 'FIXED_PER_STUDENT',
          value: 150_000,
          effectiveFrom: new Date('2026-05-01'),
          effectiveTo: null,
          config: {
            userId: 10001,
            groupId: 'g2',
            salaryType: 'FIXED_PER_STUDENT',
          },
        },
      ];
      const accrual = (
        attendanceId: string,
        groupId: string,
        studentId: number,
        lessonDate: string,
        amount: number,
      ) => ({
        userId: 10001,
        groupId,
        studentId,
        attendanceId,
        lessonDate: new Date(lessonDate),
        amount,
        creditPeriodDate: null,
        isCenterTopUp: false,
        wasCenterTopUp: false,
      });

      beforeEach(() => {
        prisma.user.findMany.mockResolvedValue([teacher(10001, 'Madina')]);
        prisma.group.findMany.mockResolvedValue(groups);
        prisma.groupTeacher.findMany.mockResolvedValue([
          { groupId: 'g1', teacherId: 10001 },
          { groupId: 'g2', teacherId: 10001 },
        ]);
        prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue(versions);
        prisma.salaryAccrual.findMany.mockResolvedValue([
          accrual('a1', 'g1', 20001, '2026-07-05', 6_000),
          accrual('a2', 'g1', 20002, '2026-07-05', 6_000),
          accrual('a3', 'g1', 20002, '2026-07-12', 6_000),
          accrual('a4', 'g2', 20003, '2026-07-06', 4_000),
          // Carried IN from June: part of fullDeserved, in no group's bucket.
          {
            ...accrual('a5', 'g1', 20001, '2026-06-28', 3_000),
            creditPeriodDate: new Date('2026-06-30T19:00:00Z'),
          },
        ]);
        // A held lesson nobody paid for yet: the centre's gap, in g1.
        prisma.attendance.findMany.mockResolvedValue([
          {
            id: 'a9',
            studentId: 20002,
            groupId: 'g1',
            date: new Date('2026-07-19'),
            status: 'PRESENT',
          },
        ]);
        prisma.attendance.groupBy.mockResolvedValue([
          { studentId: 20002, groupId: 'g1', _count: { _all: 8 } },
        ]);
      });

      it('counts distinct groups and students on every teacher row', async () => {
        const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

        const row = res.data[0];
        expect(row.groupCount).toBe(2); // g1, g2
        expect(row.studentCount).toBe(3); // 20001, 20002, 20003
        // The list call stays small: buckets and the rate ride single-user calls.
        expect(row).not.toHaveProperty('groups');
        expect(row).not.toHaveProperty('rate');
      });

      it('a single-user call lists the groups, biggest first, with their rate', async () => {
        const res = await service.getMonthly(
          { month: '2026-07', userId: 10001 },
          1,
          999,
        );

        const row = res.data[0];
        expect(row.groups).toEqual([
          {
            groupId: 'g1',
            name: 'A1-12',
            students: 2, // 20001, 20002 (20002 twice: still one student)
            lessons: 3, // 05.07, 12.07 and the gap lesson of 19.07
            amount: 24_000, // 3 × 6 000 written + 6 000 gap
            rate: { salaryType: 'PERCENTAGE', value: 30 },
          },
          {
            groupId: 'g2',
            name: 'B1-3',
            students: 1,
            lessons: 1,
            amount: 4_000,
            // The group's own rate wins over the global one.
            rate: { salaryType: 'FIXED_PER_STUDENT', value: 150_000 },
          },
        ]);
        expect(row.rate).toEqual({ salaryType: 'PERCENTAGE', value: 30 });
      });

      it('Σ group amounts + carriedIn = fullDeserved (the carried-in accrual is in no bucket)', async () => {
        const res = await service.getMonthly(
          { month: '2026-07', userId: 10001 },
          1,
          999,
        );

        const row = res.data[0];
        const sum = row.groups!.reduce((s, g) => s + g.amount, 0);
        expect(row.carriedIn).toBe(3_000);
        expect(row.fullDeserved).toBe(31_000);
        expect(sum + row.carriedIn).toBe(row.fullDeserved);
      });

      it('a pre-top-up month keeps the gap out of both fullDeserved and the buckets', async () => {
        const res = await service.getMonthly(
          { month: '2026-06', userId: 10001 },
          1,
          999,
        );

        const row = res.data[0];
        const sum = row.groups!.reduce((s, g) => s + g.amount, 0);
        expect(row.fullDeserved).toBe(25_000); // written accruals only
        expect(row.groups!.find((g) => g.groupId === 'g1')?.lessons).toBe(2);
        expect(sum + row.carriedIn).toBe(row.fullDeserved);
      });

      it('a teacher on a flat monthly salary has no group buckets and a null group rate', async () => {
        prisma.salaryAccrual.findMany.mockResolvedValue([]);
        prisma.attendance.findMany.mockResolvedValue([]);
        prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
          {
            salaryType: 'FIXED_MONTHLY',
            value: 4_000_000,
            effectiveFrom: new Date('2026-05-01'),
            effectiveTo: null,
            config: {
              userId: 10001,
              groupId: null,
              salaryType: 'FIXED_MONTHLY',
            },
          },
        ]);

        const res = await service.getMonthly(
          { month: '2026-07', userId: 10001 },
          1,
          999,
        );

        const row = res.data[0];
        expect(row.groups).toEqual([]);
        expect(row.groupCount).toBe(0);
        expect(row.studentCount).toBe(0);
        expect(row.rate).toEqual({
          salaryType: 'FIXED_MONTHLY',
          value: 4_000_000,
        });
      });

      it('a teacher with no global rate has a null rate', async () => {
        prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
          versions[1],
        ]);

        const res = await service.getMonthly(
          { month: '2026-07', userId: 10001 },
          1,
          999,
        );

        expect(res.data[0].rate).toBeNull();
      });
    });

    describe('attention', () => {
      it('lists a teacher with lessons that have no rate, with the lesson count', async () => {
        prisma.user.findMany.mockResolvedValue([teacher(10001, 'Madina', 'K')]);
        prisma.group.findMany.mockResolvedValue([
          { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
        ]);
        prisma.groupTeacher.findMany.mockResolvedValue([
          { groupId: 'g1', teacherId: 10001 },
        ]);
        // The rate only starts in August: July's lessons have none.
        prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
          {
            salaryType: 'PERCENTAGE',
            value: 30,
            effectiveFrom: new Date('2026-08-01'),
            effectiveTo: null,
            config: { userId: 10001, groupId: null, salaryType: 'PERCENTAGE' },
          },
        ]);
        prisma.attendance.findMany.mockResolvedValue(
          ['2026-07-10', '2026-07-12'].map((d, i) => ({
            id: `a${i}`,
            studentId: 20001,
            groupId: 'g1',
            date: new Date(d),
            status: 'PRESENT',
          })),
        );
        prisma.attendance.groupBy.mockResolvedValue([
          { studentId: 20001, groupId: 'g1', _count: { _all: 8 } },
        ]);

        const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

        expect(res.attention.lessonsWithoutRate).toEqual([
          { userId: 10001, firstName: 'Madina', lastName: 'K', units: 2 },
        ]);
      });

      it('lists nobody when every lesson has a rate', async () => {
        prisma.user.findMany.mockResolvedValue([teacher(10001, 'Madina')]);

        const res = await service.getMonthly({ month: '2026-07' }, 1, 999);

        expect(res.attention.lessonsWithoutRate).toEqual([]);
      });

      describe('staffWithoutRate', () => {
        const withoutRate = [
          { id: 10050, firstName: 'Dilnoza', lastName: 'Q' },
        ];
        // `user.findMany` serves two queries: the teacher roster and this one.
        const staffQuery = () =>
          prisma.user.findMany.mock.calls
            .map((c: any[]) => c[0])
            .find((a: any) => a.where.salaryConfigs);
        beforeEach(() => {
          prisma.user.findMany.mockImplementation(({ where }: any) =>
            Promise.resolve(where.salaryConfigs ? withoutRate : []),
          );
        });

        it('lists an active role-less employee with no fixed salary in the month', async () => {
          const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

          expect(res.attention.staffWithoutRate).toEqual([
            { userId: 10050, firstName: 'Dilnoza', lastName: 'Q' },
          ]);
        });

        it('asks for live, active staff — no Teacher, Student or CEO — with no FIXED_MONTHLY version over the month', async () => {
          const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

          const q = staffQuery();
          expect(q.where).toEqual({
            companyId: 1,
            deletedAt: null,
            status: 'ACTIVE',
            isActive: true,
            roles: {
              none: {
                role: { name: { in: ['Teacher', 'Student', 'CEO'] } },
              },
            },
            salaryConfigs: {
              none: {
                groupId: null,
                salaryType: 'FIXED_MONTHLY',
                versions: {
                  some: {
                    effectiveFrom: { lte: res.period.periodEnd },
                    OR: [
                      { effectiveTo: null },
                      { effectiveTo: { gt: res.period.periodStart } },
                    ],
                  },
                },
              },
            },
          });
          expect(q.select).toEqual({
            id: true,
            firstName: true,
            lastName: true,
          });
          expect(q.orderBy).toEqual({ firstName: 'asc' });
        });

        it('applies the branch of a Branch Director', async () => {
          prisma.user.findUnique.mockResolvedValue({
            mainBranch: 7,
            branches: [],
            roles: [{ role: { name: 'Branch Director' } }],
          });

          await service.getMonthly({ month: '2026-09' }, 1, 555);

          expect(staffQuery().where.branches).toEqual({
            some: { branchId: 7 },
          });
        });

        it('is skipped for a search, a single user and a caller with no branch', async () => {
          await service.getMonthly({ month: '2026-09', search: 'Dil' }, 1, 999);
          await service.getMonthly({ month: '2026-09', userId: 10050 }, 1, 999);
          prisma.user.findUnique.mockResolvedValue({
            mainBranch: null,
            branches: [],
            roles: [{ role: { name: 'Branch Director' } }],
          });
          const res = await service.getMonthly({ month: '2026-09' }, 1, 555);

          expect(staffQuery()).toBeUndefined();
          expect(res.attention.staffWithoutRate).toEqual([]);
        });

        it('is answered on the zero-teacher early return too', async () => {
          const res = await service.getMonthly({ month: '2026-09' }, 1, 999);

          expect(res.data).toEqual([]);
          expect(res.attention).toEqual({
            lessonsWithoutRate: [],
            staffWithoutRate: [
              { userId: 10050, firstName: 'Dilnoza', lastName: 'Q' },
            ],
          });
        });
      });
    });
  });
});
