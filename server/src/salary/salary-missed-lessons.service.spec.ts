import { SalaryMissedLessonsService } from './salary-missed-lessons.service';
import { PrismaService } from '../prisma/prisma.service';

/** A Mon/Wed/Fri group running through October 2026. */
const group = {
  id: 'g1',
  name: 'A1-1',
  branchId: 1,
  exactDays: ['monday', 'wednesday', 'friday'],
  startDate: new Date('2026-09-01T00:00:00Z'),
  endDate: null,
};

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
