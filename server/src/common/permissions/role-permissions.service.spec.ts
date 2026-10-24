import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  LOCK,
  PERMISSIONS,
  PERMISSION_KEYS,
  PermissionKey,
  defaultKeysForRoles,
} from './permission-catalog';
import { RolePermissionsService } from './role-permissions.service';

const COMPANY = 1001;
const CEO_USER = 10001;
const label = (key: PermissionKey) => PERMISSIONS[key].label;

type Row = { roleId: number; key: string; granted: boolean };

function setup(rows: Row[] = []) {
  const tx = {
    rolePermission: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: { roleId: number } }) =>
          Promise.resolve(rows.filter((r) => r.roleId === where.roleId)),
        ),
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: jest
      .fn()
      .mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)),
    role: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 5 }, { id: 2 }, { id: 4 }, { id: 3 }]),
    },
    rolePermission: { findMany: jest.fn().mockResolvedValue(rows) },
    entityHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const history = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
  const permissions = { invalidateAll: jest.fn() };
  const service = new RolePermissionsService(
    prisma as never,
    history as never,
    permissions as never,
  );
  return { service, prisma, tx, history, permissions };
}

/** Nothing was stored, journaled or uncached. */
function expectNothingWritten(s: ReturnType<typeof setup>) {
  expect(s.tx.rolePermission.upsert).not.toHaveBeenCalled();
  expect(s.tx.rolePermission.deleteMany).not.toHaveBeenCalled();
  expect(s.history.recordUpdate).not.toHaveBeenCalled();
  expect(s.permissions.invalidateAll).not.toHaveBeenCalled();
}

describe('RolePermissionsService.updateRole — refusals (spec §12)', () => {
  it.each([1, 6, 99])(
    'refuses role %i before reading anything',
    async (roleId) => {
      const s = setup();
      await expect(
        s.service.updateRole(
          COMPANY,
          roleId,
          [{ key: 'cash.manage', granted: true }],
          CEO_USER,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          "Bu rolning ruxsatlarini o'zgartirib bo'lmaydi",
        ),
      );
      expect(s.prisma.$transaction).not.toHaveBeenCalled();
      expectNothingWritten(s);
    },
  );

  it('refuses a key sent twice', async () => {
    const s = setup();
    await expect(
      s.service.updateRole(
        COMPANY,
        3,
        [
          { key: 'cash.manage', granted: true },
          { key: 'cash.manage', granted: false },
        ],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException('Bir imkoniyat ikki marta yuborildi'),
    );
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
    expectNothingWritten(s);
  });

  it('refuses a grant outside allowedRoles, naming the lock reason', async () => {
    const s = setup();
    await expect(
      s.service.updateRole(
        COMPANY,
        2,
        [{ key: 'salary.close', granted: true }],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        `${label('salary.close')}: Filial direktori uchun yoqib bo'lmaydi — ${LOCK.COMPANY}`,
      ),
    );
    await expect(
      s.service.updateRole(
        COMPANY,
        4,
        [{ key: 'students.list', granted: true }],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        `${label('students.list')}: O'qituvchi uchun yoqib bo'lmaydi — ${LOCK.OWN_GROUPS}`,
      ),
    );
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
    expectNothingWritten(s);
  });

  it('refuses a change of a key outside allowedRoles even when it only turns it off', async () => {
    const s = setup();
    await expect(
      s.service.updateRole(
        COMPANY,
        2,
        [{ key: 'salary.close', granted: false }],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        `${label('salary.close')}: Filial direktori uchun o'zgartirib bo'lmaydi — ${LOCK.COMPANY}`,
      ),
    );
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
    expectNothingWritten(s);
  });

  it('refuses a grant that pulls in a key outside allowedRoles', async () => {
    // The catalog is closed under `requires` today, so a pulled key is never
    // outside the role's list. Break that on purpose: the save must still
    // refuse by itself, not trust the page's planToggle.
    const requires = PERMISSIONS['expenses.manage'].requires;
    const view = PERMISSIONS['expenses.view'];
    const original = view.allowedRoles;
    (view as { allowedRoles: readonly number[] }).allowedRoles =
      original.filter((id) => id !== 3);
    try {
      expect(requires).toContain('expenses.view');
      const s = setup();
      await expect(
        s.service.updateRole(
          COMPANY,
          3,
          [{ key: 'expenses.manage', granted: true }],
          CEO_USER,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(s.prisma.$transaction).not.toHaveBeenCalled();
      expectNothingWritten(s);
    } finally {
      (view as { allowedRoles: readonly number[] }).allowedRoles = original;
    }
  });

  it('refuses a grant whose requirement stays off', async () => {
    const s = setup();
    await expect(
      s.service.updateRole(
        COMPANY,
        3,
        [{ key: 'expenses.manage', granted: true }],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        `«${label('expenses.manage')}» uchun «${label('expenses.view')}» ham yoqilgan bo'lishi kerak`,
      ),
    );
    expectNothingWritten(s);
  });

  it('refuses a revoke that leaves a dependent on', async () => {
    // The Branch Director holds both by default; turning the view off alone
    // would leave «Xarajat kiritish» on without the page it lives on.
    const s = setup();
    await expect(
      s.service.updateRole(
        COMPANY,
        2,
        [{ key: 'expenses.view', granted: false }],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        `«${label('expenses.manage')}» uchun «${label('expenses.view')}» ham yoqilgan bo'lishi kerak`,
      ),
    );
    expectNothingWritten(s);
  });

  it('turns a lost race into 409 and keeps the cache', async () => {
    const s = setup();
    s.prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('write conflict'), { code: 'P2034' }),
    );
    await expect(
      s.service.updateRole(
        COMPANY,
        3,
        [{ key: 'cash.manage', granted: true }],
        CEO_USER,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(s.permissions.invalidateAll).not.toHaveBeenCalled();
  });
});

describe('RolePermissionsService.updateRole — writes', () => {
  it('stores a grant with its requirement, journals both, then clears the cache', async () => {
    const s = setup();

    const result = await s.service.updateRole(
      COMPANY,
      3,
      [
        { key: 'expenses.view', granted: true },
        { key: 'expenses.manage', granted: true },
      ],
      CEO_USER,
    );

    expect(s.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(s.tx.rolePermission.upsert).toHaveBeenCalledTimes(2);
    expect(s.tx.rolePermission.upsert).toHaveBeenCalledWith({
      where: {
        companyId_roleId_key: {
          companyId: COMPANY,
          roleId: 3,
          key: 'expenses.manage',
        },
      },
      create: {
        companyId: COMPANY,
        roleId: 3,
        key: 'expenses.manage',
        granted: true,
        updatedById: CEO_USER,
      },
      update: { granted: true, updatedById: CEO_USER },
    });
    expect(s.tx.rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(s.history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'RolePermission',
      entityId: 3,
      oldValues: { 'expenses.view': false, 'expenses.manage': false },
      newValues: { 'expenses.view': true, 'expenses.manage': true },
      changedById: CEO_USER,
      companyId: COMPANY,
      tx: s.tx,
    });
    expect(result).toEqual({
      roleId: 3,
      granted: [
        ...defaultKeysForRoles([3]),
        'expenses.manage',
        'expenses.view',
      ].sort(),
    });
    expect(s.permissions.invalidateAll).toHaveBeenCalledTimes(1);
    expect(
      s.permissions.invalidateAll.mock.invocationCallOrder[0],
    ).toBeGreaterThan(s.history.recordUpdate.mock.invocationCallOrder[0]);
  });

  it('stores a revoked default as granted: false', async () => {
    const s = setup();

    await s.service.updateRole(
      COMPANY,
      2,
      [{ key: 'students.sms', granted: false }],
      CEO_USER,
    );

    expect(s.tx.rolePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          roleId: 2,
          key: 'students.sms',
          granted: false,
        }),
      }),
    );
    expect(s.history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { 'students.sms': true },
        newValues: { 'students.sms': false },
      }),
    );
  });

  it('deletes the row when a key goes back to its default', async () => {
    const s = setup([{ roleId: 3, key: 'cash.manage', granted: true }]);

    const result = await s.service.updateRole(
      COMPANY,
      3,
      [{ key: 'cash.manage', granted: false }],
      CEO_USER,
    );

    expect(s.tx.rolePermission.upsert).not.toHaveBeenCalled();
    expect(s.tx.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { companyId: COMPANY, roleId: 3, key: { in: ['cash.manage'] } },
    });
    expect(s.history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { 'cash.manage': true },
        newValues: { 'cash.manage': false },
      }),
    );
    expect(result.granted).toEqual([...defaultKeysForRoles([3])].sort());
  });

  it('writes no row and no history for a save that changes nothing', async () => {
    const s = setup();

    const result = await s.service.updateRole(
      COMPANY,
      3,
      [{ key: 'students.list', granted: true }],
      CEO_USER,
    );

    expect(s.tx.rolePermission.upsert).not.toHaveBeenCalled();
    expect(s.tx.rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(s.history.recordUpdate).not.toHaveBeenCalled();
    expect(result.granted).toEqual([...defaultKeysForRoles([3])].sort());
  });
});

describe('RolePermissionsService.resetRole', () => {
  it('drops every stored difference of the role and journals what changed', async () => {
    const s = setup([
      { roleId: 3, key: 'cash.manage', granted: true },
      { roleId: 3, key: 'students.sms', granted: false },
      { roleId: 2, key: 'students.sms', granted: false },
    ]);

    const result = await s.service.resetRole(COMPANY, 3, CEO_USER);

    const deleted = s.tx.rolePermission.deleteMany.mock.calls[0][0];
    expect(deleted.where).toMatchObject({ companyId: COMPANY, roleId: 3 });
    expect([...deleted.where.key.in].sort()).toEqual([
      'cash.manage',
      'students.sms',
    ]);
    expect(s.tx.rolePermission.upsert).not.toHaveBeenCalled();
    expect(s.history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'RolePermission',
        entityId: 3,
        oldValues: { 'students.sms': false, 'cash.manage': true },
        newValues: { 'students.sms': true, 'cash.manage': false },
      }),
    );
    expect(result).toEqual({
      roleId: 3,
      granted: [...defaultKeysForRoles([3])].sort(),
    });
    expect(s.permissions.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('journals nothing for a role already at its default', async () => {
    const s = setup();
    await s.service.resetRole(COMPANY, 5, CEO_USER);
    expect(s.history.recordUpdate).not.toHaveBeenCalled();
  });

  it('refuses the CEO and the student role', async () => {
    const s = setup();
    for (const roleId of [1, 6]) {
      await expect(
        s.service.resetRole(COMPANY, roleId, CEO_USER),
      ).rejects.toThrow("Bu rolning ruxsatlarini o'zgartirib bo'lmaydi");
    }
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('RolePermissionsService.overview', () => {
  it('returns the four editable roles in page order, the catalog and the effective keys', async () => {
    const s = setup([
      { roleId: 3, key: 'cash.manage', granted: true },
      { roleId: 2, key: 'students.sms', granted: false },
    ]);

    const o = await s.service.overview(COMPANY);

    expect(s.prisma.rolePermission.findMany).toHaveBeenCalledWith({
      where: { companyId: COMPANY },
      select: { roleId: true, key: true, granted: true },
    });
    expect(o.roles).toEqual([
      { id: 2, label: 'Filial direktori' },
      { id: 3, label: 'Administrator' },
      { id: 5, label: 'Kassir' },
      { id: 4, label: "O'qituvchi" },
    ]);
    expect(o.sections).toHaveLength(14);
    expect(o.catalog.map((c) => c.key)).toEqual(PERMISSION_KEYS);
    expect(o.catalog.find((c) => c.key === 'salary.close')).toEqual({
      key: 'salary.close',
      section: 'salary',
      label: label('salary.close'),
      requires: ['salary.view'],
      defaultRoles: [],
      allowedRoles: [],
      lockReasons: {
        2: LOCK.COMPANY,
        3: LOCK.COMPANY,
        5: LOCK.COMPANY,
        4: LOCK.COMPANY,
      },
      danger: 'money',
    });
    expect(o.catalog.find((c) => c.key === 'students.list')?.danger).toBe(null);
    expect(o.granted[3]).toContain('cash.manage');
    expect(o.granted[2]).not.toContain('students.sms');
    expect(o.granted[4]).toEqual(['attendance.mark', 'groups.view']);
    expect(o.granted[5]).toEqual([...defaultKeysForRoles([5])].sort());
  });
});

describe('RolePermissionsService.history', () => {
  it('pages the role-permission rows, newest first, changes in catalog order', async () => {
    const s = setup();
    s.prisma.entityHistory.findMany.mockResolvedValue([
      {
        id: 'h1',
        entityId: '3',
        createdAt: new Date('2026-10-12T05:00:00.000Z'),
        newValues: {
          'cash.manage': true,
          'removed.key': false,
          'expenses.view': true,
        },
        changedBy: { id: CEO_USER, firstName: 'Bosh', lastName: 'Rahbar' },
      },
    ]);
    s.prisma.entityHistory.count.mockResolvedValue(21);

    const page = await s.service.history(COMPANY, 2, 20);

    expect(s.prisma.entityHistory.findMany).toHaveBeenCalledWith({
      where: { entityType: 'RolePermission', companyId: COMPANY },
      orderBy: { createdAt: 'desc' },
      skip: 20,
      take: 20,
      select: {
        id: true,
        entityId: true,
        createdAt: true,
        newValues: true,
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    expect(page).toEqual({
      data: [
        {
          id: 'h1',
          createdAt: '2026-10-12T05:00:00.000Z',
          roleId: 3,
          changedBy: { id: CEO_USER, firstName: 'Bosh', lastName: 'Rahbar' },
          changes: [
            { key: 'expenses.view', granted: true },
            { key: 'cash.manage', granted: true },
            { key: 'removed.key', granted: false },
          ],
        },
      ],
      total: 21,
      page: 2,
      pageSize: 20,
    });
  });
});
