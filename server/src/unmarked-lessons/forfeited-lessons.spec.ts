import {
  isLessonPayForfeited,
  lessonKey,
  loadForfeitedLessonKeys,
} from './forfeited-lessons';

describe('lessonKey', () => {
  it('uses the UTC calendar day of a @db.Date value', () => {
    expect(lessonKey('g1', new Date('2026-09-28T00:00:00.000Z'))).toBe(
      'g1:2026-09-28',
    );
    expect(lessonKey('g1', new Date('2026-09-28T08:00:00.000Z'))).toBe(
      'g1:2026-09-28',
    );
  });
});

describe('isLessonPayForfeited', () => {
  const db = (row: unknown) =>
    ({
      unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(row) },
    }) as any;

  it('is false when nobody opened the lesson', async () => {
    expect(
      await isLessonPayForfeited(
        db(null),
        'g1',
        new Date('2026-09-28T00:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('is false for an exempt lesson and true otherwise', async () => {
    expect(
      await isLessonPayForfeited(
        db({ teacherPayExempt: true }),
        'g1',
        new Date('2026-09-28T00:00:00.000Z'),
      ),
    ).toBe(false);
    expect(
      await isLessonPayForfeited(
        db({ teacherPayExempt: false }),
        'g1',
        new Date('2026-09-28T00:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('looks the lesson up by its calendar day', async () => {
    const d = db(null);
    await isLessonPayForfeited(d, 'g1', new Date('2026-09-28T08:00:00.000Z'));
    expect(d.unmarkedLesson.findUnique).toHaveBeenCalledWith({
      where: {
        groupId_date: {
          groupId: 'g1',
          date: new Date('2026-09-28T00:00:00.000Z'),
        },
      },
      select: { teacherPayExempt: true },
    });
  });
});

describe('loadForfeitedLessonKeys', () => {
  it('returns the keys of non-exempt rows in the window', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { groupId: 'g1', date: new Date('2026-09-28T00:00:00.000Z') },
      { groupId: 'g2', date: new Date('2026-09-29T00:00:00.000Z') },
    ]);
    const from = new Date('2026-09-01T00:00:00.000Z');
    const toExclusive = new Date('2026-10-01T00:00:00.000Z');
    const keys = await loadForfeitedLessonKeys(
      { unmarkedLesson: { findMany } } as any,
      { companyId: 7, from, toExclusive },
    );
    expect([...keys]).toEqual(['g1:2026-09-28', 'g2:2026-09-29']);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        companyId: 7,
        teacherPayExempt: false,
        date: { gte: from, lt: toExclusive },
      },
      select: { groupId: true, date: true },
    });
  });
});
