import { ForbiddenException } from '@nestjs/common';
import { LevelTestResultsService } from './level-test-results.service';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn(),
}));

const row = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  createdAt: new Date(),
  finishedAt: new Date(),
  status: 'COMPLETED',
  result: 'A2',
  answered: 20,
  correctByLevel: { A1: 5, A2: 4 },
  ...over,
});

describe('LevelTestResultsService', () => {
  const prisma = { levelTestAttempt: { findMany: jest.fn() } };
  const service = new LevelTestResultsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('checks the caller against the student first', async () => {
    (assertCallerMayTouchStudent as jest.Mock).mockRejectedValueOnce(
      new ForbiddenException(),
    );
    await expect(service.forStudent(1, 2, 3)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.levelTestAttempt.findMany).not.toHaveBeenCalled();
  });

  it('sums correct answers and picks the latest real result', async () => {
    prisma.levelTestAttempt.findMany.mockResolvedValue([
      row({ id: 'u', result: 'UNKNOWN' }),
      row({ id: 'ok' }),
    ]);
    const res = await service.forStudent(1, 2, 3);
    expect(res.attempts[1].correct).toBe(9);
    expect(res.latest?.id).toBe('ok');
  });

  it('an in-progress attempt older than an hour reads as abandoned', async () => {
    prisma.levelTestAttempt.findMany.mockResolvedValue([
      row({
        status: 'IN_PROGRESS',
        result: null,
        createdAt: new Date(Date.now() - 2 * 3600_000),
      }),
    ]);
    const res = await service.forStudent(1, 2, 3);
    expect(res.attempts[0].status).toBe('ABANDONED');
    expect(res.latest).toBeNull();
  });

  it('stats reads the month for the company only', async () => {
    prisma.levelTestAttempt.findMany.mockResolvedValue([row()]);
    const s = await service.stats(2, '2026-10');
    expect(s.started).toBe(1);
    expect(prisma.levelTestAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 2 }),
      }),
    );
  });
});
