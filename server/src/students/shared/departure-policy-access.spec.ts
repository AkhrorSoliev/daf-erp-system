import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertMayChooseDeparturePolicy } from './departure-policy-access';

describe('assertMayChooseDeparturePolicy (ADR-0043)', () => {
  let findFirst: jest.Mock;
  let prisma: PrismaService;

  beforeEach(() => {
    findFirst = jest.fn();
    prisma = { user: { findFirst } } as unknown as PrismaService;
  });

  it('lets anyone who may remove a student keep the default (their own decision)', async () => {
    await expect(
      assertMayChooseDeparturePolicy(prisma, 10001, undefined),
    ).resolves.toBeUndefined();
    await expect(
      assertMayChooseDeparturePolicy(prisma, 10001, 'STUDENT_CANCELLED'),
    ).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('asks the database — not the token — for an active CEO or branch director', async () => {
    findFirst.mockResolvedValue({ id: 10001 });
    await assertMayChooseDeparturePolicy(prisma, 10001, 'QUALITY_CLAIM');
    expect(findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 10001,
        deletedAt: null,
        status: expect.objectContaining({ notIn: expect.any(Array) }),
        roles: {
          some: { role: { name: { in: ['CEO', 'Branch Director'] } } },
        },
      }),
      select: { id: true },
    });
  });

  it('refuses anyone else (an administrator, a blocked account)', async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      assertMayChooseDeparturePolicy(prisma, 10002, 'CENTER_INITIATIVE'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a non-default policy with no signed-in caller', async () => {
    await expect(
      assertMayChooseDeparturePolicy(prisma, undefined, 'QUALITY_CLAIM'),
    ).rejects.toThrow(ForbiddenException);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
