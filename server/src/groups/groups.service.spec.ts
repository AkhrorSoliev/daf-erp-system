import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';

describe('GroupsService — status methods', () => {
  let service: GroupsService;
  let prisma: any;
  let statusHistoryService: any;
  let statusCascadeService: any;

  const mockGroup = {
    id: 'group-1',
    name: 'Test-001',
    status: 2,
    statusEnum: 'FORMING',
    isActive: true,
    companyId: 1001,
    deletedAt: null,
    branchId: 1,
    courseId: 'course-1',
  };

  const auditData = {
    statusChangedAt: new Date(),
    statusChangedById: 1,
    statusChangeReason: null,
  };

  beforeEach(async () => {
    prisma = {
      group: {
        findFirst: jest.fn().mockResolvedValue(mockGroup),
        update: jest.fn().mockResolvedValue({
          ...mockGroup,
          course: { id: 'c1', name: 'Test' },
          room: null,
          branch: { id: 1, name: 'Branch' },
          teachers: [],
          _count: { enrollments: 0 },
        }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _max: { groupNumber: 0 } }),
        create: jest.fn(),
      },
      branch: { findFirst: jest.fn() },
      course: { findFirst: jest.fn() },
      room: { findFirst: jest.fn() },
      user: { count: jest.fn() },
      groupTeacher: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue(auditData),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    statusCascadeService = {
      cascade: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: StatusCascadeService, useValue: statusCascadeService },
      ],
    }).compile();

    service = module.get(GroupsService);
  });

  describe('changeStatus', () => {
    it('updates statusEnum and sets isActive correctly for ACTIVE', async () => {
      await service.changeStatus('group-1', { status: 'ACTIVE' as any }, 1);

      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusEnum: 'ACTIVE',
            isActive: true,
          }),
        }),
      );
    });

    it('sets isActive=false for PAUSED', async () => {
      prisma.group.findFirst.mockResolvedValue({ ...mockGroup, statusEnum: 'ACTIVE' });

      await service.changeStatus('group-1', { status: 'PAUSED' as any }, 1);

      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('calls cascade after update', async () => {
      await service.changeStatus('group-1', { status: 'ACTIVE' as any }, 1);

      expect(statusCascadeService.cascade).toHaveBeenCalledWith(
        'Group', 'group-1', 'ACTIVE', 1,
      );
    });

    it('throws NotFoundException for missing group', async () => {
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus('missing', { status: 'ACTIVE' as any }, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('archives group with ARCHIVED status and deletedAt', async () => {
      await service.delete('group-1', 1);

      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusEnum: 'ARCHIVED',
            isActive: false,
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});
