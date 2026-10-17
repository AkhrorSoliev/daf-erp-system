import { NotFoundException } from '@nestjs/common';
import {
  AttendanceStatus,
  MockExamStatus,
  PlannedAbsenceKind,
} from '@prisma/client';
import { ParticipationFactsService } from './participation-facts.service';

type Row = {
  date: Date;
  status: AttendanceStatus;
  cancellationId: string | null;
  groupId: string;
  group: {
    name: string;
    level: string | null;
    lessonMinutes: number | null;
    course: { name: string; lessonMinutes: number | null };
  };
};

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const group = (
  name: string,
  level: string | null,
  courseName = `Deutsch ${level}`,
  lessonMinutes: number | null = 90,
) => ({
  name,
  level,
  lessonMinutes,
  course: { name: courseName, lessonMinutes: null },
});
const att = (
  date: string,
  status: AttendanceStatus,
  groupId: string,
  g: Row['group'],
  cancellationId: string | null = null,
): Row => ({ date: d(date), status, cancellationId, groupId, group: g });

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    student: {
      findFirst: jest.fn().mockResolvedValue({
        firstName: 'Madina',
        lastName: 'Karimova',
        dateOfBirth: new Date('2004-03-13T19:00:00.000Z'),
      }),
    },
    attendance: { findMany: jest.fn().mockResolvedValue([]) },
    plannedAbsence: { findMany: jest.fn().mockResolvedValue([]) },
    dafLesson: { findMany: jest.fn().mockResolvedValue([]) },
    dafLessonProgress: { findMany: jest.fn().mockResolvedValue([]) },
    dafSession: { findMany: jest.fn().mockResolvedValue([]) },
    mockExamParticipant: { findFirst: jest.fn().mockResolvedValue(null) },
    ...over,
  };
}

describe('ParticipationFactsService', () => {
  it('404s for a student of another company', async () => {
    const prisma = makePrisma({
      student: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      new ParticipationFactsService(prisma as never).load(10001, 1001),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s for an archived student, like one of another company', async () => {
    // A fake table: the archived card is found only when the query does not
    // ask for `deletedAt: null`.
    const archived = {
      firstName: 'Madina',
      lastName: 'Karimova',
      dateOfBirth: null,
    };
    const findFirst = jest
      .fn()
      .mockImplementation(({ where }: { where: { deletedAt?: null } }) =>
        Promise.resolve(where.deletedAt === null ? null : archived),
      );
    const prisma = makePrisma({ student: { findFirst } });
    await expect(
      new ParticipationFactsService(prisma as never).load(10001, 1001),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 10001,
          companyId: 1001,
          deletedAt: null,
        }),
      }),
    );
  });

  it('scopes every query to this student and company', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', group('A1-17', 'A1')),
    ];
    const lessons = [
      { id: 1, unitId: 10, kind: 'SECTION_A', _count: { exercises: 3 } },
      { id: 2, unitId: 10, kind: 'UNIT_TEST', _count: { exercises: 0 } },
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
      dafLesson: { findMany: jest.fn().mockResolvedValue(lessons) },
    });
    await new ParticipationFactsService(prisma as never).load(10001, 1001);

    const whereOf = (where: Record<string, unknown>) =>
      expect.objectContaining({ where: expect.objectContaining(where) });
    expect(prisma.student.findFirst).toHaveBeenCalledWith(
      whereOf({ id: 10001, companyId: 1001, deletedAt: null }),
    );
    expect(prisma.attendance.findMany).toHaveBeenCalledWith(
      whereOf({ studentId: 10001, companyId: 1001 }),
    );
    expect(prisma.plannedAbsence.findMany).toHaveBeenCalledWith(
      whereOf({
        studentId: 10001,
        companyId: 1001,
        kind: PlannedAbsenceKind.SABABSIZ,
      }),
    );
    expect(prisma.dafLessonProgress.findMany).toHaveBeenCalledWith(
      whereOf({ studentId: 10001, completedAt: { not: null } }),
    );
    expect(prisma.dafSession.findMany).toHaveBeenCalledWith(
      whereOf({ studentId: 10001, passed: true, lessonId: { in: [2] } }),
    );
  });

  it('reads the birth date as the Tashkent day', async () => {
    const prisma = makePrisma();
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    expect(facts.student).toEqual({
      firstName: 'Madina',
      lastName: 'Karimova',
      dateOfBirth: '2004-03-14',
    });
  });

  it('tallies a level over several groups, counting an announced «sababsiz» absence and skipping a cancelled lesson', async () => {
    const g1 = group('A1-17', 'A1');
    const g2 = group('A1-21', 'a1', 'Deutsch A1 Intensiv', 60);
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', g1),
      att('2026-07-09', AttendanceStatus.LATE, 'g1', g1),
      att('2026-07-14', AttendanceStatus.EXCUSED, 'g1', g1), // announced sababsiz
      att('2026-07-16', AttendanceStatus.EXCUSED, 'g1', g1, 'c1'), // cancelled
      att('2026-08-04', AttendanceStatus.ABSENT, 'g2', g2),
      att('2026-08-06', AttendanceStatus.PRESENT, 'g2', g2),
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
      plannedAbsence: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ groupId: 'g1', date: d('2026-07-14') }]),
      },
    });
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    expect(facts.levels).toHaveLength(1);
    const a1 = facts.levels[0];
    expect(a1.level).toBe('A1');
    expect(a1.attendance).toEqual({
      attended: 3,
      late: 1,
      absent: 2,
      counted: 5,
      percent: 60,
    });
    expect(a1.groupNames).toEqual(['A1-17', 'A1-21']);
    expect(a1.from).toBe('2026-07-07');
    expect(a1.to).toBe('2026-08-06');
    // The latest group names the course and the lesson length.
    expect(a1.courseName).toBe('Deutsch A1 Intensiv');
    expect(a1.lessonMinutes).toBe(60);
  });

  it('lists groups without a GER level apart and keeps them out of the levels', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', group('X-1', null)),
      att(
        '2026-07-09',
        AttendanceStatus.PRESENT,
        'g2',
        group('Y-1', 'Beginner'),
      ),
      att('2026-07-11', AttendanceStatus.PRESENT, 'g3', group('A2-3', 'A2')),
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
    });
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    expect(facts.unleveledGroups.sort()).toEqual(['X-1', 'Y-1']);
    expect(facts.levels.map((l) => l.level)).toEqual(['A2']);
  });

  it('sorts levels A1 to C2 and honours onlyLevel', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g2', group('B1-1', 'B1')),
      att('2026-07-09', AttendanceStatus.PRESENT, 'g1', group('A1-1', 'A1')),
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
    });
    const svc = new ParticipationFactsService(prisma as never);
    expect((await svc.load(10001, 1001)).levels.map((l) => l.level)).toEqual([
      'A1',
      'B1',
    ]);
    expect(
      (await svc.load(10001, 1001, 'B1')).levels.map((l) => l.level),
    ).toEqual(['B1']);
  });

  it('measures the app over open lessons only and counts passed unit tests', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', group('A1-17', 'A1')),
    ];
    const lessons = [
      { id: 1, unitId: 10, kind: 'SECTION_A', _count: { exercises: 3 } },
      { id: 2, unitId: 10, kind: 'UNIT_TEST', _count: { exercises: 0 } },
      { id: 3, unitId: 11, kind: 'SECTION_A', _count: { exercises: 0 } },
      { id: 4, unitId: 11, kind: 'UNIT_TEST', _count: { exercises: 0 } },
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
      dafLesson: { findMany: jest.fn().mockResolvedValue(lessons) },
      dafLessonProgress: {
        findMany: jest.fn().mockResolvedValue([{ lessonId: 1 }]),
      },
      dafSession: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ lessonId: 2 }, { lessonId: 2 }]),
      },
    });
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    const a1 = facts.levels[0];
    // Open: lesson 1 (has exercises) and lesson 2 (unit test of a unit with
    // material). Lessons 3 and 4 belong to a unit with no material yet.
    expect(a1.app).toEqual({ applies: true, done: 1, open: 2, percent: 50 });
    expect(a1.unitTests).toEqual({ passed: 1, total: 1 });
    expect(prisma.dafLessonProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lessonId: { in: [1, 2] } }),
      }),
    );
  });

  it('does not ask the app about a level it does not teach', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', group('B2-1', 'B2')),
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
    });
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    expect(facts.levels[0].app.applies).toBe(false);
    expect(facts.levels[0].unitTests).toBeNull();
    expect(prisma.dafLesson.findMany).not.toHaveBeenCalled();
  });

  it('adds the latest mock result of the level, only from an announced exam', async () => {
    const rows: Row[] = [
      att('2026-07-07', AttendanceStatus.PRESENT, 'g1', group('A1-17', 'A1')),
    ];
    const prisma = makePrisma({
      attendance: { findMany: jest.fn().mockResolvedValue(rows) },
      mockExamParticipant: {
        findFirst: jest.fn().mockResolvedValue({
          totalScore: 72,
          gradedAt: new Date('2026-10-08T07:00:00.000Z'),
          exam: {
            maxScore: 100,
            examDate: new Date('2026-10-07T04:00:00.000Z'),
          },
        }),
      },
    });
    const facts = await new ParticipationFactsService(prisma as never).load(
      10001,
      1001,
    );
    expect(facts.levels[0].mock).toEqual({
      score: 72,
      maxScore: 100,
      date: '2026-10-07',
    });
    expect(prisma.mockExamParticipant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: 10001,
          companyId: 1001,
          deletedAt: null,
          // A result of an exam still in grading can change; the snapshot is sealed.
          exam: {
            status: { in: [MockExamStatus.ANNOUNCED, MockExamStatus.ARCHIVED] },
            deletedAt: null,
          },
        }),
      }),
    );
  });
});
