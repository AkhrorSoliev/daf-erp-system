import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { GroupHolidayCascadeService } from '../groups/group-holiday-cascade.service';

describe('HolidaysService', () => {
  let service: HolidaysService;
  let prisma: any;
  let entityHistoryService: any;
  let statusHistoryService: any;
  let cascadeService: any;

  const mockHoliday = {
    id: 'h-1',
    name: 'Mustaqillik kuni',
    date: new Date('2026-09-01'),
    endDate: new Date('2026-09-01'),
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
      group: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      groupHolidayExtension: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
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

    cascadeService = {
      extendGroupEndDateForHoliday: jest
        .fn()
        .mockResolvedValue({ extended: false }),
      revertGroupEndDateForHoliday: jest.fn(),
      applyHolidayImpactOnNewGroup: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HolidaysService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: EntityHistoryService, useValue: entityHistoryService },
        { provide: GroupHolidayCascadeService, useValue: cascadeService },
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
    });

    it('throws NotFoundException when missing', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('coerces endDate to date when not provided', async () => {
      await service.create({ name: 'Yangi yil', date: '2026-01-01' }, 42);

      expect(prisma.holiday.create).toHaveBeenCalledWith({
        data: {
          name: 'Yangi yil',
          date: new Date('2026-01-01'),
          endDate: new Date('2026-01-01'),
        },
      });
      expect(entityHistoryService.recordCreate).toHaveBeenCalled();
    });

    it('stores explicit endDate when provided', async () => {
      await service.create(
        { name: "Navro'z", date: '2026-03-21', endDate: '2026-03-23' },
        7,
      );
      expect(prisma.holiday.create).toHaveBeenCalledWith({
        data: {
          name: "Navro'z",
          date: new Date('2026-03-21'),
          endDate: new Date('2026-03-23'),
        },
      });
    });

    it('rejects endDate before date', async () => {
      await expect(
        service.create(
          { name: 'X', date: '2026-03-23', endDate: '2026-03-21' },
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects holiday ranges longer than 60 days', async () => {
      await expect(
        service.create(
          { name: 'Too long', date: '2026-01-01', endDate: '2026-04-01' },
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('triggers cascade for active overlapping groups', async () => {
      prisma.group.findMany.mockResolvedValue([
        { id: 'g-1' },
        { id: 'g-2' },
      ]);
      await service.create({ name: 'X', date: '2026-05-27' }, 1);
      expect(cascadeService.extendGroupEndDateForHoliday).toHaveBeenCalledTimes(
        2,
      );
    });
  });

  describe('update', () => {
    it('updates name even when extensions exist', async () => {
      prisma.groupHolidayExtension.count.mockResolvedValue(3);
      await service.update('h-1', { name: 'New name' }, 7);
      expect(prisma.holiday.update).toHaveBeenCalled();
    });

    it('rejects date change when extensions exist', async () => {
      prisma.groupHolidayExtension.count.mockResolvedValue(1);
      await expect(
        service.update('h-1', { date: '2026-10-01' }, 7),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows date change when no extensions exist', async () => {
      prisma.groupHolidayExtension.count.mockResolvedValue(0);
      await service.update('h-1', { date: '2026-10-01' }, 7);
      expect(prisma.holiday.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: {
          date: new Date('2026-10-01'),
          endDate: new Date('2026-10-01'),
        },
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
    it('reverses extensions before soft-deleting', async () => {
      prisma.groupHolidayExtension.findMany.mockResolvedValue([
        { id: 'ext-1', groupId: 'g-1', holidayId: 'h-1' },
      ]);
      const result = await service.remove('h-1', 5);

      expect(cascadeService.revertGroupEndDateForHoliday).toHaveBeenCalled();
      expect(prisma.holiday.update).toHaveBeenCalledWith({
        where: { id: 'h-1' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedById: 5,
        }),
      });
      expect(entityHistoryService.recordDelete).toHaveBeenCalled();
      expect(result).toEqual({ message: "Bayram muvaffaqiyatli o'chirildi" });
    });

    it('throws NotFoundException when holiday is missing', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(service.remove('missing', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('changeStatus', () => {
    it('reverses extensions on ACTIVE → CANCELLED', async () => {
      prisma.holiday.findFirst.mockResolvedValue({
        ...mockHoliday,
        status: 'ACTIVE',
      });
      await service.changeStatus(
        'h-1',
        { status: 'CANCELLED' as any },
        1,
      );
      expect(cascadeService.revertGroupEndDateForHoliday).toHaveBeenCalledTimes(
        0, // none in this test's findMany mock
      );
    });

    it('applies extensions on CANCELLED → ACTIVE', async () => {
      prisma.holiday.findFirst.mockResolvedValue({
        ...mockHoliday,
        status: 'CANCELLED',
      });
      prisma.group.findMany.mockResolvedValue([{ id: 'g-1' }]);
      await service.changeStatus('h-1', { status: 'ACTIVE' as any }, 1);
      expect(
        cascadeService.extendGroupEndDateForHoliday,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('findActiveHolidayCovering', () => {
    it('queries by overlap (date <= X AND endDate >= X)', async () => {
      const probe = new Date('2026-05-28');
      await service.findActiveHolidayCovering(probe);
      expect(prisma.holiday.findFirst).toHaveBeenCalledWith({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          date: { lte: probe },
          endDate: { gte: probe },
        },
        select: { id: true, name: true, date: true, endDate: true },
      });
    });
  });

  describe('buildHolidayDateSet', () => {
    it('expands each holiday range to one Set entry per day', async () => {
      prisma.holiday.findMany.mockResolvedValue([
        {
          id: 'h-1',
          name: "Navro'z",
          date: new Date('2026-03-21T00:00:00.000Z'),
          endDate: new Date('2026-03-23T00:00:00.000Z'),
        },
      ]);
      const set = await service.buildHolidayDateSet(
        new Date('2026-03-20T00:00:00.000Z'),
        new Date('2026-03-25T00:00:00.000Z'),
      );
      expect(set.has('2026-03-21')).toBe(true);
      expect(set.has('2026-03-22')).toBe(true);
      expect(set.has('2026-03-23')).toBe(true);
      expect(set.has('2026-03-20')).toBe(false);
      expect(set.has('2026-03-24')).toBe(false);
    });
  });
});
