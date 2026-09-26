import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ReportsOverviewService } from './reports-overview.service';
import { ReportsAttendanceAnalyticsService } from './reports-attendance-analytics.service';
import { ReportsFinancialService } from './reports-financial.service';
import { ReportsDebtHistoryService } from './reports-debt-history.service';
import { ReportsPaymentsService } from './reports-payments.service';
import { ReportsTeacherPaymentsService } from './reports-teacher-payments.service';
import { ReportsStudentPaymentsService } from './reports-student-payments.service';
import { ReportsDepartedStudentsService } from './reports-departed-students.service';
import { ReportsDepartedListsService } from './reports-departed-lists.service';
import { ReportsDepartedReasonsService } from './reports-departed-reasons.service';
import { ReportsTeacherChangesService } from './reports-teacher-changes.service';
import { ReportsCenterActivityService } from './reports-center-activity.service';
import { ReportsProfitLossService } from './reports-profit-loss.service';
import { ReportsCashFlowService } from './reports-cash-flow.service';
import { ReportsBalanceSheetService } from './reports-balance-sheet.service';
import { ExpensesService } from '../expenses/expenses.service';
import { SalaryPaymentService } from '../salary/salary-payment.service';
import { SalaryService } from '../salary/salary.service';
import { PaymentsDebtorsService } from '../payments/payments-debtors.service';
import { DEPARTURE_GRACE_DAYS } from '../students/shared/departure-episodes';

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
      branch: { findMany: jest.fn() },
      user: { findMany: jest.fn(), findFirst: jest.fn() },
      groupTeacherHistory: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      groupTeacherChangeReason: { findMany: jest.fn().mockResolvedValue([]) },
      enrollmentTransferReason: { findMany: jest.fn().mockResolvedValue([]) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
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
        ReportsTeacherPaymentsService,
        ReportsStudentPaymentsService,
        ReportsDepartedStudentsService,
        ReportsDepartedListsService,
        ReportsDepartedReasonsService,
        ReportsTeacherChangesService,
        ReportsCenterActivityService,
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

      prisma.attendance.groupBy.mockResolvedValue([
        { status: 'PRESENT', _count: { id: 80 } },
        { status: 'ABSENT', _count: { id: 15 } },
        { status: 'LATE', _count: { id: 5 } },
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

    it('should handle zero students gracefully', async () => {
      prisma.student.count.mockResolvedValue(0);
      prisma.group.count.mockResolvedValue(0);
      prisma.enrollment.count.mockResolvedValue(0);
      prisma.attendance.groupBy.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      const result = await service.getKpis(1, {});

      expect(result.activeStudents.trend).toBe(0);
      expect(result.averageAttendance).toBe(0);
      expect(result.leadConversionRate).toBe(0);
    });

    // RULING C — voronka konversiyasi faqat voronka lidlarini sanaydi.
    // To'g'ridan qo'shilgan o'quvchining avtomatik lidida `sectionId` `null`;
    // u ham surat, ham maxrajga tushsa foiz 100 % ga siljiydi (prodda nisbat
    // taxminan 408 to'g'ridan / 34 voronkadan — signal 12:1 bo'g'ilardi).
    it("konversiya foizidan to'g'ridan kirgan lidlar chiqariladi", async () => {
      prisma.student.count.mockResolvedValue(0);
      prisma.group.count.mockResolvedValue(0);
      prisma.enrollment.count.mockResolvedValue(0);
      prisma.attendance.groupBy.mockResolvedValue([]);
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

      const result = await service.getLeadAnalytics({});

      expect(result.funnel).toHaveLength(4);
      expect(result.averageDaysToConversion).toBe(10);
    });

    it('should handle no converted leads', async () => {
      prisma.lead.groupBy.mockResolvedValue([
        { statusEnum: 'NEW', _count: { id: 5 } },
      ]);
      prisma.lead.findMany.mockResolvedValue([]);

      const result = await service.getLeadAnalytics({});

      expect(result.averageDaysToConversion).toBeNull();
    });

    // RULING C — voronka ko'rsatkichlarining HAMMASI (voronka taqsimoti,
    // oylik konversiya foizi va aylanishgacha o'rtacha kun) faqat voronkadan
    // o'tgan lidlarni oladi. `sectionId: null` = to'g'ridan /students eshigidan
    // kirgan, doskaga umuman tushmagan odam.
    it("voronka ko'rsatkichlaridan to'g'ridan kirgan lidlar chiqariladi", async () => {
      prisma.lead.groupBy.mockResolvedValue([]);
      prisma.lead.findMany.mockResolvedValue([]);

      await service.getLeadAnalytics({});

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

  describe('isPaymentOnTime', () => {
    const basePayment = {
      studentId: 10001,
      createdAt: new Date('2026-04-15'),
      contractId: 'c1',
      contract: {
        groupId: 'g1',
        course: { lessonPaymentCount: 12 },
      },
    };

    it('returns true when group has ≤3 lessons (new group)', async () => {
      prisma.attendance.count
        .mockResolvedValueOnce(2) // groupLessonsTotal
        .mockResolvedValueOnce(0); // studentLessonsBefore

      const result = await service.isPaymentOnTime(basePayment);
      expect(result).toBe(true);
    });

    it('returns true when student starts a new cycle (lessons % count === 0)', async () => {
      prisma.attendance.count
        .mockResolvedValueOnce(50) // groupLessonsTotal (existing group)
        .mockResolvedValueOnce(12); // studentLessonsBefore: exactly 1 cycle done

      const result = await service.isPaymentOnTime(basePayment);
      expect(result).toBe(true);
    });

    it('returns false when payment happens mid-cycle', async () => {
      prisma.attendance.count
        .mockResolvedValueOnce(50) // groupLessonsTotal
        .mockResolvedValueOnce(5); // studentLessonsBefore: mid-cycle

      const result = await service.isPaymentOnTime(basePayment);
      expect(result).toBe(false);
    });

    it('returns true for a new student joining an existing group (0 lessons attended)', async () => {
      prisma.attendance.count
        .mockResolvedValueOnce(50) // groupLessonsTotal
        .mockResolvedValueOnce(0); // studentLessonsBefore: brand new student

      const result = await service.isPaymentOnTime(basePayment);
      expect(result).toBe(true);
    });

    it('uses 20-lesson cycle when course.lessonPaymentCount is 20', async () => {
      prisma.attendance.count
        .mockResolvedValueOnce(50) // groupLessonsTotal
        .mockResolvedValueOnce(20); // exactly 1 cycle of 20

      const payment = {
        ...basePayment,
        contract: { groupId: 'g1', course: { lessonPaymentCount: 20 } },
      };
      const result = await service.isPaymentOnTime(payment);
      expect(result).toBe(true);
    });

    it('returns null when payment has no contract and student has no enrollment', async () => {
      prisma.enrollment.findFirst.mockResolvedValueOnce(null);
      const payment = { ...basePayment, contractId: null, contract: null };
      const result = await service.isPaymentOnTime(payment);
      expect(result).toBeNull();
    });

    it('falls back to student enrollment when contract is missing', async () => {
      prisma.enrollment.findFirst.mockResolvedValueOnce({
        groupId: 'g2',
        group: { course: { lessonPaymentCount: 12 } },
      });
      prisma.attendance.count
        .mockResolvedValueOnce(30) // groupLessonsTotal
        .mockResolvedValueOnce(0); // studentLessonsBefore: new student
      const payment = { ...basePayment, contractId: null, contract: null };
      const result = await service.isPaymentOnTime(payment);
      expect(result).toBe(true);
    });
  });

  describe('getPaymentReports', () => {
    it('returns the expected response shape with 4 metric blocks', async () => {
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 1_000_000 },
        _count: 10,
      });
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.payment.groupBy.mockResolvedValue([]);
      prisma.refund.aggregate.mockResolvedValue({
        _sum: { approvedAmount: 0 },
      });
      prisma.refund.count.mockResolvedValue(0);
      prisma.branch.findMany.mockResolvedValue([
        { id: 1, name: 'Asosiy filial' },
      ]);

      const result = await service.getPaymentReports(1, { months: 6 });

      expect(result).toHaveProperty('totalPayments');
      expect(result).toHaveProperty('onTimePayments');
      expect(result).toHaveProperty('branchBreakdown');
      expect(result).toHaveProperty('refunds');
      expect(result.totalPayments.trend).toHaveLength(6);
      expect(result.totalPayments.current).toBe(1_000_000);
    });

    it('supports 3-month window', async () => {
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 500_000 },
        _count: 5,
      });
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.payment.groupBy.mockResolvedValue([]);
      prisma.refund.aggregate.mockResolvedValue({
        _sum: { approvedAmount: 0 },
      });
      prisma.refund.count.mockResolvedValue(0);
      prisma.branch.findMany.mockResolvedValue([]);

      const result = await service.getPaymentReports(1, { months: 3 });
      expect(result.totalPayments.trend).toHaveLength(3);
    });

    it('computes branch breakdown sorted by amount desc', async () => {
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
        _count: 0,
      });
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.payment.groupBy.mockResolvedValue([
        { branchId: 1, _sum: { amount: 2_000_000 } },
        { branchId: 2, _sum: { amount: 5_000_000 } },
      ]);
      prisma.refund.aggregate.mockResolvedValue({
        _sum: { approvedAmount: 0 },
      });
      prisma.refund.count.mockResolvedValue(0);
      prisma.branch.findMany.mockResolvedValue([
        { id: 1, name: 'Filial A' },
        { id: 2, name: 'Filial B' },
      ]);

      const result = await service.getPaymentReports(1, {});
      expect(result.branchBreakdown.byBranch).toEqual([
        { branchId: 2, branchName: 'Filial B', amount: 5_000_000 },
        { branchId: 1, branchName: 'Filial A', amount: 2_000_000 },
      ]);
    });
  });

  describe('getTeacherPaymentReports', () => {
    it('returns empty list when there are no teachers with active groups', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]);
      const result = await service.getTeacherPaymentReports(1, {});
      expect(result).toEqual({ teachers: [] });
    });

    it('aggregates student count, payments, and debt per teacher', async () => {
      prisma.user.findMany.mockResolvedValueOnce([
        {
          id: 10001,
          firstName: 'Ali',
          lastName: 'Valiyev',
          groupTeachers: [
            { group: { id: 'g1', course: { name: 'B1 German' } } },
            { group: { id: 'g2', course: { name: 'A1 German' } } },
          ],
        },
      ]);

      prisma.enrollment.groupBy.mockResolvedValueOnce([
        { groupId: 'g1', _count: { _all: 10 } },
        { groupId: 'g2', _count: { _all: 5 } },
      ]);

      prisma.payment.findMany.mockResolvedValueOnce([
        { amount: 500_000, contract: { groupId: 'g1' } },
        { amount: 300_000, contract: { groupId: 'g2' } },
        { amount: 200_000, contract: { groupId: 'g1' } },
      ]);

      prisma.student.findMany.mockResolvedValueOnce([
        {
          balance: -100_000,
          enrollments: [{ groupId: 'g1' }],
        },
      ]);

      const result = await service.getTeacherPaymentReports(1, {});

      expect(result.teachers).toHaveLength(1);
      expect(result.teachers[0]).toMatchObject({
        id: 10001,
        name: 'Ali Valiyev',
        groupCount: 2,
        courses: ['B1 German', 'A1 German'],
        studentCount: 15,
        totalPayments: 1_000_000,
        debtAmount: 100_000,
      });
    });

    it('filters out teachers with no active groups', async () => {
      prisma.user.findMany.mockResolvedValueOnce([
        {
          id: 10002,
          firstName: 'Bek',
          lastName: 'Nazarov',
          groupTeachers: [], // no active groups
        },
      ]);

      const result = await service.getTeacherPaymentReports(1, {});
      expect(result.teachers).toEqual([]);
    });

    it('sorts teachers by total payments desc', async () => {
      prisma.user.findMany.mockResolvedValueOnce([
        {
          id: 1,
          firstName: 'A',
          lastName: 'A',
          groupTeachers: [{ group: { id: 'g1', course: { name: 'C1' } } }],
        },
        {
          id: 2,
          firstName: 'B',
          lastName: 'B',
          groupTeachers: [{ group: { id: 'g2', course: { name: 'C2' } } }],
        },
      ]);
      prisma.enrollment.groupBy.mockResolvedValueOnce([
        { groupId: 'g1', _count: { _all: 1 } },
        { groupId: 'g2', _count: { _all: 1 } },
      ]);
      prisma.payment.findMany.mockResolvedValueOnce([
        { amount: 100, contract: { groupId: 'g1' } },
        { amount: 900, contract: { groupId: 'g2' } },
      ]);
      prisma.student.findMany.mockResolvedValueOnce([]);

      const result = await service.getTeacherPaymentReports(1, {});
      expect(result.teachers.map((t) => t.id)).toEqual([2, 1]);
    });
  });

  describe('getTeacherGroupsReport', () => {
    it('throws NotFound when teacher does not exist', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.getTeacherGroupsReport(1, 99999, {}),
      ).rejects.toThrow("O'qituvchi topilmadi");
    });

    it('returns teacher info and empty groups when teacher has no groups', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 10001,
        firstName: 'Ali',
        lastName: 'Valiyev',
      });
      prisma.groupTeacher.findMany.mockResolvedValueOnce([]);
      const result = await service.getTeacherGroupsReport(1, 10001, {});
      expect(result).toEqual({
        teacher: { id: 10001, name: 'Ali Valiyev' },
        groups: [],
      });
    });

    it('computes per-group stats: students, paid, debtors, expected', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({
        id: 10001,
        firstName: 'Ali',
        lastName: 'Valiyev',
      });
      prisma.groupTeacher.findMany.mockResolvedValueOnce([
        {
          group: {
            id: 'g1',
            name: 'B1-01',
            course: { price: 300_000 },
          },
        },
      ]);
      prisma.enrollment.findMany.mockResolvedValueOnce([
        { groupId: 'g1', studentId: 101 },
        { groupId: 'g1', studentId: 102 },
        { groupId: 'g1', studentId: 103 },
      ]);
      prisma.payment.findMany.mockResolvedValueOnce([
        {
          amount: 300_000,
          studentId: 101,
          contract: { groupId: 'g1' },
        },
        {
          amount: 300_000,
          studentId: 102,
          contract: { groupId: 'g1' },
        },
      ]);
      prisma.student.findMany.mockResolvedValueOnce([
        { balance: -50_000, enrollments: [{ groupId: 'g1' }] },
      ]);

      const result = await service.getTeacherGroupsReport(1, 10001, {});
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]).toMatchObject({
        id: 'g1',
        name: 'B1-01',
        coursePrice: 300_000,
        totalStudents: 3,
        paidCount: 2,
        debtorCount: 1,
        totalPayments: 600_000,
        debtAmount: 50_000,
        expectedAmount: 900_000,
      });
    });
  });

  describe('getStudentPaymentsReport', () => {
    it('returns paginated rows with student/group/teacher fields', async () => {
      const payments = [
        {
          id: 'p1',
          amount: 500_000,
          method: 'CASH',
          note: "To'lov 1",
          createdAt: new Date('2026-04-01T10:00:00Z'),
          student: { id: 10001, firstName: 'Ali', lastName: 'Valiyev' },
          receivedBy: { id: 20001, firstName: 'Laziz', lastName: 'Kassa' },
          contract: {
            group: {
              id: 'g1',
              name: 'B1-01',
              teachers: [
                {
                  teacher: {
                    id: 30001,
                    firstName: 'Feruz',
                    lastName: 'Ustoz',
                  },
                },
              ],
            },
          },
        },
      ];
      prisma.$transaction.mockResolvedValueOnce([payments, 1]);

      const result = await service.getStudentPaymentsReport(1, {
        page: 1,
        pageSize: 10,
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'p1',
        student: { id: 10001, fullName: 'Ali Valiyev' },
        group: { id: 'g1', name: 'B1-01' },
        teachers: [{ id: 30001, fullName: 'Feruz Ustoz' }],
        amount: 500_000,
        bonus: null,
        method: 'CASH',
        receivedBy: { id: 20001, fullName: 'Laziz Kassa' },
      });
    });

    it('falls back to active enrollment when payment has no contract group', async () => {
      const payments = [
        {
          id: 'p2',
          amount: 300_000,
          method: 'PAYME',
          note: null,
          createdAt: new Date('2026-04-02T10:00:00Z'),
          student: { id: 10002, firstName: 'Jasur', lastName: 'Tursun' },
          receivedBy: null,
          contract: null,
        },
      ];
      prisma.$transaction.mockResolvedValueOnce([payments, 1]);
      prisma.enrollment.findMany.mockResolvedValueOnce([
        {
          studentId: 10002,
          group: {
            id: 'g9',
            name: 'A2-03',
            teachers: [
              { teacher: { id: 30002, firstName: 'Nodira', lastName: 'Opa' } },
            ],
          },
        },
      ]);

      const result = await service.getStudentPaymentsReport(1, {});
      expect(result.data[0].group).toEqual({ id: 'g9', name: 'A2-03' });
      expect(result.data[0].teachers).toEqual([
        { id: 30002, fullName: 'Nodira Opa' },
      ]);
      expect(result.data[0].receivedBy).toBeNull();
    });

    it('applies method filter to the where clause', async () => {
      prisma.$transaction.mockResolvedValueOnce([[], 0]);
      await service.getStudentPaymentsReport(1, {
        methods: ['CASH', 'PAYME'],
      });
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
            status: 'COMPLETED',
            method: { in: ['CASH', 'PAYME'] },
          }),
        }),
      );
    });

    it('clamps pageSize to 100 and page to >= 1', async () => {
      prisma.$transaction.mockResolvedValueOnce([[], 0]);
      const result = await service.getStudentPaymentsReport(1, {
        page: 0,
        pageSize: 9999,
      });
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(100);
    });
  });

  describe('getDepartedStudentsSummary', () => {
    // Only the teacher-change metrics are covered here; departures have their own spec.
    const baseParams = {
      scope: null,
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    };

    it('counts teacher changes and post-change departures (DROPPED or FROZEN)', async () => {
      prisma.student.findMany.mockResolvedValueOnce([]);
      prisma.student.count.mockResolvedValueOnce(0);
      prisma.groupTeacherHistory.findMany.mockResolvedValueOnce([
        { id: 'ch1', groupId: 'g1', createdAt: new Date('2026-03-05') },
      ]);
      prisma.attendance.findMany.mockResolvedValueOnce([
        { date: new Date('2026-03-06') },
        { date: new Date('2026-03-08') },
        { date: new Date('2026-03-10') },
        { date: new Date('2026-03-12') },
        { date: new Date('2026-03-14') },
      ]);
      prisma.enrollment.findMany.mockResolvedValueOnce([
        { id: 'e1' },
        { id: 'e2' },
      ]);

      const result = await service.getDepartedStudentsSummary(1, baseParams);

      expect(result.totalTeacherChanges).toBe(1);
      expect(result.departedAfterTeacherChange).toBe(2);
      // "Left" after a teacher change = DROPPED or FROZEN.
      const enrWhere = prisma.enrollment.findMany.mock.calls[0][0].where;
      expect(enrWhere.status).toEqual({ in: ['DROPPED', 'FROZEN'] });
    });

    it('skips teacher changes with no lessons conducted after', async () => {
      prisma.student.findMany.mockResolvedValueOnce([]);
      prisma.student.count.mockResolvedValueOnce(0);
      prisma.groupTeacherHistory.findMany.mockResolvedValueOnce([
        { id: 'ch1', groupId: 'g1', createdAt: new Date('2026-03-05') },
      ]);
      prisma.attendance.findMany.mockResolvedValueOnce([]);

      const result = await service.getDepartedStudentsSummary(1, baseParams);

      expect(result.totalTeacherChanges).toBe(1);
      expect(result.departedAfterTeacherChange).toBe(0);
    });

    it('dedupes students affected by multiple teacher changes', async () => {
      prisma.student.findMany.mockResolvedValueOnce([]);
      prisma.student.count.mockResolvedValueOnce(0);
      prisma.groupTeacherHistory.findMany.mockResolvedValueOnce([
        { id: 'ch1', groupId: 'g1', createdAt: new Date('2026-03-05') },
        { id: 'ch2', groupId: 'g1', createdAt: new Date('2026-03-15') },
      ]);
      prisma.attendance.findMany
        .mockResolvedValueOnce([
          { date: new Date('2026-03-06') },
          { date: new Date('2026-03-08') },
        ])
        .mockResolvedValueOnce([
          { date: new Date('2026-03-16') },
          { date: new Date('2026-03-18') },
        ]);
      prisma.enrollment.findMany
        .mockResolvedValueOnce([{ id: 'e1' }])
        .mockResolvedValueOnce([{ id: 'e1' }]);

      const result = await service.getDepartedStudentsSummary(1, baseParams);

      expect(result.totalTeacherChanges).toBe(2);
      expect(result.departedAfterTeacherChange).toBe(1);
    });
  });

  describe('getDepartedStudentsReasons', () => {
    const baseParams = {
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    };

    it('returns counts by reason with names, sorted descending', async () => {
      prisma.enrollment.groupBy.mockResolvedValueOnce([
        { departureReasonId: 'r1', _count: { _all: 3 } },
        { departureReasonId: 'r2', _count: { _all: 5 } },
        { departureReasonId: null, _count: { _all: 2 } },
      ]);
      prisma.studentExitReason.findMany.mockResolvedValueOnce([
        { id: 'r1', name: 'Moliyaviy' },
        { id: 'r2', name: 'Vaqt yetmasligi' },
      ]);

      const result = await service.getDepartedStudentsReasons(1, baseParams);
      expect(result.data.map((d: any) => d.count)).toEqual([5, 3, 2]);
      expect(result.data[0]).toMatchObject({
        reasonId: 'r2',
        reasonName: 'Vaqt yetmasligi',
      });
      const nullRow = result.data.find((d: any) => d.reasonId === null);
      expect(nullRow?.reasonName).toBe("Sababi ko'rsatilmagan");
    });

    it('returns empty data when no dropped enrollments exist', async () => {
      prisma.enrollment.groupBy.mockResolvedValueOnce([]);
      const result = await service.getDepartedStudentsReasons(1, baseParams);
      expect(result.data).toEqual([]);
      // no follow-up reason lookup needed
      expect(prisma.studentExitReason.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getDepartedStudentsByReason', () => {
    const baseParams = {
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    };

    it('returns enrollment-level DROPPED rows flattened', async () => {
      const row = {
        id: 'e1',
        createdAt: new Date('2026-01-01'),
        statusChangedAt: new Date('2026-03-10'),
        statusChangeReason: 'Moliyaviy',
        departureReasonId: 'r1',
        student: { id: 10001, firstName: 'Ali', lastName: 'Valiyev' },
        group: {
          id: 'g1',
          name: 'B1-01',
          branch: { id: 1, name: 'Bosh' },
          course: { id: 'c1', name: 'A1' },
          teachers: [
            { teacher: { id: 30001, firstName: 'Feruz', lastName: 'Ustoz' } },
          ],
        },
      };
      prisma.$transaction.mockResolvedValueOnce([[row], 1]);

      const result = await service.getDepartedStudentsByReason(1, baseParams);
      expect(result.total).toBe(1);
      expect(result.data[0]).toMatchObject({
        id: 'e1',
        student: { id: 10001, fullName: 'Ali Valiyev' },
        group: { id: 'g1', name: 'B1-01' },
        branch: { id: 1, name: 'Bosh' },
        course: { id: 'c1', name: 'A1' },
        teachers: [{ id: 30001, fullName: 'Feruz Ustoz' }],
        reason: 'Moliyaviy',
        departureReasonId: 'r1',
        departedAt: new Date('2026-03-10').toISOString(),
      });
    });

    it('clamps pageSize to 100 and page to >= 1', async () => {
      prisma.$transaction.mockResolvedValueOnce([[], 0]);
      const result = await service.getDepartedStudentsByReason(1, {
        ...baseParams,
        page: 0,
        pageSize: 9999,
      });
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(100);
    });
  });

  describe('getDepartedAfterTeacherChangeList', () => {
    it('lists DROPPED or FROZEN students within 5 lessons of a teacher change', async () => {
      prisma.groupTeacherHistory.findMany.mockResolvedValueOnce([
        {
          id: 'ch1',
          groupId: 'g1',
          previousTeacherIds: [30001],
          newTeacherIds: [30002],
          createdAt: new Date('2026-03-05'),
        },
      ]);
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 30001, firstName: 'Eski', lastName: 'Ustoz' },
        { id: 30002, firstName: 'Yangi', lastName: 'Ustoz' },
      ]);
      prisma.attendance.findMany.mockResolvedValueOnce([
        { date: new Date('2026-03-06') },
        { date: new Date('2026-03-08') },
        { date: new Date('2026-03-10') },
        { date: new Date('2026-03-12') },
        { date: new Date('2026-03-14') },
      ]);
      prisma.enrollment.findMany.mockResolvedValueOnce([
        {
          id: 'e1',
          studentId: 10001,
          status: 'FROZEN',
          statusChangedAt: new Date('2026-03-09'),
          student: { firstName: 'Ali', lastName: 'V' },
          group: { name: 'B1-01', branch: { name: 'Bosh' } },
          departureReason: null,
        },
      ]);

      const rows = await service.getDepartedAfterTeacherChangeList(1, {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        enrollmentId: 'e1',
        studentName: 'Ali V',
        departureStatus: 'FROZEN',
        groupName: 'B1-01',
        branchName: 'Bosh',
      });
      // Counts both DROPPED (guruhsiz qoldi) and FROZEN (muzlatildi).
      const enrWhere = prisma.enrollment.findMany.mock.calls[0][0].where;
      expect(enrWhere.status).toEqual({ in: ['DROPPED', 'FROZEN'] });
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

  describe('getOwnMonthProfit', () => {
    it('combines attribution + net profit into the own-month figure', async () => {
      const svc: any = service;
      jest.spyOn(svc, 'getIncomeMonthAttribution').mockResolvedValue({
        total: 170_378_987,
        currentMonth: 142_064_938,
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
});
