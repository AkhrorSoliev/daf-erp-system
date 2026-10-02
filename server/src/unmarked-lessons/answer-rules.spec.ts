import { ConflictException, NotFoundException } from '@nestjs/common';
import { assertMayAnswer, findPendingUnmarkedLesson } from './answer-rules';

const date = new Date('2026-09-28T00:00:00.000Z');

describe('findPendingUnmarkedLesson', () => {
  const db = (row: unknown) =>
    ({
      unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(row) },
    }) as any;

  it('returns a pending lesson of the company', async () => {
    const row = { id: 'u1', companyId: 1, status: 'PENDING' };
    expect(
      await findPendingUnmarkedLesson(db(row), {
        groupId: 'g1',
        date,
        companyId: 1,
      }),
    ).toBe(row);
  });

  it.each([
    ['missing', null],
    ['another company', { id: 'u1', companyId: 2, status: 'PENDING' }],
    ['answered', { id: 'u1', companyId: 1, status: 'HELD' }],
  ])('404s when %s', async (_label, row) => {
    await expect(
      findPendingUnmarkedLesson(db(row), { groupId: 'g1', date, companyId: 1 }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('assertMayAnswer', () => {
  const db = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ firstName: 'Ali', lastName: 'Valiyev' }),
    },
  } as any;

  it('lets anyone answer an unclaimed lesson, and the holder a claimed one', async () => {
    await expect(
      assertMayAnswer(db, { claimedById: null }, 3, ['Administrator']),
    ).resolves.toBeUndefined();
    await expect(
      assertMayAnswer(db, { claimedById: 3 }, 3, ['Administrator']),
    ).resolves.toBeUndefined();
  });

  it('lets directors and the CEO answer whoever holds it', async () => {
    await expect(
      assertMayAnswer(db, { claimedById: 3 }, 9, ['Branch Director']),
    ).resolves.toBeUndefined();
    await expect(
      assertMayAnswer(db, { claimedById: 3 }, 1, ['CEO']),
    ).resolves.toBeUndefined();
  });

  it('stops another administrator and names the holder', async () => {
    await expect(
      assertMayAnswer(db, { claimedById: 3 }, 4, ['Administrator']),
    ).rejects.toThrow(
      new ConflictException('Bu darsga Ali Valiyev javob bermoqda'),
    );
  });
});
