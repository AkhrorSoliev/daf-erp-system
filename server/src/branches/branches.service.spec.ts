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

