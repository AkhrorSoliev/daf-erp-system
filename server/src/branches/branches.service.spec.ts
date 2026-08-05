import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';

describe('BranchesService — status methods', () => {
  let service: BranchesService;
  let prisma: any;
  let statusHistoryService: any;
  let statusCascadeService: any;

  const mockBranch = {
    id: 1,
    name: 'Chilonzor',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue(mockBranch),
        findUnique: jest.fn().mockResolvedValue(mockBranch),
        update: jest.fn().mockResolvedValue(mockBranch),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      group: { count: jest.fn().mockResolvedValue(0) },
      studentBranch: { count: jest.fn().mockResolvedValue(0) },
      userBranch: { count: jest.fn().mockResolvedValue(0) },
      room: { count: jest.fn().mockResolvedValue(0) },
      course: { count: jest.fn().mockResolvedValue(0) },
      // The caller-scope guard reads the acting user; a CEO spans all branches.
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({
        statusChangedAt: new Date(),
        statusChangedById: 1,
        statusChangeReason: null,
      }),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    statusCascadeService = {
      cascade: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: StatusCascadeService, useValue: statusCascadeService },
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

    service = module.get(BranchesService);
  });

  describe('changeStatus', () => {
    it('updates status and calls cascade', async () => {
      await service.changeStatus(1, { status: 'CLOSED' as any }, 1, 1001);

      expect(prisma.branch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CLOSED', isActive: false }),
        }),
      );

      expect(statusCascadeService.cascade).toHaveBeenCalledWith(
        'Branch',
        '1',
        'CLOSED',
        1,
      );
    });

    it('throws NotFoundException for missing branch', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(
        service.changeStatus(999, { status: 'INACTIVE' as any }, 1, 1001),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('multi-tenant filter (companyId)', () => {
    it('changeStatus scopes lookup to companyId', async () => {
      await service.changeStatus(1, { status: 'INACTIVE' as any }, 1, 1001);
      expect(prisma.branch.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 1,
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });
  });
});

/**
 * Closing a branch cascades: every group goes CANCELLED and every active
 * enrollment DROPPED. Only the company was checked, so a Branch Director could
 * pass another branch's id and stop it with one request.
 */
describe('BranchesService — caller branch confinement', () => {
  let service: BranchesService;
  let prisma: any;

  const branch = { id: 2, name: 'Namangan', companyId: 1001, deletedAt: null };

  const makeService = async (caller: any) => {
    prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue(branch),
        findUnique: jest.fn().mockResolvedValue(branch),
        update: jest.fn().mockResolvedValue(branch),
      },
      user: { findFirst: jest.fn().mockResolvedValue(caller) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StatusHistoryService,
          useValue: { changeStatus: jest.fn().mockResolvedValue({}) },
        },
        { provide: StatusCascadeService, useValue: { cascade: jest.fn() } },
        {
          provide: EntityHistoryService,
          useValue: { recordUpdate: jest.fn(), recordStatusChange: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(BranchesService);
  };

  it("refuses to edit another branch", async () => {
    await makeService({
      mainBranch: 1,
      branches: [{ branchId: 1 }],
      roles: [{ role: { name: 'Branch Director' } }],
    });

    await expect(
      service.update(2, { name: 'Bosib olindi' } as any, 99, 1001),
    ).rejects.toThrow(/o'z filialingizni/);
    expect(prisma.branch.update).not.toHaveBeenCalled();
  });

  it('allows a director to edit their own branch', async () => {
    await makeService({
      mainBranch: 2,
      branches: [{ branchId: 2 }],
      roles: [{ role: { name: 'Branch Director' } }],
    });

    await expect(
      service.update(2, { name: 'Yangi nom' } as any, 99, 1001),
    ).resolves.toBeDefined();
  });

  it('lets a CEO edit any branch', async () => {
    await makeService({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    });

    await expect(
      service.update(2, { name: 'Yangi nom' } as any, 99, 1001),
    ).resolves.toBeDefined();
  });

  it('refuses when the caller cannot be identified (fail closed)', async () => {
    await makeService(null);

    await expect(
      service.update(2, { name: 'X' } as any, 99, 1001),
    ).rejects.toThrow(/topilmadi/);
  });
});


/**
 * Opening branch #2 exposed these three: working hours were accepted by the DTO
 * and silently dropped, no cash accounts were created so the branch could not
 * take money at all, and the new id came from an unscoped `findFirst` outside
 * any transaction.
 */
describe('BranchesService — branch onboarding', () => {
  let service: BranchesService;
  let prisma: any;

  const tx = {
    branch: {
      findFirst: jest.fn().mockResolvedValue({ id: 4 }),
      create: jest.fn((a: any) => Promise.resolve({ id: 5, ...a.data })),
    },
    cashAccount: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx.branch.findFirst.mockResolvedValue({ id: 4 });
    tx.branch.create.mockImplementation((a: any) =>
      Promise.resolve({ id: 5, ...a.data }),
    );

    prisma = {
      $transaction: jest.fn((fn: any) => fn(tx)),
      branch: { findFirst: jest.fn() },
      cashAccount: { findMany: jest.fn().mockResolvedValue([]) },
      room: { count: jest.fn().mockResolvedValue(0) },
      course: { count: jest.fn().mockResolvedValue(0) },
      // `getReadiness` now checks branch ownership first — a CEO spans all.
      user: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: { changeStatus: jest.fn() } },
        { provide: StatusCascadeService, useValue: { cascade: jest.fn() } },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(BranchesService);
  });

  const dto = {
    name: 'Namangan',
    startOfWorkingDay: '08:00',
    endOfWorkingDay: '22:30',
    companyId: 1001,
  } as any;

  it('PERSISTS the working hours instead of dropping them', async () => {
    // Branch #2 shipped with NULL hours because `data` never mentioned these,
    // so every schedule silently fell back to a hardcoded 08:00–20:00.
    await service.create(dto, 1001, 42);

    expect(tx.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startOfWorkingDay: '08:00',
          endOfWorkingDay: '22:30',
        }),
      }),
    );
  });

  it('bootstraps a CASH and a BANK account for the new branch', async () => {
    // `CashAccount.branchId` is NOT NULL and there is no company-wide fallback
    // any more (D4), so without these the branch cannot take a single payment.
    await service.create(dto, 1001, 42);

    const rows = tx.cashAccount.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => r.type).sort()).toEqual(['BANK', 'CASH']);
    expect(rows.every((r: any) => r.branchId === 5)).toBe(true);
  });

  it('creates the branch and its accounts in ONE transaction', async () => {
    // Half a branch — one that exists but cannot take money — is worse than none.
    await service.create(dto, 1001, 42);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does NOT compute the id itself — the sequence does', async () => {
    // `MAX(id) + 1` is unsafe under concurrency, and scoping it per company
    // made it worse: `Branch.id` is a global primary key, so a per-company
    // maximum collides by construction once a second company exists.
    await service.create(dto, 1001, 42);

    expect(tx.branch.findFirst).not.toHaveBeenCalled();
    expect(tx.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ id: expect.anything() }),
      }),
    );
  });

  describe('readiness', () => {
    beforeEach(() => {
      prisma.branch.findFirst.mockResolvedValue({
        id: 2,
        name: 'Namangan',
        startOfWorkingDay: '08:00',
        endOfWorkingDay: '22:30',
      });
    });

    it('reports NOT ready and names each missing piece', async () => {
      const res = await service.getReadiness(2, 1001, 1);

      expect(res.ready).toBe(false);
      const failing = res.checks.filter((c) => !c.ok).map((c) => c.key);
      expect(failing).toEqual(
        expect.arrayContaining([
          'cashAccount',
          'bankAccount',
          'course',
          'room',
          'administrator',
        ]),
      );
    });

    it('names the teachers who have no salary rate', async () => {
      // A lesson taught without an active rate accrues NOTHING, and a rate
      // cannot be back-dated into a closed period — so this must be caught
      // BEFORE the first lesson, not after.
      prisma.user.findMany.mockResolvedValue([
        { id: 10001, firstName: 'Ali', lastName: 'Valiyev', salaryConfigs: [] },
        { id: 10002, firstName: 'Zuhra', lastName: 'Karimova', salaryConfigs: [{ id: 'c1' }] },
      ]);

      const res = await service.getReadiness(2, 1001, 1);
      const check = res.checks.find((c) => c.key === 'teacherRates')!;

      expect(check.ok).toBe(false);
      expect(check.details).toEqual([{ id: 10001, name: 'Ali Valiyev' }]);
    });

    it('reports ready when every check passes', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([
        { type: 'CASH' },
        { type: 'BANK' },
      ]);
      prisma.room.count.mockResolvedValue(1);
      prisma.course.count.mockResolvedValue(1);
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([
        { id: 10001, firstName: 'Ali', lastName: 'Valiyev', salaryConfigs: [{ id: 'c1' }] },
      ]);

      const res = await service.getReadiness(2, 1001, 1);
      expect(res.ready).toBe(true);
    });

    it('404s for a branch outside the company', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(service.getReadiness(99, 1001, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
