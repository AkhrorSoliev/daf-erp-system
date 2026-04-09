import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StatusHistoryService } from './status-history.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('StatusHistoryService', () => {
  let service: StatusHistoryService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      statusHistory: {
        create: jest.fn().mockResolvedValue({ id: 'test-id' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusHistoryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(StatusHistoryService);
  });

  describe('changeStatus', () => {
    const validParams = {
      entityType: 'Student',
      entityId: '1',
      fromStatus: 'ACTIVE',
      toStatus: 'FROZEN',
      reason: 'Test sabab',
      changedById: 1,
      companyId: 1001,
    };

    it('creates a StatusHistory record for a valid transition', async () => {
      const result = await service.changeStatus(validParams);

      expect(prisma.statusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'Student',
          entityId: '1',
          fromStatus: 'ACTIVE',
          toStatus: 'FROZEN',
          reason: 'Test sabab',
          changedById: 1,
          companyId: 1001,
        }),
      });

      expect(result).toHaveProperty('statusChangedAt');
      expect(result.statusChangedById).toBe(1);
      expect(result.statusChangeReason).toBe('Test sabab');
    });

    it('throws BadRequestException when from === to', async () => {
      await expect(
        service.changeStatus({ ...validParams, toStatus: 'ACTIVE' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid transition', async () => {
      await expect(
        service.changeStatus({ ...validParams, fromStatus: 'GRADUATED', toStatus: 'INACTIVE' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.statusHistory.create).not.toHaveBeenCalled();
    });

    it('passes reason and companyId to StatusHistory record', async () => {
      await service.changeStatus(validParams);

      const createCall = prisma.statusHistory.create.mock.calls[0][0];
      expect(createCall.data.reason).toBe('Test sabab');
      expect(createCall.data.companyId).toBe(1001);
    });

    it('handles undefined optional fields', async () => {
      await service.changeStatus({
        entityType: 'Student',
        entityId: '1',
        fromStatus: 'ACTIVE',
        toStatus: 'FROZEN',
      });

      const createCall = prisma.statusHistory.create.mock.calls[0][0];
      expect(createCall.data.reason).toBeUndefined();
      expect(createCall.data.changedById).toBeUndefined();
    });
  });

  describe('getHistory', () => {
    it('queries by entityType + entityId, orders by createdAt desc', async () => {
      await service.getHistory('Student', '1');

      expect(prisma.statusHistory.findMany).toHaveBeenCalledWith({
        where: { entityType: 'Student', entityId: '1' },
        orderBy: { createdAt: 'desc' },
        include: {
          changedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });
  });
});
