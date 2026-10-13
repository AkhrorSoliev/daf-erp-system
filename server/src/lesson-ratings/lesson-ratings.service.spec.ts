import { NotFoundException } from '@nestjs/common';
import { LessonRatingsService } from './lesson-ratings.service';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function setup(rows: Record<string, unknown>[] = []) {
  const prisma = {
    lessonRating: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
    user: {
      findMany: jest.fn(
        async ({ where }: { where: { id: { in: number[] } } }) =>
          where.id.in.map((id) => ({
            id,
            firstName: 'U',
            lastName: String(id),
          })),
      ),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 7, firstName: 'Anna', lastName: 'S' }),
    },
  };
  const settings = {
    get: jest.fn().mockResolvedValue(true),
    set: jest.fn().mockResolvedValue(false),
  };
  return {
    service: new LessonRatingsService(prisma as never, settings as never),
    prisma,
    settings,
  };
}

type FindManyArgs = { where: unknown; skip?: number; take?: number };
const findManyArgs = (p: { lessonRating: { findMany: jest.Mock } }) =>
  (p.lessonRating.findMany.mock.calls as [FindManyArgs][]).map((c) => c[0]);

describe('LessonRatingsService.summary', () => {
  it('reads the month and the one before inside the branch scope', async () => {
    const { service, prisma } = setup();
    await service.summary(1, [7], '2026-11');
    const wheres = findManyArgs(prisma).map((a) => a.where);
    expect(wheres).toContainEqual({
      companyId: 1,
      date: { gte: d('2026-11-01'), lt: d('2026-12-01') },
      branchId: { in: [7] },
    });
    expect(wheres).toContainEqual({
      companyId: 1,
      date: { gte: d('2026-10-01'), lt: d('2026-11-01') },
      branchId: { in: [7] },
    });
  });

  it('lists teachers lowest average first with their names', async () => {
    const { service } = setup([
      { score: 5, messageId: 1, teacherIds: [1] },
      { score: 2, messageId: 2, teacherIds: [2] },
    ]);
    const r = await service.summary(1, null, '2026-10');
    expect(r.enabled).toBe(true);
    expect(r.teachers.map((t) => t.teacherId)).toEqual([2, 1]);
    expect(r.teachers[0]).toMatchObject({ name: 'U 2', average: 2, low: 1 });
  });
});

describe('LessonRatingsService.teacher', () => {
  it('answers 404 for an unknown teacher', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.teacher(1, null, 99, '2026-10'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('gives six months, the month by group and its comments', async () => {
    const { service, prisma } = setup([
      {
        date: d('2026-10-05'),
        score: 2,
        messageId: 1,
        comment: 'kech',
        groupId: 'g1',
        studentId: 10001,
        teacherIds: [7],
        group: { name: 'A1-3' },
        student: { firstName: 'Ali', lastName: 'V' },
      },
      {
        date: d('2026-09-10'),
        score: 5,
        messageId: 2,
        comment: null,
        groupId: 'g1',
        studentId: 10002,
        teacherIds: [7],
        group: { name: 'A1-3' },
        student: { firstName: 'Bek', lastName: 'Q' },
      },
    ]);
    const r = await service.teacher(1, null, 7, '2026-10');
    expect(findManyArgs(prisma)[0].where).toMatchObject({
      companyId: 1,
      teacherIds: { has: 7 },
      date: { gte: d('2026-05-01'), lt: d('2026-11-01') },
    });
    expect(r.months.map((m) => m.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(r.months[4]).toEqual({ month: '2026-09', average: 5, rated: 1 });
    expect(r.groups).toEqual([
      { groupId: 'g1', name: 'A1-3', average: 2, rated: 1 },
    ]);
    expect(r.comments).toEqual([
      {
        date: '2026-10-05',
        groupName: 'A1-3',
        studentId: 10001,
        studentName: 'Ali V',
        score: 2,
        comment: 'kech',
      },
    ]);
  });
});

describe('LessonRatingsService.low', () => {
  it('pages the 1–3 scores of the month, newest first', async () => {
    const { service, prisma } = setup([
      {
        id: 'r1',
        date: d('2026-10-05'),
        score: 1,
        comment: null,
        groupId: 'g1',
        studentId: 10001,
        teacherIds: [7],
        group: { name: 'A1-3' },
        student: { firstName: 'Ali', lastName: 'V' },
      },
    ]);
    const r = await service.low(1, null, '2026-10', 2, 20);
    const args = findManyArgs(prisma)[0];
    expect(args.where).toEqual({
      companyId: 1,
      date: { gte: d('2026-10-01'), lt: d('2026-11-01') },
      score: { lte: 3 },
    });
    expect(args.skip).toBe(20);
    expect(args.take).toBe(20);
    expect(r).toMatchObject({ total: 1, page: 2, pageSize: 20 });
    expect(r.data[0]).toMatchObject({
      id: 'r1',
      date: '2026-10-05',
      teacherNames: ['U 7'],
      studentName: 'Ali V',
    });
  });
});

describe('LessonRatingsService.setEnabled', () => {
  it('writes the company-level setting', async () => {
    const { service, settings } = setup();
    await expect(service.setEnabled(1, false, 10001)).resolves.toEqual({
      enabled: false,
    });
    expect(settings.set).toHaveBeenCalledWith(
      1,
      'lessonRating.enabled',
      false,
      10001,
    );
  });
});
