import { Test, TestingModule } from '@nestjs/testing';
import { GroupStatus } from '@prisma/client';
import { GroupStatusCronService } from './group-status-cron.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';

describe('GroupStatusCronService', () => {
  let service: GroupStatusCronService;
  let prisma: any;
  let statusHistoryService: any;
  let statusCascadeService: any;
  let entityHistoryService: any;

  beforeEach(async () => {
    prisma = {
      group: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({
        statusChangedAt: new Date(),
        statusChangedById: undefined,
        statusChangeReason: null,
      }),
    };

    statusCascadeService = {
      cascade: jest.fn().mockResolvedValue([]),
    };

    entityHistoryService = {
      recordStatusChange: jest.fn().mockResolvedValue(undefined),
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordRestore: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupStatusCronService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: StatusCascadeService, useValue: statusCascadeService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    service = module.get<GroupStatusCronService>(GroupStatusCronService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('autoUpdateGroupStatuses', () => {
    it('should activate FORMING groups whose startDate has arrived', async () => {
      const mockGroup = {
        id: 'group-1',
        statusEnum: GroupStatus.FORMING,
        companyId: 1,
      };

      prisma.group.findMany
        .mockResolvedValueOnce([mockGroup]) // activateGroups query
        .mockResolvedValueOnce([]); // completeGroups query

      await service.autoUpdateGroupStatuses();

      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          entityId: 'group-1',
          fromStatus: GroupStatus.FORMING,
          toStatus: GroupStatus.ACTIVE,
        }),
      );

      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'group-1' },
          data: expect.objectContaining({
            statusEnum: GroupStatus.ACTIVE,
            status: 1,
            isActive: true,
          }),
        }),
      );

      expect(entityHistoryService.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          entityId: 'group-1',
          oldValues: { status: GroupStatus.FORMING },
          newValues: expect.objectContaining({ status: GroupStatus.ACTIVE }),
        }),
      );
    });

    it('should complete ACTIVE groups whose endDate has passed', async () => {
      const mockGroup = {
        id: 'group-2',
        statusEnum: GroupStatus.ACTIVE,
        companyId: 1,
      };

      prisma.group.findMany
        .mockResolvedValueOnce([]) // activateGroups query
        .mockResolvedValueOnce([mockGroup]); // completeGroups query

      await service.autoUpdateGroupStatuses();

      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Group',
          entityId: 'group-2',
          fromStatus: GroupStatus.ACTIVE,
          toStatus: GroupStatus.COMPLETED,
        }),
      );

      expect(statusCascadeService.cascade).toHaveBeenCalledWith(
        'Group',
        'group-2',
        GroupStatus.COMPLETED,
        0,
      );
    });

    it('should do nothing when no groups need status change', async () => {
      prisma.group.findMany.mockResolvedValue([]);

      await service.autoUpdateGroupStatuses();

      expect(statusHistoryService.changeStatus).not.toHaveBeenCalled();
      expect(prisma.group.update).not.toHaveBeenCalled();
    });

    it('should continue processing other groups if one fails', async () => {
      const groups = [
        { id: 'group-fail', statusEnum: GroupStatus.FORMING, companyId: 1 },
        { id: 'group-ok', statusEnum: GroupStatus.FORMING, companyId: 1 },
      ];

      prisma.group.findMany
        .mockResolvedValueOnce(groups)
        .mockResolvedValueOnce([]);

      statusHistoryService.changeStatus
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({
          statusChangedAt: new Date(),
          statusChangedById: undefined,
          statusChangeReason: null,
        });

      await service.autoUpdateGroupStatuses();

      // Second group should still be processed
      expect(prisma.group.update).toHaveBeenCalledTimes(1);
      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'group-ok' } }),
      );
    });
  });
});
