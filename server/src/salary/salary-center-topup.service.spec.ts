import { Test, TestingModule } from '@nestjs/testing';
import { SalaryCenterTopUpService } from './salary-center-topup.service';
import { SalaryMonthlyService } from './salary-monthly.service';
import { SalaryStaffMonthlyService } from './salary-monthly-staff.service';
import { PrismaService } from '../prisma/prisma.service';
import { DebtAgeService } from '../common/finance/debt-age.service';

/**
 * The "Qolgan (markaz)" drill-down: which students the center is still owed by
 * for a month's payroll top-up.
 *
 * The load-bearing property is that its `centerPaid` total equals the card's
 * `centerStillFronted` — the drill-down explains a number the user is already
 * looking at, so a figure of its own would just be a second, contradictory
 * answer. The last test pins that equality by running both services over one
 * set of accruals.
 */
describe('SalaryCenterTopUpService', () => {
  let service: SalaryCenterTopUpService;
  let prisma: any;
  // The debt-month breakdown comes from the shared day-cached replay; these
  // tests are about the accrual grouping, so it answers empty by default.
  let debtAge: { getDebtAges: jest.Mock };

  const ceoCaller = { mainBranch: 1, roles: [{ role: { name: 'CEO' } }] };

  const accrual = (over: Partial<Record<string, unknown>> = {}) => ({
    userId: 500,
    studentId: 10001,
    groupId: 'g1',
    amount: 20_000,
    perLessonCost: 33_333,
    lessonDate: new Date('2026-07-10'),
    creditPeriodDate: null,
    isCenterTopUp: true,
    wasCenterTopUp: true,
    attendanceId: 'a1',
    ...over,
  });

  const student = (
    id: number,
    over: Partial<Record<string, unknown>> = {},
  ) => ({
    id,
    firstName: 'O',
    lastName: `Q${id}`,
    phone: '901234567',
    balance: -400_000,
    status: 'ACTIVE',
    ...over,
  });

  beforeEach(async () => {
    debtAge = { getDebtAges: jest.fn().mockResolvedValue(new Map()) };
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
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 500, firstName: 'Ustoz', lastName: 'Bir' },
          ]),
      },
      salaryAccrual: { findMany: jest.fn().mockResolvedValue([]) },
      // The forecast sweep runs only when a month has no written accruals yet;
      // these answer empty so these tests stay about the settled path.
      attendance: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
      lessonTeacherOverride: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      student: { findMany: jest.fn().mockResolvedValue([]) },
      // How much of each fronted lesson is still unpaid. Empty by default: no
      // deduction row means nothing has been paid against the lesson, so the
      // centre's whole advance is still out — the state these tests describe.
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      group: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'g1', name: '#001' },
          { id: 'g2', name: '#002' },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryCenterTopUpService,
        { provide: PrismaService, useValue: prisma },
        { provide: DebtAgeService, useValue: debtAge },
      ],
    }).compile();

    service = module.get(SalaryCenterTopUpService);
  });

  it('spans every month when asked, and says which months each debt came from', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValue([
      accrual({ lessonDate: new Date('2026-07-10') }),
      accrual({ lessonDate: new Date('2026-07-20'), attendanceId: 'a2' }),
      accrual({ lessonDate: new Date('2026-08-05'), attendanceId: 'a3' }),
    ]);
    prisma.student.findMany.mockResolvedValue([student(10001)]);

    const res = await service.getStudents(
      { month: '2026-08', allMonths: true },
      1001,
      1,
    );

    // The period predicate is dropped entirely — a debt is one debt, and
    // scoping to the picked month is what opened the page on an empty August.
    const where = prisma.salaryAccrual.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();

    expect(res.data[0].months).toEqual([
      { monthKey: '2026-07', lessons: 2, centerPaid: 40_000 },
      { monthKey: '2026-08', lessons: 1, centerPaid: 20_000 },
    ]);
    expect(res.totals.monthKeys).toEqual(['2026-07', '2026-08']);
    expect(res.totals.lessonCount).toBe(3);
  });

  it('asks only for accruals the center is STILL fronting', async () => {
    await service.getStudents({ month: '2026-07' }, 1001, 1);

    const where = prisma.salaryAccrual.findMany.mock.calls[0][0].where;
    // `isCenterTopUp`, not `wasCenterTopUp`: the sticky flag would re-list every
    // student who has already paid the center back.
    expect(where.isCenterTopUp).toBe(true);
    expect(where.reversedAt).toBeNull();
    expect(where.userId).toEqual({ in: [500] });
    // Carry-over OR — an accrual credited into this period counts here even
    // though its lesson fell in an earlier month.
    expect(where.OR).toHaveLength(2);
    expect(where.OR[1].creditPeriodDate).toBeNull();
  });

  it('groups lessons per student and sums both the center cost and the debt', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValue([
      accrual(),
      accrual({ lessonDate: new Date('2026-07-20'), attendanceId: 'a2' }),
      accrual({
        studentId: 10002,
        groupId: 'g2',
        amount: 5_000,
        perLessonCost: 9_000,
      }),
    ]);
    prisma.student.findMany.mockResolvedValue([student(10001), student(10002)]);

    const res = await service.getStudents({ month: '2026-07' }, 1001, 1);

    expect(res.totals).toMatchObject({
      centerPaid: 45_000,
      studentOwed: 75_666,
      lessonCount: 3,
      studentCount: 2,
    });
    // Biggest center exposure first — the order a recovery call list is worked.
    expect(res.data[0].student.id).toBe(10001);
    expect(res.data[0].lessons).toBe(2);
    expect(res.data[0].centerPaid).toBe(40_000);
    expect(res.data[0].studentOwed).toBe(66_666);
    expect(res.data[0].firstLesson).toEqual(new Date('2026-07-10'));
    expect(res.data[0].lastLesson).toEqual(new Date('2026-07-20'));
    expect(res.data[0].groups).toEqual([{ id: 'g1', name: '#001' }]);
    expect(res.data[0].teachers).toEqual([{ id: 500, name: 'Ustoz Bir' }]);
  });

  it('counts non-ACTIVE students, whose share billing will never recover', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValue([
      accrual(),
      accrual({ studentId: 10002 }),
      accrual({ studentId: 10003 }),
    ]);
    prisma.student.findMany.mockResolvedValue([
      student(10001, { status: 'ACTIVE' }),
      student(10002, { status: 'FROZEN' }),
      student(10003, { status: 'EXPELLED' }),
    ]);

    const res = await service.getStudents({ month: '2026-07' }, 1001, 1);

    expect(res.totals.studentCount).toBe(3);
    expect(res.totals.inactiveStudentCount).toBe(2);
  });

  it('confines a branch-bound caller with no branch to nothing', async () => {
    prisma.user.findUnique.mockResolvedValue({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'Branch Director' } }],
    });
    prisma.user.findMany.mockResolvedValue([]);

    const res = await service.getStudents({ month: '2026-07' }, 1001, 1);

    // Fails CLOSED — an unresolvable branch shows nothing, never everything.
    expect(res.data).toEqual([]);
    expect(res.totals.centerPaid).toBe(0);
    expect(prisma.salaryAccrual.findMany).not.toHaveBeenCalled();
  });

  it('drops an accrual whose student record is missing rather than naming nobody', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValue([
      accrual(),
      accrual({ studentId: 99999 }),
    ]);
    prisma.student.findMany.mockResolvedValue([student(10001)]);

    const res = await service.getStudents({ month: '2026-07' }, 1001, 1);

    expect(res.data).toHaveLength(1);
    expect(res.totals.studentCount).toBe(1);
  });

  it('totals the same figure the salary card shows as "Qolgan (markaz)"', async () => {
    const rows = [
      accrual(),
      accrual({ amount: 12_500, attendanceId: 'a2' }),
      accrual({ studentId: 10002, amount: 7_500 }),
      // Already recovered — on the card it belongs to X and Y, never to Z, and
      // here it must not appear at all.
      accrual({ studentId: 10003, amount: 90_000, isCenterTopUp: false }),
    ];

    // The card's side of the equality, over the same rows.
    const monthlyPrisma = {
      ...prisma,
      user: {
        findUnique: jest.fn().mockResolvedValue(ceoCaller),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 500,
            firstName: 'Ustoz',
            lastName: 'Bir',
            isActive: true,
            branches: [],
          },
        ]),
      },
      salaryAccrual: {
        findMany: jest.fn().mockResolvedValue(rows),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      attendance: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      student: { findMany: jest.fn().mockResolvedValue([]) },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
      lessonTeacherOverride: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      expense: { groupBy: jest.fn().mockResolvedValue([]) },
      salaryPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const monthlyModule: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryMonthlyService,
        { provide: PrismaService, useValue: monthlyPrisma },
        {
          provide: SalaryStaffMonthlyService,
          useValue: {
            computeStaff: jest.fn().mockResolvedValue({
              staff: [],
              staffTotals: { monthly: 0, advances: 0, netToPay: 0 },
            }),
          },
        },
      ],
    }).compile();
    const card = await monthlyModule
      .get(SalaryMonthlyService)
      .getMonthly({ month: '2026-07' }, 1001, 1);

    // The drill-down's side. Its query filters `isCenterTopUp` in the DB, so the
    // recovered row is pre-removed here the way Postgres would remove it.
    prisma.salaryAccrual.findMany.mockResolvedValue(
      rows.filter((r) => r.isCenterTopUp),
    );
    prisma.student.findMany.mockResolvedValue([student(10001), student(10002)]);
    const drill = await service.getStudents({ month: '2026-07' }, 1001, 1);

    expect(card.totals.centerStillFronted).toBe(40_000);
    expect(drill.totals.centerPaid).toBe(card.totals.centerStillFronted);
  });

  it('reports the debt the student profile shows, never a monthly slice', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValue([
      accrual(), // perLessonCost 33 333
      accrual({ attendanceId: 'a2' }),
      accrual({ studentId: 10002, attendanceId: 'a3' }),
      accrual({ studentId: 10003, attendanceId: 'a4' }),
    ]);
    prisma.student.findMany.mockResolvedValue([
      // Owes LESS than the two lessons cost — he has paid since. Reporting the
      // lesson cost (66 666) is the #10026 defect: twice the real figure.
      student(10001, { balance: -20_000 }),
      // Owes MORE than this month's one lesson. Capping at the lesson cost is
      // the #10058 defect: the row said 466 662, the profile said 624 989.
      student(10002, { balance: -500_000 }),
      // Cleared: nothing to collect, never listed.
      student(10003, { balance: 5_000 }),
    ]);

    const res = await service.getStudents({ month: '2026-07' }, 1001, 1);

    const byId = new Map(res.data.map((r) => [r.student.id, r]));
    expect(byId.get(10001)!.studentDebt).toBe(20_000);
    expect(byId.get(10002)!.studentDebt).toBe(500_000);
    // Cleared: nothing left to bring in, so the row is not on a call list at
    // all. Its spend still counts in the totals, which describe the month.
    expect(byId.has(10003)).toBe(false);
    expect(res.totals.studentDebt).toBe(520_000);
    // Biggest RECOVERABLE amount first — the order a call list is worked.
    // Both cap at 20 000 here (#10001 by his balance, #10002 by his single
    // lesson), so the tiebreak decides, and it is the larger total debt: of
    // two calls worth the same to the centre, make the bigger one first.
    expect(res.data.map((r) => r.centerUnrecovered)).toEqual([20_000, 20_000]);
    expect(res.data[0].student.id).toBe(10002);
  });

  it('caps what the centre can still get back at what the lesson still owes', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValue([
      accrual({ studentId: 10001, attendanceId: 'a1' }),
      accrual({ studentId: 10002, attendanceId: 'a2' }),
    ]);
    prisma.student.findMany.mockResolvedValue([
      student(10001, { balance: -329 }),
      student(10002, { balance: -50_000 }),
    ]);
    prisma.transaction.findMany.mockResolvedValue([
      // Paid all but 329 of a 33 333 lesson: the centre's 20 000 came back with
      // that payment, so at most 329 of it is still out. Production #10593.
      { attendanceId: 'a1', metadata: { uncoveredAmount: 329 } },
      // Settled to the last so'm — the accrual flag has simply not caught up.
      { attendanceId: 'a2', metadata: { uncoveredAmount: 0 } },
    ]);

    const res = await service.getStudents({ month: '2026-07' }, 1001, 1);

    expect(res.data).toHaveLength(1);
    expect(res.data[0].student.id).toBe(10001);
    expect(res.data[0].centerUnrecovered).toBe(329);
    // The spend itself is untouched by any of this — it is what left the till.
    expect(res.data[0].centerPaid).toBe(20_000);
    // ...and the month's total still matches the card the drill-down opens
    // from, repaid students included.
    expect(res.totals.centerPaid).toBe(40_000);
    expect(res.totals.centerUnrecovered).toBe(329);
  });

  it('never claims back more than the student owes in total', async () => {
    prisma.salaryAccrual.findMany.mockResolvedValue([
      accrual({ studentId: 10001, attendanceId: 'a1' }),
      accrual({ studentId: 10001, attendanceId: 'a2' }),
      accrual({ studentId: 10002, attendanceId: 'a3' }),
    ]);
    prisma.student.findMany.mockResolvedValue([
      // Paid down to 5 000 — the per-lesson metadata still reads unpaid because
      // their deferred settlement has not run, so without the balance cap the
      // row would ask for 40 000 from someone owing 5 000.
      student(10001, { balance: -5_000 }),
      // Settled in full: the centre's money is back, whatever the flag says.
      student(10002, { balance: 0 }),
    ]);
    // Metadata says nothing has been paid on any of the three lessons.
    prisma.transaction.findMany.mockResolvedValue([]);

    const res = await service.getStudents({ month: '2026-07' }, 1001, 1);

    expect(res.data).toHaveLength(1);
    expect(res.data[0].student.id).toBe(10001);
    expect(res.data[0].centerUnrecovered).toBe(5_000);
    // The spend is a fact about the past and stays whole, for both students...
    expect(res.totals.centerPaid).toBe(60_000);
    // ...and the page can say why it exceeds the rows on screen.
    expect(res.totals.repaidStudentCount).toBe(1);
  });
});
