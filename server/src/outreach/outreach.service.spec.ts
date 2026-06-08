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
      user: { findUnique: jest.fn() },
      attendance: { findMany: jest.fn() },
      commentAssignee: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      enrollment: { findMany: jest.fn() },
      lead: { findMany: jest.fn() },
      student: { findMany: jest.fn() },
      paymentPromise: { findMany: jest.fn(), count: jest.fn() },
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

    it('scopes Branch Director to their mainBranch', async () => {
      prisma.user.findUnique.mockResolvedValue({ mainBranch: 42 });
      prisma.attendance.findMany.mockResolvedValue([]);
      await service.getTodayAbsentees({
        userId: 10001,
        companyId: 1,
        roles: ['Branch Director'],
      });
      const call = prisma.attendance.findMany.mock.calls[0][0];
      expect(call.where.group.branchId).toEqual({ in: [42] });
    });

    it('returns empty when Branch Director has no mainBranch', async () => {
      prisma.user.findUnique.mockResolvedValue({ mainBranch: null });
      const res = await service.getTodayAbsentees({
        userId: 10001,
        companyId: 1,
        roles: ['Branch Director'],
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
      });
      expect(res.items.map((i) => i.attendanceId)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('getMyCallbacks', () => {
    it('filters by user, isTask, dueDate IS NOT NULL, default PENDING+SEEN', async () => {
      prisma.commentAssignee.findMany.mockResolvedValue([]);
      prisma.commentAssignee.count.mockResolvedValue(0);
      await service.getMyCallbacks({
        userId: 10001,
        companyId: 1,
        query: {},
      });
      const where = prisma.commentAssignee.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe(10001);
      expect(where.status).toEqual({ in: ['PENDING', 'SEEN'] });
      expect(where.comment.isTask).toBe(true);
      expect(where.comment.dueDate).toEqual({ not: null });
      expect(where.comment.companyId).toBe(1);
    });

    it('marks overdue tasks', async () => {
      const past = new Date(Date.now() - 60_000);
      prisma.commentAssignee.findMany.mockResolvedValue([
        {
          status: 'PENDING',
          comment: {
            id: 'c1',
            content: 'call',
            entityType: 'Student',
            entityId: '10100',
            priority: 'HIGH',
            dueDate: past,
            author: { id: 1, firstName: 'A', lastName: 'B' },
          },
        },
      ]);
      prisma.commentAssignee.count.mockResolvedValue(1);
      prisma.student.findMany.mockResolvedValue([
        { id: 10100, firstName: 'Ali', lastName: 'V', phone: '', photo: null },
      ]);
      const res = await service.getMyCallbacks({
        userId: 10001,
        companyId: 1,
        query: {},
      });
      expect(res.items[0].isOverdue).toBe(true);
      expect(res.items[0].entity).toMatchObject({ id: 10100 });
    });
  });

  describe('getRemovalQueue', () => {
    it('returns empty when no streaks qualify', async () => {
      jest.spyOn(streak, 'computeStreaks').mockResolvedValue([]);
      const res = await service.getRemovalQueue({
        userId: 10001,
        companyId: 1,
        roles: ['CEO'],
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
      });
      expect(res.items.map((i) => i.enrollmentId)).toEqual(['e2', 'e1']);
    });
  });

  describe('getStats', () => {
    it('returns counts for the KPIs', async () => {
      prisma.attendance.count = jest.fn().mockResolvedValue(7);
      prisma.commentAssignee.count = jest
        .fn()
        .mockResolvedValueOnce(12) // pendingCallbacks
        .mockResolvedValueOnce(3); // overdueCallbacks
      prisma.paymentPromise.count = jest.fn().mockResolvedValue(2);
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
      });

      expect(res).toEqual({
        todayAbsentees: 7,
        pendingCallbacks: 12,
        overdueCallbacks: 3,
        removalQueue: 1,
        overduePromises: 2,
      });
    });

    it('returns zeros when Branch Director has no mainBranch', async () => {
      prisma.user.findUnique.mockResolvedValue({ mainBranch: null });
      const res = await service.getStats({
        userId: 10001,
        companyId: 1,
        roles: ['Branch Director'],
      });
      expect(res).toEqual({
        todayAbsentees: 0,
        pendingCallbacks: 0,
        overdueCallbacks: 0,
        removalQueue: 0,
        overduePromises: 0,
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
