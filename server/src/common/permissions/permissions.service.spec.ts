import { PermissionsService } from './permissions.service';

function prismaReturning(rows: Array<{ id: number; name: string }> | null) {
  return {
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          rows === null ? null : { roles: rows.map((role) => ({ role })) },
        ),
    },
  };
}

describe('PermissionsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads the roles from the database for an account that may act', async () => {
    const prisma = prismaReturning([{ id: 4, name: 'Teacher' }]);
    const service = new PermissionsService(prisma as never);

    const access = await service.forUser(10500);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 10500,
        deletedAt: null,
        status: { notIn: expect.any(Array) },
      },
      select: {
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    expect(access.roleNames).toEqual(['Teacher']);
    expect([...access.keys].sort()).toEqual(['attendance.mark', 'groups.view']);
  });

  it('gives the CEO every capability', async () => {
    const service = new PermissionsService(
      prismaReturning([{ id: 1, name: 'CEO' }]) as never,
    );
    expect((await service.forUser(10001)).keys.size).toBe(66);
  });

  it('gives a blocked, archived or unknown account nothing', async () => {
    const service = new PermissionsService(prismaReturning(null) as never);
    const access = await service.forUser(10002);
    expect(access.roleIds).toEqual([]);
    expect(access.keys.size).toBe(0);
  });

  it('answers from memory for ten seconds, then asks the database again', async () => {
    const prisma = prismaReturning([{ id: 3, name: 'Administrator' }]);
    const service = new PermissionsService(prisma as never);
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await service.forUser(10003);
    now.mockReturnValue(1_000_000 + PermissionsService.CACHE_MS - 1);
    await service.forUser(10003);
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + PermissionsService.CACHE_MS);
    await service.forUser(10003);
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
  });

  it('answers a single capability', async () => {
    const service = new PermissionsService(
      prismaReturning([{ id: 5, name: 'Cashier' }]) as never,
    );
    expect(await service.has(10004, 'payments.create')).toBe(true);
    expect(await service.has(10004, 'payments.correct')).toBe(false);
  });
});
