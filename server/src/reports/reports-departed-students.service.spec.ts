import { PrismaService } from '../prisma/prisma.service';
import { DEPARTURE_GRACE_DAYS } from '../students/shared/departure-episodes';
import { ReportsDepartedStudentsService } from './reports-departed-students.service';

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
        pendingCount: 1,
        graceDays: DEPARTURE_GRACE_DAYS,
        lostRevenue: 400_000,
        totalDebt: -80_000,
        debtorCount: 2,
        avgDurationMonths: 4.4,
        totalTeacherChanges: 0,
        departedAfterTeacherChange: 0,
      });
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
  });
});
