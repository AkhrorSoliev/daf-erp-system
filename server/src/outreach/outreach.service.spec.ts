import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceStatus } from '@prisma/client';
import { OutreachService } from './outreach.service';
import {
  AbsenceStreakService,
  consecutiveAbsentCount,
} from './absence-streak.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../attendance/shared/date-utils';

describe('consecutiveAbsentCount', () => {
  it('returns 0 when latest is PRESENT', () => {
    expect(
      consecutiveAbsentCount([
        { status: AttendanceStatus.PRESENT },
        { status: AttendanceStatus.ABSENT },
        { status: AttendanceStatus.ABSENT },
      ]),
    ).toBe(0);
  });

  it('counts consecutive ABSENT from the latest', () => {
    expect(
      consecutiveAbsentCount([
        { status: AttendanceStatus.ABSENT },
        { status: AttendanceStatus.ABSENT },
        { status: AttendanceStatus.ABSENT },
        { status: AttendanceStatus.PRESENT },
        { status: AttendanceStatus.ABSENT },
      ]),
    ).toBe(3);
  });

  it('EXCUSED breaks the streak (sababsiz absences only)', () => {
    expect(
      consecutiveAbsentCount([
        { status: AttendanceStatus.ABSENT },
        { status: AttendanceStatus.EXCUSED },
        { status: AttendanceStatus.ABSENT },
        { status: AttendanceStatus.ABSENT },
      ]),
    ).toBe(1);
  });

  it('LATE breaks the streak', () => {
    expect(
      consecutiveAbsentCount([
        { status: AttendanceStatus.ABSENT },
        { status: AttendanceStatus.ABSENT },
        { status: AttendanceStatus.LATE },
      ]),
    ).toBe(2);
  });

  it('empty input returns 0', () => {
    expect(consecutiveAbsentCount([])).toBe(0);
  });
});

describe('OutreachService', () => {
  let service: OutreachService;
  let prisma: any;
  let streak: AbsenceStreakService;

  beforeEach(async () => {
    prisma = {
      // The shared resolver (`common/auth/branch-scope.ts`) reads the caller's
      // roles and branches from the DB, so role names no longer come from the
      // ctx the client shaped. Default caller is a CEO.
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      attendance: { findMany: jest.fn(), count: jest.fn() },
      enrollment: { findMany: jest.fn() },
      lead: { findMany: jest.fn() },
      student: { findMany: jest.fn() },
      paymentPromise: { findMany: jest.fn(), count: jest.fn() },
      callLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutreachService,
        AbsenceStreakService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(OutreachService);
    streak = module.get(AbsenceStreakService);
  });

  describe('getTodayAbsentees', () => {
    it('queries today (Tashkent) ABSENT rows scoped to company', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      const res = await service.getTodayAbsentees({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
        branchScope: null,
      });

      const today = tashkentDateStr(new Date());
      expect(res.date).toBe(today);
      expect(res.total).toBe(0);
      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: utcMidnightFromDateStr(today),
            status: AttendanceStatus.ABSENT,
            companyId: 1,
          }),
        }),
      );
    });

    it('scopes a Branch Director to the resolved scope', async () => {
      // The scope now arrives from `@BranchScope()` — ceiling ∩ switcher —
      // instead of being re-derived here from `mainBranch` alone.
      prisma.attendance.findMany.mockResolvedValue([]);
      await service.getTodayAbsentees({
        userId: 10001,
        companyId: 1,
        roles: ['Branch Director'],
        branchScope: [42],
      });
      const call = prisma.attendance.findMany.mock.calls[0][0];
      expect(call.where.group.branchId).toEqual({ in: [42] });
    });

    it('returns empty on an EMPTY scope, without querying', async () => {
      // `[]` is nothing, never everything — a caller with no branch attached,
      // or one who asked for a branch outside their ceiling.
      const res = await service.getTodayAbsentees({
        userId: 10001,
        companyId: 1,
        roles: ['Branch Director'],
        branchScope: [],
      });
      expect(res.total).toBe(0);
      expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    });

    it('does NOT scope CEO by branch', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      await service.getTodayAbsentees({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
        branchScope: null,
      });
      const call = prisma.attendance.findMany.mock.calls[0][0];
      expect(call.where.group.branchId).toBeUndefined();
    });

    it('uses the explicit date when provided instead of today', async () => {
      prisma.attendance.findMany.mockResolvedValue([]);
      const res = await service.getTodayAbsentees({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
        branchScope: null,
        date: '2026-05-15',
      });
      expect(res.date).toBe('2026-05-15');
      expect(prisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: utcMidnightFromDateStr('2026-05-15'),
          }),
        }),
      );
    });

    it('sorts by lesson start time', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        attendanceRow('a', '14:00'),
        attendanceRow('b', '09:00'),
        attendanceRow('c', '11:00'),
      ]);
      const res = await service.getTodayAbsentees({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
        branchScope: null,
      });
      expect(res.items.map((i) => i.attendanceId)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('getActivePromises', () => {
    it('queries OPEN+BROKEN promises for debtors and marks overdue, overdue first', async () => {
      const past = new Date(Date.now() - 86_400_000);
      const future = new Date(Date.now() + 86_400_000);
      prisma.paymentPromise.findMany.mockResolvedValue([
        {
          id: 'fut',
          promiseDate: future,
          comment: null,
          createdAt: new Date(),
          student: {
            id: 1,
            firstName: 'A',
            lastName: 'B',
            phone: '',
            parentPhone: null,
            photo: null,
            balance: -1000,
            enrollments: [],
          },
        },
        {
          id: 'past',
          promiseDate: past,
          comment: null,
          createdAt: new Date(),
          student: {
            id: 2,
            firstName: 'C',
            lastName: 'D',
            phone: '',
            parentPhone: null,
            photo: null,
            balance: -2000,
            enrollments: [],
          },
        },
      ]);
      const res = await service.getActivePromises({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
        branchScope: null,
      });
      const where = prisma.paymentPromise.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: ['OPEN', 'BROKEN'] });
      // Overdue ('past') sorts before the upcoming promise.
      expect(res.items.map((i) => i.promiseId)).toEqual(['past', 'fut']);
      expect(res.items[0].isOverdue).toBe(true);
      expect(res.items[1].isOverdue).toBe(false);
    });
  });

  describe('getRemovalQueue', () => {
    it('returns empty when no streaks qualify', async () => {
      jest.spyOn(streak, 'computeStreaks').mockResolvedValue([]);
      const res = await service.getRemovalQueue({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
        branchScope: null,
      });
      expect(res.total).toBe(0);
    });

    it('sorts by streak count DESC', async () => {
      jest.spyOn(streak, 'computeStreaks').mockResolvedValue([
        {
          enrollmentId: 'e1',
          studentId: 1,
          groupId: 'g1',
          consecutiveAbsentCount: 3,
          lastAbsenceDate: new Date('2026-05-20'),
          lastPresentDate: null,
        },
        {
          enrollmentId: 'e2',
          studentId: 2,
          groupId: 'g2',
          consecutiveAbsentCount: 5,
          lastAbsenceDate: new Date('2026-05-20'),
          lastPresentDate: null,
        },
      ]);
      prisma.enrollment.findMany.mockResolvedValue([
        enrollmentRow('e1', 1, 'g1'),
        enrollmentRow('e2', 2, 'g2'),
      ]);
      const res = await service.getRemovalQueue({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
        branchScope: null,
      });
      expect(res.items.map((i) => i.enrollmentId)).toEqual(['e2', 'e1']);
    });
  });

  describe('getStats', () => {
    it('returns counts for the KPIs', async () => {
      prisma.attendance.count = jest.fn().mockResolvedValue(7);
      prisma.paymentPromise.count = jest.fn().mockResolvedValue(2); // activePromises
      prisma.callLog.count = jest.fn().mockResolvedValue(5); // callsToday
      jest.spyOn(streak, 'computeStreaks').mockResolvedValue([
        {
          enrollmentId: 'e1',
          studentId: 1,
          groupId: 'g1',
          consecutiveAbsentCount: 4,
          lastAbsenceDate: new Date(),
          lastPresentDate: null,
        },
      ]);

      const res = await service.getStats({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
        branchScope: null,
      });

      expect(res).toEqual({
        todayAbsentees: 7,
        removalQueue: 1,
        activePromises: 2,
        callsToday: 5,
      });
    });

    it('returns zeros on an EMPTY scope', async () => {
      const res = await service.getStats({
        userId: 10001,
        companyId: 1,
        roles: ['Branch Director'],
        branchScope: [],
      });
      expect(res).toEqual({
        todayAbsentees: 0,
        removalQueue: 0,
        activePromises: 0,
        callsToday: 0,
      });
    });
  });
});

function attendanceRow(id: string, startTime: string) {
  return {
    id,
    note: null,
    student: {
      id: 1,
      firstName: 'A',
      lastName: 'B',
      phone: '',
      photo: null,
    },
    group: {
      id: 'g',
      name: 'G',
      lessonStartTime: startTime,
      lessonEndTime: '15:00',
      course: { id: 'c', name: 'C' },
      branch: { id: 1, name: 'B' },
      teachers: [],
    },
  };
}

function enrollmentRow(id: string, studentId: number, groupId: string) {
  return {
    id,
    student: {
      id: studentId,
      firstName: 'S',
      lastName: 'X',
      phone: '',
      parentPhone: null,
      photo: null,
    },
    group: {
      id: groupId,
      name: 'G',
      course: { id: 'c', name: 'C' },
      branch: { id: 1, name: 'B' },
      teachers: [],
    },
  };
}
