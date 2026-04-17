import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';

describe('RoomsService — status methods', () => {
  let service: RoomsService;
  let prisma: any;
  let statusHistoryService: any;

  const mockRoom = {
    id: 'room-1',
    name: 'Room 101',
    status: 'ACTIVE',
    companyId: 1001,
    branchId: 1,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      room: {
        findFirst: jest.fn().mockResolvedValue(mockRoom),
        update: jest
          .fn()
          .mockResolvedValue({ ...mockRoom, branch: { name: 'Branch' } }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      branch: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
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

    service = module.get(RoomsService);
  });

  describe('changeStatus', () => {
    it('updates room status (no cascade)', async () => {
      await service.changeStatus(
        'room-1',
        { status: 'UNDER_MAINTENANCE' as any },
        1,
      );

      expect(prisma.room.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'UNDER_MAINTENANCE' }),
        }),
      );
    });

    it('throws NotFoundException for missing room', async () => {
      prisma.room.findFirst.mockResolvedValue(null);
      await expect(
        service.changeStatus('missing', { status: 'INACTIVE' as any }, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('archives room with ARCHIVED status and deletedAt', async () => {
      await service.delete('room-1', 1);

      expect(prisma.room.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ARCHIVED',
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});
