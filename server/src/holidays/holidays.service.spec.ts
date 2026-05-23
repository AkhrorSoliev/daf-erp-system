import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';

describe('HolidaysService', () => {
  let service: HolidaysService;
  let prisma: any;
  let entityHistoryService: any;
  let statusHistoryService: any;

  const mockHoliday = {
    id: 'h-1',
    name: 'Mustaqillik kuni',
    date: new Date('2026-09-01'),
    status: 'ACTIVE',
    deletedAt: null,
    deletedById: null,
    deletionBatchId: null,
    statusChangedAt: null,
    statusChangedById: null,
    statusChangeReason: null,
  };

  beforeEach(async () => {
    prisma = {
      holiday: {
        findFirst: jest.fn().mockResolvedValue(mockHoliday),
        findMany: jest.fn().mockResolvedValue([mockHoliday]),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockResolvedValue(mockHoliday),
        update: jest.fn().mockResolvedValue(mockHoliday),
      },
    };

    entityHistoryService = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({
        statusChangedAt: new Date(),
        statusChangedById: 1,
      }),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HolidaysService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    service = module.get(HolidaysService);
  });

  describe('findAll', () => {
    it('returns paginated holidays with defaults page=1, pageSize=10', async () => {
      const result = await service.findAll({});
      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          skip: 0,
          take: 10,
          orderBy: { date: 'asc' },
        }),
      );
      expect(result).toEqual({
        data: [mockHoliday],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    });

    it('applies search filter (case-insensitive contains)', async () => {
      await service.findAll({ search: 'navro' });
      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            name: { contains: 'navro', mode: 'insensitive' },
          },
        }),
      );
    });

    it('honours page and pageSize', async () => {
      await service.findAll({ page: 3, pageSize: 20 });
      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the holiday when found', async () => {
      const result = await service.findOne('h-1');
      expect(result).toEqual(mockHoliday);
      expect(prisma.holiday.findFirst).toHaveBeenCalledWith({
        where: { id: 'h-1', deletedAt: null },
      });
    });

    it('throws NotFoundException when missing', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates a holiday and records entity history', async () => {
      await service.create(
        { name: 'Yangi yil', date: '2026-01-01' },
        42,
      );

      expect(prisma.holiday.create).toHaveBeenCalledWith({
        data: { name: 'Yangi yil', date: new Date('2026-01-01') },
      });
      expect(entityHistoryService.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Holiday',
          entityId: mockHoliday.id,
          changedById: 42,
        }),
      );
    });
  });

  describe('update', () => {
    it('updates fields and records entity history', async () => {
      await service.update('h-1', { name: 'Yangi nom' }, 7);

      expect(prisma.holiday.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: { name: 'Yangi nom' },
      });
      expect(entityHistoryService.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Holiday',
          entityId: 'h-1',
          changedById: 7,
        }),
      );
    });

    it('converts date string to Date instance', async () => {
      await service.update('h-1', { date: '2026-09-01' }, 7);
      expect(prisma.holiday.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: { date: new Date('2026-09-01') },
      });
    });

    it('throws NotFoundException when holiday is missing', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'x' }, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove (soft delete)', () => {
    it('sets deletedAt and deletedById, records entity history', async () => {
      const result = await service.remove('h-1', 5);

      expect(prisma.holiday.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedById: 5,
        }),
      });
      expect(entityHistoryService.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Holiday',
          entityId: 'h-1',
          changedById: 5,
        }),
      );
      expect(result).toEqual({ message: "Bayram muvaffaqiyatli o'chirildi" });
    });

    it('throws NotFoundException when holiday is missing', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(service.remove('missing', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
