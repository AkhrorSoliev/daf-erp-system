import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ReportsOverviewService } from './reports-overview.service';
import { ReportsAttendanceAnalyticsService } from './reports-attendance-analytics.service';
import { ReportsFinancialService } from './reports-financial.service';
import { ReportsDebtHistoryService } from './reports-debt-history.service';
import { ReportsPaymentsService } from './reports-payments.service';
import { ReportsStudentPaymentsService } from './reports-student-payments.service';
import { ReportsDepartedReasonsService } from './reports-departed-reasons.service';
import { ReportsTeacherChangesService } from './reports-teacher-changes.service';
import { ReportsProfitLossService } from './reports-profit-loss.service';
import { ReportsCashFlowService } from './reports-cash-flow.service';
import { ReportsBalanceSheetService } from './reports-balance-sheet.service';
import { ExpensesService } from '../expenses/expenses.service';
import { SalaryPaymentService } from '../salary/salary-payment.service';
import { SalaryService } from '../salary/salary.service';
import { PaymentsDebtorsService } from '../payments/payments-debtors.service';
import { loadTeacherChangeDepartures } from './shared/teacher-change-departures';
import { tashkentRangeUtc } from '../common/date/tashkent';
import { DEPARTURE_GRACE_DAYS } from '../students/shared/departure-episodes';
import {
  resolveMonthlyScope,
  type SalaryMonthlyQuery,
} from '../salary/shared/resolve-monthly-scope';
import {
  countRows,
  markOf,
  rateOf,
} from './attendance-stats/attendance-counts';

const kpiMarks = (
  n: number,
  status: string,
  cancellationId: string | null = null,
) =>
  Array.from({ length: n }, () => ({
    date: new Date('2026-10-01T00:00:00.000Z'),
    status,
    cancellationId,
  }));

/**
 * One teacher change (5 March, 10:00 Tashkent) in group g1 whose five lessons
 * after it fall on 6, 8, 10, 12 and 14 March — the window closes on the 14th.
 * Shaped like the rows the database returns for `loadTeacherChangeDepartures`
 * (DROPPED/FROZEN enrollments of the group, with their state log):
 * - e1 froze inside the window and was dropped after it (its group closed);
 * - e2 froze before the change and was dropped inside the window;
 * - e3 froze inside the window and is still frozen.
 */
function mockTeacherChangeDepartures(prisma: any) {
  const d = (iso: string) => new Date(iso);
  prisma.groupTeacherHistory.findMany.mockResolvedValue([
    {
      id: 'ch1',
      groupId: 'g1',
      previousTeacherIds: [30001],
      newTeacherIds: [30002],
      createdAt: d('2026-03-05T05:00:00Z'),
    },
  ]);
  prisma.attendance.findMany.mockResolvedValue(
    ['06', '08', '10', '12', '14'].map((day) => ({
      date: d(`2026-03-${day}T00:00:00Z`),
    })),
  );
  const row = (
    id: string,
    studentId: number,
    firstName: string,
    status: 'DROPPED' | 'FROZEN',
    log: [string, string][],
    departureReason: { name: string } | null = null,
  ) => ({
    id,
    studentId,
    groupId: 'g1',
    status,
    createdAt: d('2026-02-01T07:00:00Z'),
    statusChangedAt: d(log[log.length - 1][1]),
    student: { firstName, lastName: 'V' },
    group: { name: 'B1-01', branch: { name: 'Bosh' } },
    departureReason,
    stateLog: log.map(([st, when]) => ({ status: st, transitionAt: d(when) })),
  });
  prisma.enrollment.findMany.mockResolvedValue([
    row('e1', 10001, 'Ali', 'DROPPED', [
      ['ACTIVE', '2026-02-01T07:00:00Z'],
      ['FROZEN', '2026-03-09T07:00:00Z'],
      ['DROPPED', '2026-03-20T07:00:00Z'],
    ]),
    row('e2', 10002, 'Vali', 'DROPPED', [
      ['ACTIVE', '2026-02-01T07:00:00Z'],
      ['FROZEN', '2026-02-20T07:00:00Z'],
      ['DROPPED', '2026-03-07T07:00:00Z'],
    ]),
    row(
      'e3',
      10003,
      'Gani',
      'FROZEN',
      [
        ['ACTIVE', '2026-02-01T07:00:00Z'],
        ['FROZEN', '2026-03-11T07:00:00Z'],
      ],
      { name: "Vaqt to'g'ri kelmadi" },
    ),
  ]);
}

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    prisma = {
      student: {
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn(),
      },
      enrollmentStateLog: { findMany: jest.fn().mockResolvedValue([]) },
      statusHistory: { findMany: jest.fn().mockResolvedValue([]) },
      // systemStartDate floor lookup — default null = no floor (legacy behaviour).
      company: {
        findUnique: jest.fn().mockResolvedValue({ systemStartDate: null }),
      },
      group: {
        count: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      enrollment: {
        count: jest.fn(),
        findFirst: jest.fn(),
        // Default to [] so loadEnrollmentsForCounts in the analytics service
        // doesn't iterate over `undefined`. Tests that need specific snapshots
        // override this via mockResolvedValueOnce.
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn(),
      },
      contract: { findMany: jest.fn() },
      studentExitReason: { findMany: jest.fn() },
      course: { findMany: jest.fn() },
      $transaction: jest.fn(),
      attendance: {
        groupBy: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      room: { findMany: jest.fn() },
      groupTeacher: { findMany: jest.fn() },
      lead: {
        count: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      payment: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        count: jest.fn(),
      },
      refund: { aggregate: jest.fn(), count: jest.fn() },
      transaction: { aggregate: jest.fn(), count: jest.fn() },
      branch: { findMany: jest.fn() },
      user: { findMany: jest.fn(), findFirst: jest.fn() },
      groupTeacherHistory: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      groupTeacherChangeReason: { findMany: jest.fn().mockResolvedValue([]) },
      enrollmentTransferReason: { findMany: jest.fn().mockResolvedValue([]) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      // «Bu oy hisoblandi» (overview of a billed month): nobody charged → zeros.
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.enrollment.groupBy = jest.fn();
    prisma.enrollment.findMany = jest.fn().mockResolvedValue([]);

    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
    };

    const holidaysService = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
      buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
      getActiveHolidaysInRange: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        ReportsOverviewService,
        ReportsAttendanceAnalyticsService,
        ReportsFinancialService,
        ReportsDebtHistoryService,
        ReportsPaymentsService,
        ReportsStudentPaymentsService,
        ReportsDepartedReasonsService,
        ReportsTeacherChangesService,
        ReportsProfitLossService,
        ReportsCashFlowService,
        ReportsBalanceSheetService,
        { provide: ExpensesService, useValue: {} },
        { provide: SalaryPaymentService, useValue: {} },
        { provide: SalaryService, useValue: {} },
        { provide: PaymentsDebtorsService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        {
          provide: require('../holidays/holidays.service').HolidaysService,
          useValue: holidaysService,
        },
        {
          provide: require('./reports-expectation-history.service')
            .ReportsExpectationHistoryService,
          useValue: {
            getMonthlyHistory: jest.fn().mockResolvedValue({
              month: '2026-08',
              branchId: null,
              points: [],
            }),
          },
        },
        {
          // The overview folds «Oy oxiriga kutilyapti» in; its own maths is
          // covered by reports-expectation.service.spec.ts.
          provide: require('./reports-expectation.service')
            .ReportsExpectationService,
          useValue: {
            getMonthlyExpectation: jest.fn().mockResolvedValue({
              month: '2026-08',
              heldValue: 0,
              heldLessons: 0,
              remainingValue: 0,
              remainingLessons: 0,
              expectedValue: 0,
            }),
          },
        },
        {
          // Own maths covered by reports-student-flow.service.spec.ts.
          provide: require('./reports-student-flow.service')
            .ReportsStudentFlowService,
          useValue: { getStudentFlow: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ReportsService);
  });

  describe('getKpis', () => {
    it('should return KPI data with correct structure', async () => {
      prisma.student.count
        .mockResolvedValueOnce(50) // activeStudents
        .mockResolvedValueOnce(45) // lastMonthActive
        .mockResolvedValueOnce(5); // new students

      prisma.group.count.mockResolvedValue(10);

      prisma.attendance.findMany.mockResolvedValue([
        ...kpiMarks(80, 'PRESENT'),
        ...kpiMarks(15, 'ABSENT'),
        ...kpiMarks(5, 'LATE'),
      ]);

      prisma.lead.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(20); // converted

      const result = await service.getKpis(1, {});

      expect(result).toEqual({
        activeStudents: { current: 50, trend: 11 },
        activeGroups: 10,
        averageAttendance: 85,
        leadConversionRate: 20,
        newStudentsThisMonth: 5,
        churnedThisMonth: 0,
        pendingDepartures: 0,
        departureGraceDays: DEPARTURE_GRACE_DAYS,
      });
    });

    it('should calculate attendance percentage excluding EXCUSED lessons', async () => {
      prisma.student.count
        .mockResolvedValueOnce(50) // activeStudents
        .mockResolvedValueOnce(45) // lastMonthActive
        .mockResolvedValueOnce(5); // new students

      prisma.group.count.mockResolvedValue(10);

      prisma.attendance.findMany.mockResolvedValue([
        ...kpiMarks(70, 'PRESENT'),
        ...kpiMarks(10, 'LATE'),
        ...kpiMarks(10, 'ABSENT'),
        ...kpiMarks(10, 'EXCUSED'),
      ]);

      prisma.lead.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(20); // converted

      const result = await service.getKpis(1, {});

      expect(result.averageAttendance).toBe(88.9); // 80 / 90, one decimal (the report's rateOf)
    });

    it('should handle zero students gracefully', async () => {
      prisma.student.count.mockResolvedValue(0);
      prisma.group.count.mockResolvedValue(0);
      prisma.enrollment.count.mockResolvedValue(0);
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      const result = await service.getKpis(1, {});

      expect(result.activeStudents.trend).toBe(0);
      expect(result.averageAttendance).toBeNull(); // no mark: «—», never 0%
      expect(result.leadConversionRate).toBe(0);
    });

    it("the home rate is the report's own function: a cancelled lesson counts nowhere", async () => {
      const rows = [
        ...kpiMarks(8, 'PRESENT'),
        ...kpiMarks(2, 'ABSENT'),
        ...kpiMarks(5, 'EXCUSED', 'c1'),
      ];
      prisma.attendance.findMany.mockResolvedValue(rows);
      prisma.student.count.mockResolvedValue(0);
      prisma.group.count.mockResolvedValue(0);
      prisma.lead.count.mockResolvedValue(0);
      const result = await service.getKpis(1, {});
      expect(result.averageAttendance).toBe(
        rateOf(countRows(rows.map((r) => markOf(r as never)))),
      );
      expect(result.averageAttendance).toBe(80);
    });

    it('reads the current Tashkent month, 1st to today, in the picked branch', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-31T19:30:00.000Z')); // 01.11 00:30 in Tashkent
      try {
        prisma.attendance.findMany.mockResolvedValue([]);
        prisma.student.count.mockResolvedValue(0);
        prisma.group.count.mockResolvedValue(0);
        prisma.lead.count.mockResolvedValue(0);
        await service.getKpis(1, { branchId: 4 });
        const call = prisma.attendance.findMany.mock.calls.find(
          (c: any[]) => c[0]?.select?.cancellationId,
        );
        expect(call[0].where).toEqual({
          companyId: 1,
          date: {
            gte: new Date('2026-11-01T00:00:00.000Z'),
            lt: new Date('2026-11-02T00:00:00.000Z'),
          },
          group: { branchId: { in: [4] } },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    // RULING C — voronka konversiyasi faqat voronka lidlarini sanaydi.
    // To'g'ridan qo'shilgan o'quvchining avtomatik lidida `sectionId` `null`;
    // u ham surat, ham maxrajga tushsa foiz 100 % ga siljiydi (prodda nisbat
    // taxminan 408 to'g'ridan / 34 voronkadan — signal 12:1 bo'g'ilardi).
    it("konversiya foizidan to'g'ridan kirgan lidlar chiqariladi", async () => {
      prisma.student.count.mockResolvedValue(0);
      prisma.group.count.mockResolvedValue(0);
      prisma.enrollment.count.mockResolvedValue(0);
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.getKpis(1, {});

      const leadWheres = prisma.lead.count.mock.calls.map(
        (c: any[]) => c[0].where,
      );
      expect(leadWheres).toHaveLength(2);
      for (const where of leadWheres) {
        expect(where.sectionId).toEqual({ not: null });
      }
    });
  });

  describe('getRoomUtilization', () => {
    it('should return cached data if available', async () => {
      const cached = { rooms: [], summary: {} };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getRoomUtilization(1, {});
      expect(result).toEqual(cached);
      expect(prisma.room.findMany).not.toHaveBeenCalled();
    });

    it('should compute room utilization and cache it', async () => {
      prisma.room.findMany.mockResolvedValue([
        { id: 'r1', name: 'Room 1', capacity: 20, branchId: 1 },
      ]);

      prisma.group.findMany.mockResolvedValue([
        {
          id: 'g1',
          roomId: 'r1',
          lessonStartTime: '09:00',
          lessonEndTime: '10:30',
          exactDays: ['monday', 'wednesday', 'friday'],
          enrollments: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
        },
      ]);

      const result = await service.getRoomUtilization(1, {});

      expect(result.rooms).toHaveLength(1);
      expect(result.rooms[0].name).toBe('Room 1');
      expect(result.rooms[0].hoursPerWeek).toBe(4.5);
      expect(result.rooms[0].fillRate).toBe(15); // 3/20 = 15%
      expect(result.rooms[0].totalGroups).toBe(1);
      expect(redis.setex).toHaveBeenCalled();
    });
  });

  describe('getTeacherPerformance', () => {
    it('should return cached data if available', async () => {
      const cached = { teachers: [] };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getTeacherPerformance(1, {});
      expect(result).toEqual(cached);
    });

    it('should compute teacher performance', async () => {
      prisma.groupTeacher.findMany.mockResolvedValue([
        {
          teacherId: 10001,
          groupId: 'g1',
          teacher: {
            id: 10001,
            firstName: 'Ali',
            lastName: 'Valiyev',
            photo: null,
          },
          group: {
            id: 'g1',
            roomId: 'r1',
            room: { capacity: 20 },
            enrollments: Array(15).fill({ id: 'e' }),
          },
        },
      ]);

      prisma.attendance.groupBy.mockResolvedValue([
        { groupId: 'g1', status: 'PRESENT', _count: { id: 40 } },
        { groupId: 'g1', status: 'ABSENT', _count: { id: 10 } },
      ]);

      prisma.enrollment.findMany.mockResolvedValue(
        Array.from({ length: 15 }, () => ({
          groupId: 'g1',
          createdAt: new Date('2024-01-01'),
          status: 'ACTIVE',
          statusChangedAt: null,
        })),
      );

      const result = await service.getTeacherPerformance(1, {});

      expect(result.teachers).toHaveLength(1);
      expect(result.teachers[0].firstName).toBe('Ali');
      expect(result.teachers[0].groupsCount).toBe(1);
      expect(result.teachers[0].averageAttendance).toBe(80);
      expect(result.teachers[0].averageFillRate).toBe(75);
    });
  });

  describe('getAttendanceAnalytics', () => {
    it('should compute overall rate and trends', async () => {
      const monday = new Date('2026-04-06');
      const tuesday = new Date('2026-04-07');

      prisma.attendance.groupBy
        .mockResolvedValueOnce([
          { date: monday, status: 'PRESENT', _count: { id: 30 } },
          { date: monday, status: 'ABSENT', _count: { id: 10 } },
          { date: tuesday, status: 'PRESENT', _count: { id: 25 } },
          { date: tuesday, status: 'LATE', _count: { id: 5 } },
          { date: tuesday, status: 'ABSENT', _count: { id: 10 } },
        ])
        .mockResolvedValueOnce([
          { groupId: 'g1', status: 'PRESENT', _count: { id: 20 } },
          { groupId: 'g1', status: 'ABSENT', _count: { id: 10 } },
        ]);

      prisma.group.findMany.mockResolvedValue([{ id: 'g1', name: 'Group A' }]);

      const result = await service.getAttendanceAnalytics(1, {});

      expect(result.overallRate).toBe(75); // 60/80
      expect(result.worstGroups).toHaveLength(1);
      expect(result.worstGroups[0].groupName).toBe('Group A');
    });
  });

  describe('getGroupAnalytics', () => {
    it('should return status distribution and fill rates', async () => {
      prisma.group.groupBy.mockResolvedValue([
        { statusEnum: 'ACTIVE', _count: { id: 8 } },
        { statusEnum: 'FORMING', _count: { id: 3 } },
        { statusEnum: 'COMPLETED', _count: { id: 2 } },
      ]);

      prisma.group.findMany.mockResolvedValue([
        {
          id: 'g1',
          name: 'A1',
          statusEnum: 'ACTIVE',
          roomId: 'r1',
          room: { capacity: 20 },
          enrollments: Array(15).fill({ id: 'e' }),
        },
        {
          id: 'g2',
          name: 'B1',
          statusEnum: 'FORMING',
          roomId: 'r2',
          room: { capacity: 15 },
          enrollments: Array(5).fill({ id: 'e' }),
        },
      ]);

      const result = await service.getGroupAnalytics(1, {});

      expect(result.statusDistribution).toHaveLength(3);
      expect(result.fillRates).toHaveLength(2);
      expect(result.formingGroups).toHaveLength(1);
      expect(result.formingGroups[0].groupName).toBe('B1');
    });
  });

  describe('getLeadAnalytics', () => {
    it('should return funnel and conversion data', async () => {
      prisma.lead.groupBy.mockResolvedValue([
        { statusEnum: 'NEW', _count: { id: 30 } },
        { statusEnum: 'CONTACTED', _count: { id: 20 } },
        { statusEnum: 'CONVERTED', _count: { id: 10 } },
        { statusEnum: 'LOST', _count: { id: 5 } },
      ]);

      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 86400000);
      prisma.lead.findMany
        .mockResolvedValueOnce([
          { createdAt: tenDaysAgo, statusChangedAt: now },
          { createdAt: tenDaysAgo, statusChangedAt: now },
        ])
        .mockResolvedValueOnce([
          { createdAt: tenDaysAgo, statusEnum: 'CONVERTED' },
          { createdAt: tenDaysAgo, statusEnum: 'NEW' },
        ]);

      const result = await service.getLeadAnalytics(1, { branchIds: null });

      expect(result.funnel).toHaveLength(4);
      expect(result.averageDaysToConversion).toBe(10);
    });

    it('should handle no converted leads', async () => {
      prisma.lead.groupBy.mockResolvedValue([
        { statusEnum: 'NEW', _count: { id: 5 } },
      ]);
      prisma.lead.findMany.mockResolvedValue([]);

      const result = await service.getLeadAnalytics(1, { branchIds: null });

      expect(result.averageDaysToConversion).toBeNull();
    });

    // RULING C — voronka ko'rsatkichlarining HAMMASI (voronka taqsimoti,
    // oylik konversiya foizi va aylanishgacha o'rtacha kun) faqat voronkadan
    // o'tgan lidlarni oladi. `sectionId: null` = to'g'ridan /students eshigidan
    // kirgan, doskaga umuman tushmagan odam.
    it("voronka ko'rsatkichlaridan to'g'ridan kirgan lidlar chiqariladi", async () => {
      prisma.lead.groupBy.mockResolvedValue([]);
      prisma.lead.findMany.mockResolvedValue([]);

      await service.getLeadAnalytics(1, { branchIds: null });

      const groupByWhere = prisma.lead.groupBy.mock.calls[0][0].where;
      expect(groupByWhere.sectionId).toEqual({ not: null });

      const findManyWheres = prisma.lead.findMany.mock.calls.map(
        (c: any[]) => c[0].where,
      );
      expect(findManyWheres).toHaveLength(2);
      for (const where of findManyWheres) {
        expect(where.sectionId).toEqual({ not: null });
      }
    });
  });

  describe('getDepartedAfterTeacherChangeList', () => {
    it('lists who left within 5 lessons, dated by the stop that started their absence', async () => {
      mockTeacherChangeDepartures(prisma);
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 30001, firstName: 'Eski', lastName: 'Ustoz' },
        { id: 30002, firstName: 'Yangi', lastName: 'Ustoz' },
      ]);

      const rows = await service.getDepartedAfterTeacherChangeList(1, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      const common = {
        groupId: 'g1',
        groupName: 'B1-01',
        branchName: 'Bosh',
        teacherChangeAt: new Date('2026-03-05T05:00:00Z'),
        previousTeachers: ['Eski Ustoz'],
        newTeachers: ['Yangi Ustoz'],
      };
      expect(rows).toEqual([
        {
          ...common,
          enrollmentId: 'e3',
          studentId: 10003,
          studentName: 'Gani V',
          departedAt: new Date('2026-03-11T07:00:00Z'),
          departureStatus: 'FROZEN',
          lessonNumber: 4,
          departureReason: "Vaqt to'g'ri kelmadi",
        },
        {
          ...common,
          enrollmentId: 'e1',
          studentId: 10001,
          studentName: 'Ali V',
          departedAt: new Date('2026-03-09T07:00:00Z'),
          departureStatus: 'FROZEN',
          lessonNumber: 3,
          departureReason: null,
        },
      ]);
      // Counts both DROPPED (guruhsiz qoldi) and FROZEN (muzlatildi).
      const enrWhere = prisma.enrollment.findMany.mock.calls[0][0].where;
      expect(enrWhere.status).toEqual({ in: ['DROPPED', 'FROZEN'] });
    });

    it('with a course and teacher filter, the list and the changes behind the card match the overview card', async () => {
      const filter = {
        courseId: [
          '3f2a8c1e-0000-4000-8000-000000000001',
          '3f2a8c1e-0000-4000-8000-000000000002',
        ],
        teacherIds: [30001, 30002],
      };
      const range = { startDate: '2026-03-01', endDate: '2026-03-31' };
      mockTeacherChangeDepartures(prisma);
      prisma.user.findMany.mockResolvedValue([]);

      // What the card counts: the loader with the page's filter.
      const { gte: start, lt: end } = tashkentRangeUtc(
        range.startDate,
        range.endDate,
      );
      const card = await loadTeacherChangeDepartures(prisma, 1, {
        scope: null,
        start,
        end,
        groupFilter: {
          courseIds: filter.courseId,
          teacherIds: filter.teacherIds,
        },
      });
      const cardWhere =
        prisma.groupTeacherHistory.findMany.mock.calls[0][0].where;
      expect(cardWhere.group).toMatchObject({
        courseId: { in: filter.courseId },
        teachers: { some: { teacherId: { in: filter.teacherIds } } },
      });
      prisma.groupTeacherHistory.findMany.mockClear();

      const departures = await service.getDepartedAfterTeacherChangeList(1, {
        ...filter,
        ...range,
      });
      // The changes list reads the same rows, with the group they belong to.
      prisma.groupTeacherHistory.findMany.mockResolvedValueOnce(
        card.changes.map((c) => ({
          ...c,
          changeType: 'REPLACED',
          triggeredByDismissal: false,
          changeReasonId: null,
          group: {
            id: c.groupId,
            name: 'B1-01',
            branch: { id: 1, name: 'Bosh' },
            course: { id: 'c1', name: 'A1' },
          },
          changedBy: null,
          changeReasonRef: null,
        })),
      );
      const changes = await service.getTeacherChangesList(1, {
        ...filter,
        ...range,
      });

      // Both dialogs filter by exactly what the card filtered by.
      const [departedCall, changesCall] =
        prisma.groupTeacherHistory.findMany.mock.calls;
      expect(departedCall[0].where).toEqual(cardWhere);
      expect(changesCall[0].where).toEqual(cardWhere);
      expect(card.departures.length).toBeGreaterThan(0);
      expect(departures).toHaveLength(card.departures.length);
      expect(changes).toHaveLength(card.changes.length);
    });

    it('returns empty when there are no teacher changes', async () => {
      prisma.groupTeacherHistory.findMany.mockResolvedValueOnce([]);
      const rows = await service.getDepartedAfterTeacherChangeList(1, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });
      expect(rows).toEqual([]);
    });
  });

  describe('getStudentPaymentsFilterOptions', () => {
    it('returns groups, teachers (with fullName), and courses', async () => {
      prisma.group.findMany.mockResolvedValueOnce([
        { id: 'g1', name: 'B1-01', branchId: 1 },
      ]);
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 30001, firstName: 'Feruz', lastName: 'Ustoz' },
      ]);
      prisma.course.findMany.mockResolvedValueOnce([
        { id: 'c1', name: 'German B1' },
      ]);

      const result = await service.getStudentPaymentsFilterOptions(1, null);
      expect(result).toEqual({
        groups: [{ id: 'g1', name: 'B1-01', branchId: 1 }],
        teachers: [{ id: 30001, fullName: 'Feruz Ustoz' }],
        courses: [{ id: 'c1', name: 'German B1' }],
      });
    });
  });

  describe('assembleMonthlyNetProfit', () => {
    it("adds the month's balance withdrawals as their own leg (ADR-0055)", async () => {
      const svc: any = service;
      jest
        .spyOn(svc.financial, 'valueHeldLessons')
        .mockResolvedValue([{ value: 100_000 }]);
      jest
        .spyOn(svc.financial, 'getPeriodOutflows')
        .mockResolvedValue({ refunds: 0, writeOffs: 0, providerFees: 0 });
      jest.spyOn(svc, 'getSalaryMonthly').mockResolvedValue({
        totals: { covered: 70_000, fullDeserved: 70_000 },
      });
      jest.spyOn(svc, 'getProfitLoss').mockResolvedValue({
        costOfServices: {},
        operatingExpenses: { adminSalaries: 0, byCategory: [] },
      });
      const withdrawals = {
        total: 30_000,
        teacherCredited: 30_000,
        students: [{ studentId: 10001, name: 'Ali Valiyev', amount: 30_000 }],
      };
      const load = jest
        .spyOn(svc, 'getBalanceWithdrawals')
        .mockResolvedValue(withdrawals);

      const out = await svc.assembleMonthlyNetProfit(1001, {
        month: '2026-10',
        branchIds: [1],
        performedById: 10001,
      });

      expect(load).toHaveBeenCalledWith(1001, {
        months: ['2026-10'],
        branchIds: [1],
      });
      expect(out.withdrawals).toBe(withdrawals);
      expect(out.netProfit.balanceWithdrawals).toBe(30_000);
      // 100 000 lessons + 30 000 withdrawn − 70 000 teachers.
      expect(out.netProfit.netProfit).toBe(60_000);
    });

    /**
     * A2.8. The payroll leg ran the director's branch scope as `mainBranch`
     * alone, so a director attached to branches 1 and 2 who picked branch 2 got
     * a blocked scope: no roster, payroll 0, and the branch's profit looked too
     * high. The leg below runs the REAL `resolveMonthlyScope`; behind a blocked
     * scope `SalaryMonthlyService` finds no teachers and returns all-zero totals.
     */
    it('subtracts the payroll of the branch a two-branch director picked (A2.8)', async () => {
      const svc: any = service;
      jest
        .spyOn(svc.financial, 'valueHeldLessons')
        .mockResolvedValue([{ value: 100_000 }]);
      jest
        .spyOn(svc.financial, 'getPeriodOutflows')
        .mockResolvedValue({ refunds: 0, writeOffs: 0, providerFees: 0 });
      jest.spyOn(svc, 'getProfitLoss').mockResolvedValue({
        costOfServices: {},
        operatingExpenses: { adminSalaries: 0, byCategory: [] },
      });
      jest
        .spyOn(svc, 'getBalanceWithdrawals')
        .mockResolvedValue({ total: 0, teacherCredited: 0, students: [] });

      const salaryPrisma = {
        company: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ systemStartDate: new Date('2026-05-01') }),
        },
        salaryPeriodSetting: {
          findFirst: jest.fn().mockResolvedValue({ cycleStartDay: 1 }),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({
            mainBranch: 1,
            branches: [{ branchId: 1 }, { branchId: 2 }],
            roles: [{ role: { name: 'Branch Director' } }],
          }),
        },
      } as any;
      const getMonthly = jest.fn(
        async (
          query: SalaryMonthlyQuery,
          companyId: number,
          performedById: number,
        ) => {
          const scope = await resolveMonthlyScope(
            salaryPrisma,
            query,
            companyId,
            performedById,
          );
          return {
            totals: scope.blocked
              ? { covered: 0, fullDeserved: 0 }
              : { covered: 70_000, fullDeserved: 70_000 },
          };
        },
      );
      svc.salary = { getMonthly };

      const out = await svc.assembleMonthlyNetProfit(1001, {
        month: '2026-10',
        branchIds: [2],
        performedById: 10768,
      });

      expect(getMonthly).toHaveBeenCalledWith(
        { month: '2026-10', branchId: 2, staffBranchBasis: 'home' },
        1001,
        10768,
      );
      // 100 000 of lessons − 70 000 of branch 2's payroll, not 100 000 against
      // a payroll leg that a blocked scope had read as 0.
      expect(out.netProfit.teacherSalary).toBe(70_000);
      expect(out.netProfit.netProfit).toBe(30_000);
    });
  });

  describe('getOwnMonthProfit', () => {
    it('combines attribution + net profit into the own-month figure', async () => {
      const svc: any = service;
      jest.spyOn(svc, 'getIncomeMonthAttribution').mockResolvedValue({
        total: 170_378_987,
        currentMonth: 100_000_000,
        advance: 42_064_938,
        lateTotal: 28_314_049,
        late: [],
      });
      jest.spyOn(svc, 'getMonthlyNetProfit').mockResolvedValue({
        teacherSalary: 95_834_547,
        adminSalary: 0,
        operatingExpenses: 41_773_000,
        refunds: 200_000,
        netProfit: 35_976_444,
      });

      const out = await svc.getOwnMonthProfit(1, {
        month: '2026-07',
        branchIds: null,
        performedById: 10_456,
      });

      expect(out.ownMoney).toBe(142_064_938);
      expect(out.cashTotal).toBe(170_378_987);
      expect(out.ownMonthProfit).toBe(4_257_391);
      expect(out.netProfit.netProfit).toBe(35_976_444);
    });

    it('passes the month-end date bounds to the attribution query', async () => {
      const svc: any = service;
      const attr = jest
        .spyOn(svc, 'getIncomeMonthAttribution')
        .mockResolvedValue({
          total: 0,
          currentMonth: 0,
          advance: 0,
          lateTotal: 0,
          late: [],
        });
      jest.spyOn(svc, 'getMonthlyNetProfit').mockResolvedValue({
        teacherSalary: 0,
        adminSalary: 0,
        operatingExpenses: 0,
        refunds: 0,
        netProfit: 0,
      });

      await svc.getOwnMonthProfit(1, {
        month: '2026-02',
        branchIds: [7],
        performedById: 1,
      });

      expect(attr).toHaveBeenCalledWith(1, {
        branchIds: [7],
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });
    });

    it('an empty branch scope returns zeros without querying', async () => {
      const svc: any = service;
      const attr = jest.spyOn(svc, 'getIncomeMonthAttribution');
      const out = await svc.getOwnMonthProfit(1, {
        month: '2026-07',
        branchIds: [],
        performedById: 1,
      });
      expect(out.ownMonthProfit).toBe(0);
      expect(attr).not.toHaveBeenCalled();
    });
  });
  describe('getNetProfitWithBasis', () => {
    it("kanonik hisob ishlasa 'recognized' asosini qaytaradi", async () => {
      jest
        .spyOn(service, 'getMonthlyNetProfit')
        .mockResolvedValue({ netProfit: 4_700_000 } as any);

      const res = await service.getNetProfitWithBasis(1001, {
        month: '2026-08',
        branchIds: null,
        performedById: 10406,
        cashFallback: 78_000_000,
      });

      expect(res).toEqual({
        netProfit: 4_700_000,
        netProfitBasis: 'recognized',
      });
    });

    it("kanonik hisob yiqilsa kassa raqamiga tushadi va buni 'cash' deb belgilaydi", async () => {
      jest
        .spyOn(service, 'getMonthlyNetProfit')
        .mockRejectedValue(new Error("salary config yo'q"));

      const res = await service.getNetProfitWithBasis(1001, {
        month: '2026-08',
        branchIds: null,
        performedById: 10406,
        cashFallback: 78_000_000,
      });

      expect(res).toEqual({ netProfit: 78_000_000, netProfitBasis: 'cash' });
    });
  });

  describe('getFinancialTrendCanonical — cache key', () => {
    it('keys a multi-branch scope by its own branch set, never the company entry', async () => {
      // The earlier month goes through the day cache; the last (anchor) one is live.
      jest
        .spyOn((service as any).financial, 'getFinancialTrend')
        .mockResolvedValue([
          { monthKey: '2026-08', profit: 0 },
          { monthKey: '2026-09', profit: 0 },
        ]);
      jest
        .spyOn(service, 'getMonthlyNetProfit')
        .mockResolvedValue({ netProfit: 4_200_000 } as any);

      const rows = await service.getFinancialTrendCanonical(
        1001,
        [7, 3],
        10001,
      );

      expect(redis.get).toHaveBeenCalledWith(
        'rpt:np:v5:1001:3,7:u10001:2026-08',
      );
      expect(redis.setex).toHaveBeenCalledWith(
        'rpt:np:v5:1001:3,7:u10001:2026-08',
        expect.any(Number),
        '4200000',
      );
      expect(rows[0]).toMatchObject({
        profit: 4_200_000,
        profitBasis: 'kanonik',
      });
    });

    it('computes the anchor (last) month live and never reads or writes its cache; earlier months keep the cache', async () => {
      jest
        .spyOn((service as any).financial, 'getFinancialTrend')
        .mockResolvedValue([
          { monthKey: '2026-08', profit: 0 },
          { monthKey: '2026-09', profit: 0 },
        ]);
      // A stale cached figure sits under BOTH months.
      redis.get.mockResolvedValue('1111');
      const np = jest
        .spyOn(service, 'getMonthlyNetProfit')
        .mockResolvedValue({ netProfit: 2_500_000 } as any);

      const rows = await service.getFinancialTrendCanonical(1001, null, 10001);

      // Earlier month: served from the cache, nothing computed for it.
      expect(rows[0]).toMatchObject({ profit: 1111, profitBasis: 'kanonik' });
      expect(redis.get).toHaveBeenCalledWith(
        'rpt:np:v5:1001:all:u10001:2026-08',
      );
      // Anchor month: the live figure, the cache untouched for its key.
      expect(rows[1]).toMatchObject({
        profit: 2_500_000,
        profitBasis: 'kanonik',
      });
      expect(np).toHaveBeenCalledTimes(1);
      expect(np).toHaveBeenCalledWith(1001, {
        month: '2026-09',
        branchIds: null,
        performedById: 10001,
      });
      expect(redis.get).not.toHaveBeenCalledWith(
        'rpt:np:v5:1001:all:u10001:2026-09',
      );
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('hands the asked month to the raw trend', async () => {
      const trend = jest
        .spyOn((service as any).financial, 'getFinancialTrend')
        .mockResolvedValue([]);

      await service.getFinancialTrendCanonical(1001, null, 10001, '2026-08');

      expect(trend).toHaveBeenCalledWith(1001, null, '2026-08');
    });
  });

  // The debt reads nothing of the period, but the facade still asks for it on
  // every overview: the tests of the other blocks stub it so they do not reach
  // the (mocked, empty) student table.
  const emptyDebtSplit = {
    studying: { total: 0, count: 0, currentMonth: 0, older: 0 },
    notStudying: { total: 0, count: 0 },
  };
  const stubDebtSplit = () =>
    jest
      .spyOn((service as any).financial, 'getDebtSplit')
      .mockResolvedValue(emptyDebtSplit);

  describe('getFinancialOverview — month-end expectation', () => {
    // 01.10.2026 01:30 in Tashkent; the UTC date is still 30.09.
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-30T20:30:00.000Z'));
      stubDebtSplit();
    });
    afterEach(() => jest.useRealTimers());

    it('projects the month the overview covers: the current Tashkent month by default, else the period start month', async () => {
      jest
        .spyOn((service as any).financial, 'getFinancialOverview')
        .mockResolvedValue({ income: {} });
      const expectation = jest.spyOn(service, 'getMonthlyExpectation');

      await service.getFinancialOverview(1001, { branchIds: null });
      await service.getFinancialOverview(1001, {
        branchIds: [7],
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      });

      expect(expectation.mock.calls).toEqual([
        [1001, { month: '2026-10', branchIds: null }],
        [1001, { month: '2026-07', branchIds: [7] }],
      ]);
    });

    // `income.expected` (a second copy of `forecast.expectedMonthEnd`, hard-coded
    // to 0 in the raw service) had no reader left and was removed. So did the
    // debt in `forecast` (ADR-0059): the raw service has no `forecast` to give,
    // and the facade's holds the three expectation figures and nothing else.
    it('folds the expectation into `forecast` alone: `income` passes through untouched', async () => {
      const rawIncome = { actual: 5_000, paymentCount: 1, byMethod: [] };
      jest
        .spyOn((service as any).financial, 'getFinancialOverview')
        .mockResolvedValue({ income: rawIncome });
      jest.spyOn(service, 'getMonthlyExpectation').mockResolvedValue({
        month: '2026-07',
        heldValue: 100,
        heldLessons: 1,
        remainingValue: 200,
        remainingLessons: 2,
        expectedValue: 300,
      } as never);

      const res = await service.getFinancialOverview(1001, {
        branchIds: null,
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      });

      expect(res.forecast).toEqual({
        expectedMonthEnd: 300,
        expectedHeld: 100,
        expectedRemaining: 200,
      });
      expect(res.income).toEqual(rawIncome);
      expect(res.income).not.toHaveProperty('expected');
    });
  });

  // «Qarzdorlik» (ADR-0059): two numbers, never added, from the one split. The
  // overview's old debt — `forecast.outstandingReceivable` /
  // `debtorExposure` / `debtorCount` — counted status ACTIVE only, so an ungrouped
  // «faol» student sat in «qarzdorlar» there and nowhere else.
  describe("getFinancialOverview — «O'qiyotganlar qarzi» / «O'qimayotganlar qarzi»", () => {
    const split = {
      studying: {
        total: 39_150_000,
        count: 219,
        currentMonth: 36_990_000,
        older: 2_160_000,
      },
      notStudying: { total: 36_540_000, count: 305 },
    };

    beforeEach(() => {
      jest
        .spyOn((service as any).financial, 'getFinancialOverview')
        .mockResolvedValue({ income: {} });
    });

    it("returns the split the facade reads, for the overview's own scope", async () => {
      const getDebtSplit = jest
        .spyOn((service as any).financial, 'getDebtSplit')
        .mockResolvedValue(split);

      const res = await service.getFinancialOverview(1001, {
        branchIds: [7],
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(res.debtSplit).toEqual(split);
      expect(getDebtSplit).toHaveBeenCalledTimes(1);
      expect(getDebtSplit).toHaveBeenCalledWith(1001, { branchIds: [7] });
    });

    it('a company-wide caller gets the company-wide split, not an empty scope', async () => {
      const getDebtSplit = jest
        .spyOn((service as any).financial, 'getDebtSplit')
        .mockResolvedValue(split);

      await service.getFinancialOverview(1001, { branchIds: null });

      expect(getDebtSplit).toHaveBeenCalledWith(1001, { branchIds: null });
    });

    it("is today's debt: a past period is still split by the CURRENT month", async () => {
      const getDebtSplit = jest
        .spyOn((service as any).financial, 'getDebtSplit')
        .mockResolvedValue(split);

      await service.getFinancialOverview(1001, {
        branchIds: null,
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      });

      // «Shu oy» of a debt that stands today is this month's; July's charges
      // set against today's balance would split it by a month that is over.
      expect(getDebtSplit.mock.calls[0][1]).not.toHaveProperty('month');
    });

    it('keeps no combined debt figure beside the two', async () => {
      jest
        .spyOn((service as any).financial, 'getDebtSplit')
        .mockResolvedValue(split);

      const res: any = await service.getFinancialOverview(1001, {
        branchIds: null,
      });

      expect(res).not.toHaveProperty('debtorCount');
      expect(res.forecast).not.toHaveProperty('outstandingReceivable');
      expect(res.forecast).not.toHaveProperty('debtorExposure');
    });
  });

  describe('getFinancialOverview — «Bu oy hisoblandi»', () => {
    const monthCharges = {
      month: '2026-10',
      charged: 900_000,
      paid: 350_000,
      unpaid: 550_000,
      paidPct: 38.9,
      students: 2,
    };

    beforeEach(() => {
      jest
        .spyOn((service as any).financial, 'getFinancialOverview')
        .mockResolvedValue({ income: {} });
      stubDebtSplit();
    });

    it('a billed month carries the charged figure next to the expectation', async () => {
      const getMonthCharges = jest
        .spyOn((service as any).financial, 'getMonthCharges')
        .mockResolvedValue(monthCharges);

      const res = await service.getFinancialOverview(1001, {
        branchIds: [7],
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(res.monthCharges).toEqual(monthCharges);
      expect(getMonthCharges).toHaveBeenCalledWith(1001, {
        month: '2026-10',
        branchIds: [7],
      });
    });

    it('a month before the monthly billing has no charged figure and is not queried', async () => {
      const getMonthCharges = jest.spyOn(
        (service as any).financial,
        'getMonthCharges',
      );

      const res = await service.getFinancialOverview(1001, {
        branchIds: null,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      });

      expect(res.monthCharges).toBeNull();
      expect(getMonthCharges).not.toHaveBeenCalled();
    });
  });
});
