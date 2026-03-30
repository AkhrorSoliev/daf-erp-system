import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';

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
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({
        statusChangedAt: new Date(), statusChangedById: 1, statusChangeReason: null,
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
      ],
    }).compile();

    service = module.get(BranchesService);
  });

  describe('changeStatus', () => {
    it('updates status and calls cascade', async () => {
      await service.changeStatus(1, { status: 'CLOSED' as any }, 1);

      expect(prisma.branch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CLOSED', isActive: false }),
        }),
      );

      expect(statusCascadeService.cascade).toHaveBeenCalledWith(
        'Branch', '1', 'CLOSED', 1,
      );
    });

    it('throws NotFoundException for missing branch', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      await expect(
        service.changeStatus(999, { status: 'INACTIVE' as any }, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
