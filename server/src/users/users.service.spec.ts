import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('UsersService — updateUser status/isActive sync', () => {
  let service: UsersService;
  let prisma: any;

  const mockUser = {
    id: 1,
    firstName: 'Test',
    lastName: 'Admin',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    mainBranch: null,
    roles: [{ role: { id: 3, name: 'Administrator' } }],
    branches: [{ branch: { id: 500, name: 'Main' } }],
    company: { id: 1001, name: 'Test' },
    groupTeachers: [],
  };

  const updateMock = jest.fn();

  beforeEach(async () => {
    updateMock.mockReset();
    updateMock.mockImplementation(({ data }) =>
      Promise.resolve({ ...mockUser, ...data }),
    );

    prisma = {
      user: {
        // Both the target lookup and the caller-scope lookup go through
        // findFirst; a CEO caller spans every branch, so the scope guard passes
        // and these tests stay about status/isActive sync.
        findFirst: jest.fn().mockImplementation(({ select }: any) =>
          Promise.resolve(
            select?.roles && !select?.status
              ? { mainBranch: null, branches: [], roles: [{ role: { name: 'CEO' } }] }
              : mockUser,
          ),
        ),
        findUnique: jest.fn().mockResolvedValue({
          roles: [{ role: { name: 'CEO' } }],
        }),
        update: updateMock,
      },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      userBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      role: { findMany: jest.fn().mockResolvedValue([{ id: 3 }]) },
      branch: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('sets isActive=false when status is changed to INACTIVE', async () => {
    await service.updateUser(1, { status: 'INACTIVE' } as any, 2);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'INACTIVE',
          isActive: false,
        }),
      }),
    );
  });

  it('sets isActive=false when status is changed to TERMINATED', async () => {
    await service.updateUser(1, { status: 'TERMINATED' } as any, 2);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'TERMINATED',
          isActive: false,
        }),
      }),
    );
  });

  it('sets isActive=true when status is changed to ACTIVE', async () => {
    // Keep the select-based split: the target starts INACTIVE, the caller is
    // still a CEO so the branch-scope guard stays out of the way.
    prisma.user.findFirst.mockImplementation(({ select }: any) =>
      Promise.resolve(
        select?.roles && !select?.status
          ? { mainBranch: null, branches: [], roles: [{ role: { name: 'CEO' } }] }
          : { ...mockUser, status: 'INACTIVE', isActive: false },
      ),
    );

    await service.updateUser(1, { status: 'ACTIVE' } as any, 2);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACTIVE',
          isActive: true,
        }),
      }),
    );
  });

  it('does not touch isActive when status is not in the dto', async () => {
    await service.updateUser(1, { firstName: 'Renamed' } as any, 2);

    const dataArg = updateMock.mock.calls[0][0].data;
    expect(dataArg).not.toHaveProperty('isActive');
    expect(dataArg).not.toHaveProperty('status');
    expect(dataArg).toEqual({ firstName: 'Renamed' });
  });
});

describe('UsersService — role escalation and branch validation', () => {
  let service: UsersService;
  let prisma: any;

  const ceoCaller = {
    roles: [{ role: { name: 'CEO' } }],
  };
  const bdCaller = {
    roles: [{ role: { name: 'Branch Director' } }],
  };

  const createdUser = (overrides: any = {}) => ({
    id: 10001,
    firstName: 'A',
    lastName: 'B',
    companyId: 1001,
    mainBranch: null,
    isActive: true,
    status: 'ACTIVE',
    roles: [],
    branches: [],
    company: { id: 1001, name: 'Test' },
    groupTeachers: [],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(createdUser()),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      role: { findMany: jest.fn() },
      branch: { count: jest.fn() },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      userBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('rejects non-CEO caller from granting CEO role', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.user.findUnique.mockResolvedValue(bdCaller);

    await expect(
      service.create(
        {
          firstName: 'A',
          lastName: 'B',
          companyId: 1001,
          password: 'pass1',
          roleIds: [1],
        },
        99,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows CEO caller to grant CEO role', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.user.findUnique.mockResolvedValue(ceoCaller);

    await expect(
      service.create(
        {
          firstName: 'A',
          lastName: 'B',
          companyId: 1001,
          password: 'pass1',
          roleIds: [1],
        },
        99,
      ),
    ).resolves.toBeDefined();
  });

  it('rejects non-CEO employee with empty branchIds', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 3 }]);

    await expect(
      service.create(
        {
          firstName: 'A',
          lastName: 'B',
          companyId: 1001,
          password: 'pass1',
          roleIds: [3],
          branchIds: [],
        },
        99,
      ),
    ).rejects.toThrow(/CEO bo'lmagan xodim uchun.*filial/);
  });

  it('rejects Teacher role with empty branchIds (specific message)', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 4 }]);

    await expect(
      service.create(
        {
          firstName: 'A',
          lastName: 'B',
          companyId: 1001,
          password: 'pass1',
          roleIds: [4],
        },
        99,
      ),
    ).rejects.toThrow(/O'qituvchi uchun.*filial/);
  });

  it('rejects branchIds that do not belong to the company', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.branch.count.mockResolvedValue(0); // none match company

    await expect(
      service.create(
        {
          firstName: 'A',
          lastName: 'B',
          companyId: 1001,
          password: 'pass1',
          roleIds: [3],
          branchIds: [9999],
        },
        99,
      ),
    ).rejects.toThrow(/bu kompaniyaga tegishli emas/);
  });

  it('rejects mainBranch not present in branchIds', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.branch.count.mockResolvedValue(1);

    await expect(
      service.create(
        {
          firstName: 'A',
          lastName: 'B',
          companyId: 1001,
          password: 'pass1',
          roleIds: [3],
          branchIds: [500],
          mainBranch: 999,
        },
        99,
      ),
    ).rejects.toThrow(/Asosiy filial.*orasida/);
  });

  it('allows CEO-only user with empty branchIds', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.user.findUnique.mockResolvedValue(ceoCaller);

    await expect(
      service.create(
        {
          firstName: 'A',
          lastName: 'B',
          companyId: 1001,
          password: 'pass1',
          roleIds: [1],
          branchIds: [],
        },
        99,
      ),
    ).resolves.toBeDefined();
  });

  it('skips role escalation check when callerUserId is undefined (e.g. Telegram bot)', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 1 }]);

    await expect(
      service.create({
        firstName: 'A',
        lastName: 'B',
        companyId: 1001,
        password: 'pass1',
        roleIds: [1],
      }),
    ).resolves.toBeDefined();

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('UsersService — cross-company guards', () => {
  let service: UsersService;
  let prisma: any;

  const target = {
    id: 7,
    firstName: 'Target',
    lastName: 'User',
    companyId: 1001,
    mainBranch: null,
    isActive: true,
    status: 'ACTIVE',
    roles: [{ role: { id: 3, name: 'Administrator' } }],
    branches: [{ branch: { id: 500 } }],
    company: { id: 1001, name: 'X' },
    groupTeachers: [],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        // These tests are about the COMPANY guard; make the caller a CEO so the
        // separate branch-scope guard passes and does not mask what is asserted.
        findFirst: jest.fn().mockImplementation(({ select }: any) =>
          Promise.resolve(
            select?.roles && !select?.status
              ? { mainBranch: null, branches: [], roles: [{ role: { name: 'CEO' } }] }
              : target,
          ),
        ),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(target),
      },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      userBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      role: { findMany: jest.fn() },
      branch: { count: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('updateUser rejects cross-company callers', async () => {
    await expect(
      service.updateUser(7, { firstName: 'X' } as any, 99, 2002),
    ).rejects.toThrow(ForbiddenException);
  });

  it('updateUser allows same-company callers', async () => {
    await expect(
      service.updateUser(7, { firstName: 'X' } as any, 99, 1001),
    ).resolves.toBeDefined();
  });

  it('updateUser skips company check when callerCompanyId is undefined', async () => {
    await expect(
      service.updateUser(7, { firstName: 'X' } as any, 99),
    ).resolves.toBeDefined();
  });

  it('softDelete rejects cross-company callers', async () => {
    await expect(service.softDelete(7, 99, 2002)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('softDelete allows same-company callers', async () => {
    await expect(service.softDelete(7, 99, 1001)).resolves.toBeDefined();
  });

  it('softDelete skips company check when callerCompanyId is undefined', async () => {
    await expect(service.softDelete(7, 99)).resolves.toBeDefined();
  });
});

describe('UsersService — findAll companyId scoping', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('always filters by the supplied companyId', async () => {
    await service.findAll({} as any, 1001, null);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          companyId: 1001,
        }),
      }),
    );
  });

  it('uses companyId even when query has unrelated filters', async () => {
    await service.findAll({ search: 'foo', branch_id: 5 } as any, 2002, null);
    const callArg = prisma.user.findMany.mock.calls[0][0];
    expect(callArg.where.companyId).toBe(2002);
  });

  it('does NOT filter by status/isActive by default (employees list shows everyone)', async () => {
    await service.findAll({} as any, 1001, null);
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBeUndefined();
    expect(where.status).toBeUndefined();
  });

  it('restricts to ACTIVE users when active_only is set (assignee dropdowns)', async () => {
    await service.findAll({ active_only: true } as any, 1001, null);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          companyId: 1001,
          isActive: true,
          status: UserStatus.ACTIVE,
        }),
      }),
    );
  });
});

/**
 * `updateUser` accepts `password`, so an unscoped caller could take over another
 * branch's accounts. Only the company was checked before this guard.
 */
describe('UsersService — updateUser branch confinement', () => {
  let service: UsersService;
  let prisma: any;

  const target = {
    id: 7,
    firstName: 'Boshqa',
    lastName: 'Filial',
    companyId: 1001,
    mainBranch: 2,
    isActive: true,
    status: 'ACTIVE',
    roles: [{ role: { id: 3, name: 'Administrator' } }],
    branches: [{ branch: { id: 2 } }],
    company: { id: 1001, name: 'X' },
    groupTeachers: [],
  };

  const makeService = async (caller: any) => {
    prisma = {
      user: {
        findFirst: jest.fn().mockImplementation(({ select }: any) =>
          Promise.resolve(select?.roles && !select?.status ? caller : target),
        ),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(target),
      },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      userBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      role: { findMany: jest.fn() },
      branch: { count: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(UsersService);
  };

  it("refuses to edit another branch's employee", async () => {
    await makeService({
      mainBranch: 1,
      branches: [{ branchId: 1 }],
      roles: [{ role: { name: 'Branch Director' } }],
    });

    await expect(
      service.updateUser(7, { password: 'hijack' } as any, 99, 1001),
    ).rejects.toThrow(/o'z filialingiz xodimlarini/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows editing an employee of the same branch', async () => {
    await makeService({
      mainBranch: 2,
      branches: [{ branchId: 2 }],
      roles: [{ role: { name: 'Branch Director' } }],
    });

    await expect(
      service.updateUser(7, { firstName: 'Yangi' } as any, 99, 1001),
    ).resolves.toBeDefined();
  });

  it('lets a CEO edit anyone', async () => {
    await makeService({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    });

    await expect(
      service.updateUser(7, { firstName: 'Yangi' } as any, 99, 1001),
    ).resolves.toBeDefined();
  });

  it('refuses a branch-less caller (fail closed)', async () => {
    await makeService({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'Administrator' } }],
    });

    await expect(
      service.updateUser(7, { firstName: 'Yangi' } as any, 99, 1001),
    ).rejects.toThrow(/o'z filialingiz xodimlarini/);
  });
});

