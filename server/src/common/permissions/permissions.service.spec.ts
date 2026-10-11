import { Logger } from '@nestjs/common';
import { PERMISSION_KEYS, defaultKeysForRoles } from './permission-catalog';
import { PermissionsService } from './permissions.service';

type Role = { id: number; name: string };
type Override = { roleId: number; key: string; granted: boolean };

const userRow = (roles: Role[]) => ({
  companyId: 1,
  roles: roles.map((role) => ({ role })),
});

function prismaReturning(roles: Role[] | null, overrides: Override[] = []) {
  return {
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue(roles === null ? null : userRow(roles)),
    },
    rolePermission: { findMany: jest.fn().mockResolvedValue(overrides) },
  };
}

describe('PermissionsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it("reads the roles and the role's stored changes for an account that may act", async () => {
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
        companyId: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
      where: { companyId: 1, roleId: { in: [4] } },
      select: { roleId: true, key: true, granted: true },
    });
    expect(access.roleNames).toEqual(['Teacher']);
    expect([...access.keys].sort()).toEqual(['attendance.mark', 'groups.view']);
  });

  it('applies the stored changes of the roles held', async () => {
    const prisma = prismaReturning(
      [{ id: 3, name: 'Administrator' }],
      [
        { roleId: 3, key: 'students.sms', granted: false },
        { roleId: 3, key: 'students.initial-balance', granted: true },
      ],
    );
    const service = new PermissionsService(prisma as never);

    const access = await service.forUser(10501);

    expect(access.keys.has('students.sms')).toBe(false);
    expect(access.keys.has('students.initial-balance')).toBe(true);
    expect(access.roleIds).toEqual([3]);
  });

  it('gives the CEO every capability without reading stored changes', async () => {
    const prisma = prismaReturning([{ id: 1, name: 'CEO' }]);
    const service = new PermissionsService(prisma as never);
    expect((await service.forUser(10001)).keys.size).toBe(
      PERMISSION_KEYS.length,
    );
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('gives a student nothing without reading stored changes', async () => {
    const prisma = prismaReturning([{ id: 6, name: 'Student' }]);
    const service = new PermissionsService(prisma as never);
    expect((await service.forUser(10502)).keys.size).toBe(0);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('gives a blocked, archived or unknown account nothing', async () => {
    const prisma = prismaReturning(null);
    const service = new PermissionsService(prisma as never);
    const access = await service.forUser(10002);
    expect(access.roleIds).toEqual([]);
    expect(access.keys.size).toBe(0);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
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

  it('loads one user once when several requests ask at the same time', async () => {
    const prisma = prismaReturning([{ id: 3, name: 'Administrator' }]);
    const service = new PermissionsService(prisma as never);

    const [first, second] = await Promise.all([
      service.forUser(10005),
      service.forUser(10005),
    ]);

    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('reads the database again after invalidateAll', async () => {
    const prisma = prismaReturning([{ id: 3, name: 'Administrator' }]);
    const service = new PermissionsService(prisma as never);

    await service.forUser(10006);
    service.invalidateAll();
    await service.forUser(10006);

    expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
  });

  it('does not keep an answer whose load started before invalidateAll', async () => {
    const prisma = prismaReturning([{ id: 3, name: 'Administrator' }]);
    let release: (value: unknown) => void = () => undefined;
    prisma.user.findFirst.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const service = new PermissionsService(prisma as never);

    const stale = service.forUser(10007);
    service.invalidateAll();
    const fresh = service.forUser(10007);
    // The request after the write did not wait on the load from before it.
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);

    release(userRow([{ id: 2, name: 'Branch Director' }]));
    expect((await stale).roleNames).toEqual(['Branch Director']);
    expect((await fresh).roleNames).toEqual(['Administrator']);

    expect((await service.forUser(10007)).roleNames).toEqual(['Administrator']);
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
  });

  it('logs and ignores a stored key the catalog no longer has', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = new PermissionsService(
      prismaReturning(
        [{ id: 3, name: 'Administrator' }],
        [
          { roleId: 3, key: 'old.key', granted: true },
          { roleId: 3, key: 'old.key', granted: false },
        ],
      ) as never,
    );

    const access = await service.forUser(10008);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('old.key');
    expect([...access.keys].sort()).toEqual(
      [...defaultKeysForRoles([3])].sort(),
    );
  });
});
