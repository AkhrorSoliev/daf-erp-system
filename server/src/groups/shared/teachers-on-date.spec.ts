import {
  buildTeachersOnDate,
  lessonStartInstant,
  loadTeachersOnLesson,
  teachersAtLesson,
} from './teachers-on-date';

const change = (groupId: string, prev: number[], iso: string) => ({
  groupId,
  previousTeacherIds: prev,
  createdAt: new Date(iso),
});

describe('lessonStartInstant', () => {
  it("is the Tashkent day at the group's start time", () => {
    // 02.10 15:30 Tashkent = 10:30 UTC.
    expect(lessonStartInstant('2026-10-02', '15:30')).toEqual(
      new Date('2026-10-02T10:30:00.000Z'),
    );
  });

  it("is the day's 00:00 without a start time", () => {
    expect(lessonStartInstant('2026-10-02', null)).toEqual(
      new Date('2026-10-01T19:00:00.000Z'),
    );
  });
});

describe('teachersAtLesson (ADR-0144)', () => {
  // 22.10.2026 10:44 Tashkent — the #010/#011 change.
  const c22 = change('g1', [10933], '2026-10-22T05:44:00.000Z');
  const at = (d: string, t = '15:30') => lessonStartInstant(d, t);

  it("today's roster when nothing changed since the lesson", () => {
    expect(teachersAtLesson([10932], [], at('2026-10-02'))).toEqual([10932]);
    expect(teachersAtLesson([10932], [c22], at('2026-10-23'))).toEqual([10932]);
  });

  it('the roster before the first change made after the lesson started', () => {
    expect(teachersAtLesson([10932], [c22], at('2026-10-02'))).toEqual([10933]);
    expect(teachersAtLesson([10932], [c22], at('2026-10-21'))).toEqual([10933]);
  });

  it('a change made before the lesson on the same day counts for it', () => {
    expect(teachersAtLesson([10932], [c22], at('2026-10-22'))).toEqual([10932]);
  });

  it('a change made after the lesson on the same day does not', () => {
    // 22.10 at 08:00 Tashkent: the change at 10:44 came after it.
    expect(teachersAtLesson([10932], [c22], at('2026-10-22', '08:00'))).toEqual(
      [10933],
    );
  });

  it('of several later changes, the earliest one decides', () => {
    const a = change('g1', [1], '2026-10-10T06:00:00.000Z');
    const b = change('g1', [2], '2026-10-20T06:00:00.000Z');
    expect(teachersAtLesson([3], [b, a], at('2026-10-05'))).toEqual([1]);
    expect(teachersAtLesson([3], [b, a], at('2026-10-15'))).toEqual([2]);
    expect(teachersAtLesson([3], [b, a], at('2026-10-25'))).toEqual([3]);
  });

  it('an empty roster before the first teacher was added stays empty', () => {
    const added = change('g1', [], '2026-10-10T06:00:00.000Z');
    expect(teachersAtLesson([5], [added], at('2026-10-05'))).toEqual([]);
  });

  it('buildTeachersOnDate reads each group by its own start time', () => {
    const on = buildTeachersOnDate(
      [
        { groupId: 'g1', teacherId: 10932 },
        { groupId: 'g2', teacherId: 7 },
      ],
      [c22, change('g2', [6], '2026-10-22T05:44:00.000Z')],
      [
        { id: 'g1', lessonStartTime: '15:30' },
        { id: 'g2', lessonStartTime: '08:00' },
      ],
    );
    expect(on('g1', '2026-10-02')).toEqual([10933]);
    expect(on('g1', '2026-10-22')).toEqual([10932]);
    expect(on('g2', '2026-10-22')).toEqual([6]);
    expect(on('g3', '2026-10-02')).toEqual([]);
  });
});

describe('loadTeachersOnLesson', () => {
  const db = () =>
    ({
      group: {
        findUnique: jest.fn().mockResolvedValue({ lessonStartTime: '15:30' }),
      },
      groupTeacherHistory: { findFirst: jest.fn() },
      groupTeacher: {
        findMany: jest.fn().mockResolvedValue([{ teacherId: 10932 }]),
      },
    }) as any;

  it('asks for the first change made after the lesson started', async () => {
    const d = db();
    d.groupTeacherHistory.findFirst.mockResolvedValue({
      previousTeacherIds: [10933],
    });
    const ids = await loadTeachersOnLesson(
      d,
      'g1',
      new Date('2026-10-02T00:00:00.000Z'),
    );
    expect(ids).toEqual([10933]);
    expect(d.groupTeacherHistory.findFirst).toHaveBeenCalledWith({
      where: {
        groupId: 'g1',
        createdAt: { gt: new Date('2026-10-02T10:30:00.000Z') },
      },
      orderBy: { createdAt: 'asc' },
      select: { previousTeacherIds: true },
    });
    expect(d.groupTeacher.findMany).not.toHaveBeenCalled();
  });

  it("falls back to today's roster when nothing changed since", async () => {
    const d = db();
    d.groupTeacherHistory.findFirst.mockResolvedValue(null);
    expect(
      await loadTeachersOnLesson(d, 'g1', new Date('2026-10-23T00:00:00.000Z')),
    ).toEqual([10932]);
  });
});
