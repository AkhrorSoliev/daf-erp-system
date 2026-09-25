import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DEPARTURE_GRACE_DAYS } from '../students/shared/departure-episodes';
import { ReportsDepartedStudentsService } from './reports-departed-students.service';
import { ReportsOverviewService } from './reports-overview.service';
import { kpiSheet } from './reports-excel.operational-sheets';

const at = (s: string) => new Date(s);
const NOW = at('2026-11-20T12:00:00Z');
const MAY = '2026-05-01T09:00:00.000Z';

const student = (id: number, status = 'ACTIVE') => ({
  id,
  status,
  statusChangedAt: null,
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
  group: { deletedAt: null },
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

// Ranges the service must refuse even when a caller skips the DTO.
const NOT_A_RANGE = [
  { startDate: '', endDate: '2026-09-30' },
  { startDate: '2026-09-01', endDate: '' },
  { startDate: '2026-13-01', endDate: '2026-09-30' },
  { startDate: '2026-09-01', endDate: '2026-13-01' },
];

describe('ReportsDepartedStudentsService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  describe('getDepartedStudentsSummary', () => {
    it('counts September departures against who was in a group on 1 September', async () => {
      const prisma = fakePrisma(FIXTURE);
      const service = new ReportsDepartedStudentsService(
        prisma as unknown as PrismaService,
      );

      const result = await service.getDepartedStudentsSummary(1001, {
        scope: null,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(result).toEqual({
        departedCount: 2,
        churnRate: 40,
        activeAtStart: 5,
        // 10003's stop (15.11) is still pending, but it started after September.
        pendingCount: 0,
        graceDays: DEPARTURE_GRACE_DAYS,
        lostRevenue: 400_000,
        totalDebt: -80_000,
        debtorCount: 2,
        avgDurationMonths: 4.4,
        totalTeacherChanges: 0,
        departedAfterTeacherChange: 0,
      });
    });

    it('counts only the pending departures that started in the range', async () => {
      const pendingIn = async (
        startDate: string,
        endDate: string,
        systemStartDate: Date | null = null,
      ) => {
        const service = new ReportsDepartedStudentsService(
          fakePrisma({
            ...FIXTURE,
            systemStartDate,
          }) as unknown as PrismaService,
        );
        const summary = await service.getDepartedStudentsSummary(1001, {
          scope: null,
          startDate,
          endDate,
        });
        return summary.pendingCount;
      };

      // 10003 stopped on 15.11 and the grace period still runs.
      expect(await pendingIn('2026-11-01', '2026-11-30')).toBe(1);
      expect(await pendingIn('2026-09-01', '2026-09-30')).toBe(0);
      expect(await pendingIn('2026-11-16', '2026-11-30')).toBe(0);
      // The reporting floor cuts it off like any other departure.
      expect(
        await pendingIn('2026-11-01', '2026-11-30', at('2026-11-16T00:00:00Z')),
      ).toBe(0);
    });

    it('sums debt over the students who have not come back', async () => {
      const prisma = fakePrisma(FIXTURE);
      const service = new ReportsDepartedStudentsService(
        prisma as unknown as PrismaService,
      );

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
      const service = new ReportsDepartedStudentsService(
        prisma as unknown as PrismaService,
      );

      await service.getDepartedStudentsSummary(1001, {
        scope: [3, 7],
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(
        prisma.groupTeacherHistory.findMany.mock.calls[0][0].where.group,
      ).toEqual({
        companyId: 1001,
        deletedAt: null,
        branchId: { in: [3, 7] },
      });
    });

    it.each(NOT_A_RANGE)(
      'refuses a range that is not two real days: %p',
      async (dates) => {
        const prisma = fakePrisma(FIXTURE);
        const service = new ReportsDepartedStudentsService(
          prisma as unknown as PrismaService,
        );

        await expect(
          service.getDepartedStudentsSummary(1001, { scope: null, ...dates }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.student.findMany).not.toHaveBeenCalled();
      },
    );
  });

  describe('getDepartedStudentsDynamics', () => {
    it('buckets confirmed departures by the Tashkent month they started', async () => {
      const prisma = fakePrisma(FIXTURE);
      const service = new ReportsDepartedStudentsService(
        prisma as unknown as PrismaService,
      );

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
      const service = new ReportsDepartedStudentsService(
        prisma as unknown as PrismaService,
      );

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
      const service = new ReportsDepartedStudentsService(
        prisma as unknown as PrismaService,
      );

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

    it('draws at most 240 months when no reporting floor bounds the range', async () => {
      const prisma = fakePrisma(FIXTURE);
      const service = new ReportsDepartedStudentsService(
        prisma as unknown as PrismaService,
      );

      const result = await service.getDepartedStudentsDynamics(1001, {
        scope: null,
        startDate: '1990-01-01',
        endDate: '2026-09-30',
      });

      expect(result.data).toHaveLength(240);
      expect(result.data[0].date).toBe('2006-10-01');
      expect(result.data[result.data.length - 1]).toEqual({
        date: '2026-09-01',
        count: 2,
        provisional: false,
      });
    });

    it('returns an empty series when the range starts after it ends', async () => {
      const service = new ReportsDepartedStudentsService(
        fakePrisma(FIXTURE) as unknown as PrismaService,
      );
      const dynamics = (startDate: string, endDate: string) =>
        service.getDepartedStudentsDynamics(1001, {
          scope: null,
          startDate,
          endDate,
        });

      expect(await dynamics('2026-10-15', '2026-09-01')).toEqual({ data: [] });
      // A range wholly after today ends, for the chart, before it starts.
      expect(await dynamics('2027-01-01', '2027-01-31')).toEqual({ data: [] });
    });

    it.each(NOT_A_RANGE)(
      'refuses a range that is not two real days: %p',
      async (dates) => {
        const prisma = fakePrisma(FIXTURE);
        const service = new ReportsDepartedStudentsService(
          prisma as unknown as PrismaService,
        );

        await expect(
          service.getDepartedStudentsDynamics(1001, { scope: null, ...dates }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.student.findMany).not.toHaveBeenCalled();
      },
    );
  });
});

describe('one departure count on every surface', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  // November 2026 is the current month: 10011 expelled 05.11, 10012 expelled
  // 10.11, 10013 left its group 18.11 (pending), 10014 left in August.
  const NOVEMBER = {
    students: [
      student(10011, 'EXPELLED'),
      student(10012, 'EXPELLED'),
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
      statusChange(10012, 'EXPELLED', '2026-11-10T09:00:00.100Z'),
    ],
  };

  it('shows the same November figure on the report, the home card and the Excel sheet', async () => {
    const prisma = fakePrisma(NOVEMBER) as unknown as PrismaService;

    const summary = await new ReportsDepartedStudentsService(
      prisma,
    ).getDepartedStudentsSummary(1001, {
      scope: null,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    const kpis = await new ReportsOverviewService(
      prisma,
      {} as RedisService,
    ).getKpis(1001, {});
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

describe('home card pending departures', () => {
  // 3 December: the grace period of a stop on 25 November still runs.
  beforeEach(() => jest.useFakeTimers({ now: at('2026-12-03T12:00:00Z') }));
  afterEach(() => jest.useRealTimers());

  it("does not count last month's pending stop in this month", async () => {
    const prisma = fakePrisma({
      students: [student(10021), student(10022)],
      enrollments: [
        enrollment('d1', 10021, 'DROPPED', '2026-11-25T09:00:00.000Z'),
        enrollment('d2', 10022, 'DROPPED', '2026-12-02T09:00:00.000Z'),
      ],
      logs: [
        log('d1', 'ACTIVE', MAY),
        log('d1', 'DROPPED', '2026-11-25T09:00:00.000Z'),
        log('d2', 'ACTIVE', MAY),
        log('d2', 'DROPPED', '2026-12-02T09:00:00.000Z'),
      ],
      history: [],
    }) as unknown as PrismaService;

    const kpis = await new ReportsOverviewService(
      prisma,
      {} as RedisService,
    ).getKpis(1001, {});

    expect(kpis.pendingDepartures).toBe(1);
    expect(kpis.churnedThisMonth).toBe(0);
  });
});
