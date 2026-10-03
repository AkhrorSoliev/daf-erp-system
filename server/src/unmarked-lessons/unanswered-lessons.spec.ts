import { BadRequestException } from '@nestjs/common';
import { assertNoUnansweredLessons } from './unanswered-lessons';

/** ADR-0068: a group is closed only once its «Dars bo'ldimi?» questions are answered. */
describe('assertNoUnansweredLessons', () => {
  const pending = (date: string, name: string) => ({
    date: new Date(`${date}T00:00:00.000Z`),
    group: { name },
  });

  it('lets the group close when nothing is waiting, reading only the groups named', async () => {
    const db = {
      unmarkedLesson: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await expect(
      assertNoUnansweredLessons(db as never, { branchId: 2, deletedAt: null }),
    ).resolves.toBeUndefined();
    expect(db.unmarkedLesson.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING', group: { branchId: 2, deletedAt: null } },
      }),
    );
  });

  it('refuses and names each lesson still waiting', async () => {
    const db = {
      unmarkedLesson: {
        findMany: jest.fn().mockResolvedValue([pending('2026-10-02', '#011')]),
      },
    };

    const err: unknown = await assertNoUnansweredLessons(db as never, {
      id: 'g-011',
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe(
      "Avval «Dars bo'ldimi?» savoliga javob bering: 02.10 (#011). Javob berilmagan darsi bor guruhni yopib bo'lmaydi.",
    );
  });

  it('names five lessons and counts the rest', async () => {
    const days = ['01', '02', '05', '07', '09', '12', '14'];
    const db = {
      unmarkedLesson: {
        findMany: jest
          .fn()
          .mockResolvedValue(days.map((d) => pending(`2026-10-${d}`, '#014'))),
      },
    };

    await expect(
      assertNoUnansweredLessons(db as never, { courseId: 'c-1' }),
    ).rejects.toThrow(
      "Avval «Dars bo'ldimi?» savoliga javob bering: 01.10 (#014), 02.10 (#014), 05.10 (#014), 07.10 (#014), 09.10 (#014) va yana 2 ta. Javob berilmagan darsi bor guruhni yopib bo'lmaydi.",
    );
  });
});
