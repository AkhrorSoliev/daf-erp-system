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
          position: 'Administrator',
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
          position: 'Administrator',
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
          position: 'Administrator',
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
          position: 'Administrator',
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
          position: 'Administrator',
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
          position: 'Administrator',
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
        position: 'Administrator',
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

describe('UsersService — rolsiz xodim (lavozim bilan)', () => {
  let service: UsersService;
  let prisma: any;

  const CEO_CALLER = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };

  const createdUser = {
    id: 10500,
    firstName: 'Zulfiya',
    lastName: 'Karimova',
    position: 'Farrosh',
    companyId: 1001,
    roles: [],
    branches: [{ branch: { id: 7, name: "Farg'ona filiali" } }],
    groupTeachers: [],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(CEO_CALLER),
        findUnique: jest.fn().mockResolvedValue(CEO_CALLER),
        create: jest.fn().mockResolvedValue(createdUser),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      branch: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: {} },
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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  const base = {
    firstName: 'Zulfiya',
    lastName: 'Karimova',
    companyId: 1001,
    branchIds: [7],
  };

  it('rolsiz, lavozimli va filialli xodimni yaratadi', async () => {
    await service.create(
      { ...base, position: 'Farrosh', roleIds: [] },
      1, // CEO caller
    );

    expect(prisma.user.create).toHaveBeenCalled();
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.position).toBe('Farrosh');
    expect(data.password).toBeNull();
    // Rolsiz xodimda `roles` umuman yozilmaydi.
    expect(data.roles).toBeUndefined();
  });

  it('lavozimsiz xodimni rad etadi', async () => {
    await expect(
      service.create({ ...base, position: '   ', roleIds: [] }, 1),
    ).rejects.toThrow("Lavozim ko'rsatilishi shart");
  });

  it('rolsiz va filialsiz xodimni rad etadi', async () => {
    await expect(
      service.create(
        { ...base, branchIds: [], position: 'Qorovul', roleIds: [] },
        1,
      ),
    ).rejects.toThrow('Rolsiz xodim uchun kamida bitta filial tanlanishi shart');
  });

  it('rolsiz xodimga parol berishni rad etadi', async () => {
    await expect(
      service.create(
        { ...base, position: 'Farrosh', roleIds: [], password: 'parol123' },
        1,
      ),
    ).rejects.toThrow(
      'Tizim roli berilmagan xodimga login yoki parol berib bo\'lmaydi',
    );
  });

  it('rolsiz xodimga login berishni ham rad etadi', async () => {
    await expect(
      service.create(
        { ...base, position: 'Farrosh', roleIds: [], login: 'farrosh' },
        1,
      ),
    ).rejects.toThrow(
      'Tizim roli berilmagan xodimga login yoki parol berib bo\'lmaydi',
    );
  });

  // The mirror of the two refusals above. `CreateUserDto.password` became
  // `@IsOptional()` so a role-less employee could be created without one —
  // which left NOTHING on the server requiring a password for an employee who
  // DOES hold a role. The only thing asking was a zod schema in the browser.
  it('rol berilgan xodimni parolsiz yaratishni rad etadi', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 3 }]);

    await expect(
      service.create(
        { ...base, position: 'Administrator', roleIds: [3] },
        1, // CEO caller
      ),
    ).rejects.toThrow('Tizim roli berilgan xodim uchun parol majburiy');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rol + parol bilan yaratish ishlayveradi', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 3 }]);

    await expect(
      service.create(
        {
          ...base,
          position: 'Administrator',
          roleIds: [3],
          password: 'parol123',
        },
        1,
      ),
    ).resolves.toBeDefined();
  });

  it('lavozimni saqlashdan oldin trim qiladi', async () => {
    await service.create(
      { ...base, position: '  Qorovul  ', roleIds: [] },
      1,
    );
    expect(prisma.user.create.mock.calls[0][0].data.position).toBe('Qorovul');
  });

  // The old `if (!roleIds?.length) return;` early exit skipped everything
  // below it — including the branch-confinement and company-ownership checks
  // — for a role-less employee. These two tests exercise exactly that tail,
  // mirroring `users-branch.spec.ts:99` ("refuses creating staff in a branch
  // the caller does not hold") for the role-less case, so a regression that
  // reintroduces an early return under a different name is caught here too.
  it("Farg'ona direktori Namanganda rolsiz xodim yarata olmaydi (filial ruxsati)", async () => {
    const FARGONA = 1;
    const NAMANGAN = 2;
    const FARGONA_DIRECTOR = 7;

    prisma.user.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.id === FARGONA_DIRECTOR
          ? {
              id: FARGONA_DIRECTOR,
              mainBranch: FARGONA,
              branches: [{ branchId: FARGONA }],
              roles: [{ role: { name: 'Branch Director' } }],
            }
          : CEO_CALLER,
      ),
    );

    await expect(
      service.create(
        {
          firstName: 'X',
          lastName: 'Y',
          companyId: 1001,
          position: 'Farrosh',
          roleIds: [],
          branchIds: [NAMANGAN],
        },
        FARGONA_DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("boshqa kompaniyaga tegishli filial bilan rolsiz xodim yaratishni rad etadi", async () => {
    prisma.branch.count.mockResolvedValue(0); // no branch matches this company

    await expect(
      service.create(
        { ...base, position: 'Farrosh', roleIds: [], branchIds: [9999] },
        1, // CEO caller
      ),
    ).rejects.toThrow(/bu kompaniyaga tegishli emas/);
  });
});

describe('UsersService — updateUser: rolsiz ⇒ login/parol yo\'q invariantini saqlaydi', () => {
  let service: UsersService;
  let prisma: any;
  let target: any;
  const updateMock = jest.fn();

  // A CEO caller so `assertCallerInBranch` never masks what each test
  // actually asserts (same trick as the status/isActive sync suite above).
  const CEO_CALLER = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };

  beforeEach(async () => {
    updateMock.mockReset();
    updateMock.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...target, ...data }),
    );

    prisma = {
      user: {
        // The target lookup uses `userSelect` (carries `status`); the
        // caller-scope lookup inside `assertCallerInBranch` asks only for
        // `mainBranch`/`branches`/`roles`. Split on that the same way the
        // status/isActive suite does.
        findFirst: jest.fn().mockImplementation(({ select }: any) =>
          Promise.resolve(
            select?.roles && !select?.status ? CEO_CALLER : target,
          ),
        ),
        findUnique: jest.fn().mockResolvedValue(CEO_CALLER),
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

  it('a) rolsiz akkauntga YOLG\'IZ parol berishni rad etadi (roleIds tegilmagan bo\'lsa ham)', async () => {
    // The account already has zero roles; the dto touches ONLY `password`.
    // Before the fix this never entered re-validation at all.
    target = {
      id: 20,
      companyId: 1001,
      mainBranch: null,
      status: 'ACTIVE',
      isActive: true,
      roles: [],
      branches: [{ branch: { id: 500, name: 'Main' } }],
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
    };

    await expect(
      service.updateUser(20, { password: 'yangiParol1' } as any, 99, 1001),
    ).rejects.toThrow(
      "Tizim roli berilmagan xodimga login yoki parol berib bo'lmaydi",
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('a) yolg\'iz login berishni ham xuddi shunday rad etadi', async () => {
    target = {
      id: 21,
      companyId: 1001,
      mainBranch: null,
      status: 'ACTIVE',
      isActive: true,
      roles: [],
      branches: [{ branch: { id: 500, name: 'Main' } }],
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
    };

    await expect(
      service.updateUser(21, { login: '901234567' } as any, 99, 1001),
    ).rejects.toThrow(
      "Tizim roli berilmagan xodimga login yoki parol berib bo'lmaydi",
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('b) rolni bir vaqtning o\'zida bo\'shatib parol berishni ham rad etadi', async () => {
    // roleIds: [] AND an explicit password in the SAME request — refused,
    // never silently accepted nor silently nulled.
    target = {
      id: 22,
      companyId: 1001,
      mainBranch: null,
      status: 'ACTIVE',
      isActive: true,
      roles: [{ role: { id: 3, name: 'Administrator' } }],
      branches: [{ branch: { id: 500, name: 'Main' } }],
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
    };

    await expect(
      service.updateUser(
        22,
        { roleIds: [], password: 'yangiParol1' } as any,
        99,
        1001,
      ),
    ).rejects.toThrow(
      "Tizim roli berilmagan xodimga login yoki parol berib bo'lmaydi",
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('c) administratorni rolsiz farroshga tushirganda saqlangan login/parol NULL qilinadi', async () => {
    // The demotion itself must succeed — refusing it would make "take away
    // every role" impossible through the UI — but the now-meaningless
    // credentials must not survive it.
    target = {
      id: 23,
      companyId: 1001,
      mainBranch: null,
      status: 'ACTIVE',
      isActive: true,
      roles: [{ role: { id: 3, name: 'Administrator' } }],
      branches: [{ branch: { id: 500, name: 'Main' } }],
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
    };

    await service.updateUser(
      23,
      { roleIds: [], position: 'Farrosh' } as any,
      99,
      1001,
    );

    expect(updateMock).toHaveBeenCalled();
    const data = updateMock.mock.calls[0][0].data;
    expect(data.password).toBeNull();
    expect(data.login).toBeNull();
  });

  // The re-promotion hole: demoting an administrator nulls their credentials
  // (test c), and the edit-mode form asks for nothing ("O'zgartirmaslik uchun
  // bo'sh qoldiring" — a placeholder that asserts a stored password which no
  // longer exists). Giving the role back therefore produced an account holding
  // real access that nobody could ever sign into.
  it('d) rolsiz akkauntga parolsiz rol qaytarishni rad etadi', async () => {
    target = {
      id: 25,
      companyId: 1001,
      mainBranch: null,
      status: 'ACTIVE',
      isActive: true,
      password: null, // demotion nulled it
      login: null,
      roles: [],
      branches: [{ branch: { id: 500, name: 'Main' } }],
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
    };

    await expect(
      service.updateUser(25, { roleIds: [3] } as any, 99, 1001),
    ).rejects.toThrow('Tizim roli berilgan xodim uchun parol majburiy');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('d) rolni parol bilan birga qaytarish ishlaydi', async () => {
    target = {
      id: 26,
      companyId: 1001,
      mainBranch: null,
      status: 'ACTIVE',
      isActive: true,
      password: null,
      login: null,
      roles: [],
      branches: [{ branch: { id: 500, name: 'Main' } }],
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
    };

    await service.updateUser(
      26,
      { roleIds: [3], password: 'yangiParol1' } as any,
      99,
      1001,
    );

    expect(updateMock).toHaveBeenCalled();
    expect(typeof updateMock.mock.calls[0][0].data.password).toBe('string');
  });

  // The regression this rule must NOT cause: an ordinary edit sends no
  // password, and an administrator who already has one must stay editable.
  it("d) parolli rol egasini oddiy tahrirlash (parolsiz) ishlayveradi", async () => {
    target = {
      id: 27,
      companyId: 1001,
      mainBranch: null,
      status: 'ACTIVE',
      isActive: true,
      password: '$2b$10$saqlangan.hash',
      login: '901234567',
      roles: [{ role: { id: 3, name: 'Administrator' } }],
      branches: [{ branch: { id: 500, name: 'Main' } }],
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
    };

    await service.updateUser(
      27,
      { position: 'Bosh administrator' } as any,
      99,
      1001,
    );

    expect(updateMock).toHaveBeenCalled();
    const data = updateMock.mock.calls[0][0].data;
    expect(data.position).toBe('Bosh administrator');
    expect(data.password).toBeUndefined(); // stored hash untouched
  });

  it('rol saqlanib qolsa, login/parol NULL qilinmaydi (oddiy parol yangilash ishlayveradi)', async () => {
    target = {
      id: 24,
      companyId: 1001,
      mainBranch: null,
      status: 'ACTIVE',
      isActive: true,
      roles: [{ role: { id: 3, name: 'Administrator' } }],
      branches: [{ branch: { id: 500, name: 'Main' } }],
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
    };

    await service.updateUser(
      24,
      { password: 'yangiParol1' } as any,
      99,
      1001,
    );

    expect(updateMock).toHaveBeenCalled();
    const data = updateMock.mock.calls[0][0].data;
    expect(data.password).not.toBeNull();
    expect(typeof data.password).toBe('string');
  });
});

