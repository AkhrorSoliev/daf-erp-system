import { SalaryMissedLessonsService } from './salary-missed-lessons.service';
import { PrismaService } from '../prisma/prisma.service';

/** A Mon/Wed/Fri group running through October 2026. */
const group = {
  id: 'g1',
  name: 'A1-1',
  branchId: 1,
  exactDays: ['monday', 'wednesday', 'friday'],
  lessonEndTime: '19:30',
  startDate: new Date('2026-09-01T00:00:00Z'),
  endDate: null,
};

/** A `StatusHistory` row of the group; `at` is a real instant (UTC). */
const statusChange = (toStatus: string, at: string) => ({
  entityId: 'g1',
  toStatus,
  createdAt: new Date(at),
});

function makePrisma() {
  return {
    groupTeacher: {
      findMany: jest.fn().mockResolvedValue([{ groupId: 'g1' }]),
    },
    group: {
      findMany: jest.fn().mockResolvedValue([group]),
      findUnique: jest
        .fn()
        .mockResolvedValue({ startDate: group.startDate, endDate: null }),
    },
    statusHistory: { findMany: jest.fn().mockResolvedValue([]) },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
    lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
    lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
    attendance: {
      // 02.10 was taken; 05.10 and 07.10 were not.
      groupBy: jest
        .fn()
        .mockResolvedValue([
          { groupId: 'g1', date: new Date('2026-10-02T00:00:00Z') },
        ]),
    },
    unmarkedLesson: { findMany: jest.fn().mockResolvedValue([]) },
    lessonTeacherOverride: { findMany: jest.fn().mockResolvedValue([]) },
    enrollmentMonthlyCharge: {
      findMany: jest.fn().mockResolvedValue([
        {
          groupId: 'g1',
          studentId: 1,
          coveredDates: [
            '2026-10-02',
            '2026-10-05',
            '2026-10-07',
            '2026-10-09',
          ],
          frozenOutDates: [],
          perLessonCost: 34_615,
          plannedLessons: 13,
        },
      ]),
    },
    plannedAbsence: { findMany: jest.fn().mockResolvedValue([]) },
    employeeSalaryConfigVersion: {
      findMany: jest.fn().mockResolvedValue([
        {
          salaryType: 'PERCENTAGE',
          value: 30,
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: null,
          config: { groupId: null },
        },
      ]),
    },
  };
}

describe('SalaryMissedLessonsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: SalaryMissedLessonsService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SalaryMissedLessonsService(
      prisma as unknown as PrismaService,
    );
  });

  it('counts lessons before today only (08.10 10:00 Tashkent → up to 07.10)', async () => {
    const r = await service.forTeacher(
      7,
      1,
      '2026-10',
      new Date('2026-10-08T05:00:00Z'),
    );
    expect(r.lessons.map((l) => l.date)).toEqual(['2026-10-05', '2026-10-07']);
    expect(r.total).toBe(2 * 10_385);
    expect(prisma.attendance.groupBy).toHaveBeenCalledWith({
      by: ['groupId', 'date'],
      where: {
        groupId: { in: ['g1'] },
        date: {
          gte: new Date('2026-10-01T00:00:00Z'),
          lt: new Date('2026-10-08T00:00:00Z'),
        },
      },
    });
  });

  it('reads nothing for a month before October 2026', async () => {
    const r = await service.forTeacher(
      7,
      1,
      '2026-09',
      new Date('2026-10-08T05:00:00Z'),
    );
    expect(r).toEqual({ lessons: [], total: 0 });
    expect(prisma.groupTeacher.findMany).not.toHaveBeenCalled();
  });

  it("reads nothing on the month's first day (no lesson has ended a day ago)", async () => {
    const r = await service.forTeacher(
      7,
      1,
      '2026-10',
      new Date('2026-10-01T05:00:00Z'),
    );
    expect(r).toEqual({ lessons: [], total: 0 });
  });

  it('is empty for someone who teaches no group', async () => {
    prisma.groupTeacher.findMany.mockResolvedValue([]);
    const r = await service.forTeacher(
      7,
      1,
      '2026-10',
      new Date('2026-10-08T05:00:00Z'),
    );
    expect(r).toEqual({ lessons: [], total: 0 });
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });

  it('lists a lesson whose pay was forfeited, and not an exempt one (ADR-0054)', async () => {
    // 02.10: «Bo'ldi», not exempt — the register exists, the pay does not.
    // 05.10: exempt question (backfill / CEO), no register.
    // 07.10: PENDING, not exempt, no register.
    prisma.unmarkedLesson.findMany.mockResolvedValue([
      {
        groupId: 'g1',
        date: new Date('2026-10-02T00:00:00Z'),
        teacherPayExempt: false,
      },
      {
        groupId: 'g1',
        date: new Date('2026-10-05T00:00:00Z'),
        teacherPayExempt: true,
      },
      {
        groupId: 'g1',
        date: new Date('2026-10-07T00:00:00Z'),
        teacherPayExempt: false,
      },
    ]);
    const r = await service.forTeacher(
      7,
      1,
      '2026-10',
      new Date('2026-10-08T05:00:00Z'),
    );
    expect(r.lessons.map((l) => l.date)).toEqual(['2026-10-02', '2026-10-07']);
    expect(prisma.unmarkedLesson.findMany).toHaveBeenCalledWith({
      where: {
        groupId: { in: ['g1'] },
        date: {
          gte: new Date('2026-10-01T00:00:00Z'),
          lt: new Date('2026-10-08T00:00:00Z'),
        },
      },
      select: { groupId: true, date: true, teacherPayExempt: true },
    });
  });

  describe('a group that was PAUSED', () => {
    const ask = () =>
      service.forTeacher(7, 1, '2026-10', new Date('2026-10-08T05:00:00Z'));

    it('does not miss a lesson that ended while the group was paused', async () => {
      // Paused 04.10, back 06.10: 05.10 (Mon) was never held; 07.10 was due.
      prisma.statusHistory.findMany.mockResolvedValue([
        statusChange('PAUSED', '2026-10-04T10:00:00Z'),
        statusChange('ACTIVE', '2026-10-06T10:00:00Z'),
      ]);
      const r = await ask();
      expect(r.lessons.map((l) => l.date)).toEqual(['2026-10-07']);
      expect(prisma.statusHistory.findMany).toHaveBeenCalledWith({
        where: {
          entityType: 'Group',
          entityId: { in: ['g1'] },
          createdAt: { lt: new Date('2026-10-08T00:00:00+05:00') },
        },
        orderBy: { createdAt: 'asc' },
        select: { entityId: true, toStatus: true, createdAt: true },
      });
    });

    it('treats a pause that starts mid-lesson as paused at the lesson end', async () => {
      // 05.10 lesson is 17:30–19:30; paused 17:41, so nobody could mark it.
      prisma.statusHistory.findMany.mockResolvedValue([
        statusChange('PAUSED', '2026-10-05T12:41:00Z'),
        statusChange('ACTIVE', '2026-10-06T10:00:00Z'),
      ]);
      const r = await ask();
      expect(r.lessons.map((l) => l.date)).toEqual(['2026-10-07']);
    });

    it('still misses a lesson that ended before the pause began', async () => {
      // Paused 20:00 on 05.10, after the 19:30 end: the question was asked.
      prisma.statusHistory.findMany.mockResolvedValue([
        statusChange('PAUSED', '2026-10-05T15:00:00Z'),
        statusChange('ACTIVE', '2026-10-06T10:00:00Z'),
      ]);
      const r = await ask();
      expect(r.lessons.map((l) => l.date)).toEqual([
        '2026-10-05',
        '2026-10-07',
      ]);
    });

    it('misses the lesson on the day the group came back before it ended', async () => {
      // Back at 17:34 on 07.10, the lesson ends 19:30: it was due.
      prisma.statusHistory.findMany.mockResolvedValue([
        statusChange('PAUSED', '2026-10-04T10:00:00Z'),
        statusChange('ACTIVE', '2026-10-07T12:34:00Z'),
      ]);
      const r = await ask();
      expect(r.lessons.map((l) => l.date)).toEqual(['2026-10-07']);
    });
  });

  it("stops at the group's end date", async () => {
    prisma.group.findMany.mockResolvedValue([
      { ...group, endDate: new Date('2026-10-05T00:00:00Z') },
    ]);
    const r = await service.forTeacher(
      7,
      1,
      '2026-10',
      new Date('2026-10-08T05:00:00Z'),
    );
    expect(r.lessons.map((l) => l.date)).toEqual(['2026-10-05']);
  });
});
