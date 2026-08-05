import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeadColumnsService } from './lead-columns.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('LeadColumnsService', () => {
  let service: LeadColumnsService;
  let prisma: any;
  let history: any;

  beforeEach(async () => {
    prisma = {
      leadColumn: {
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      leadSection: { count: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    history = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadColumnsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();

    service = module.get(LeadColumnsService);
  });

  describe('create', () => {
    it('rejects a duplicate name', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.create({ name: 'Sotuv' }, 1001, 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates a non-system column at the end of the board', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue(null);
      prisma.leadColumn.aggregate.mockResolvedValue({ _max: { order: 2 } });
      prisma.leadColumn.create.mockResolvedValue({
        id: 'col-9',
        name: 'Sotuv',
        order: 3,
        isSystem: false,
        systemKey: null,
      });

      const result = await service.create({ name: 'Sotuv' }, 1001, 1);

      expect(prisma.leadColumn.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: 'Sotuv', order: 3, isSystem: false }),
      });
      expect(result.sections).toEqual([]);
      expect(history.recordCreate).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFound for a missing column', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue(null);
      await expect(
        service.update('x', { name: 'Y' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to rename a system column', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'sys',
        name: 'Yangi Lidlar',
        isSystem: true,
      });
      await expect(
        service.update('sys', { name: 'X' }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('renames a custom column', async () => {
      prisma.leadColumn.findFirst
        .mockResolvedValueOnce({ id: 'col-1', name: 'Old', isSystem: false })
        .mockResolvedValueOnce(null);
      prisma.leadColumn.update.mockResolvedValue({ id: 'col-1', name: 'New' });

      const result = await service.update('col-1', { name: 'New' }, 1001, 1);

      expect(result).toEqual({ id: 'col-1', name: 'New' });
      expect(history.recordUpdate).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('refuses to delete a system column', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'sys',
        isSystem: true,
        name: 'Yangi Lidlar',
      });
      await expect(service.remove('sys', 1001, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to delete a column that still has sections', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'col-1',
        isSystem: false,
        name: 'Sotuv',
      });
      prisma.leadSection.count.mockResolvedValue(2);
      await expect(service.remove('col-1', 1001, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('soft-deletes an empty custom column', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'col-1',
        isSystem: false,
        name: 'Sotuv',
      });
      prisma.leadSection.count.mockResolvedValue(0);

      await service.remove('col-1', 1001, 1);

      expect(prisma.leadColumn.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'col-1' },
          data: expect.objectContaining({ deletedById: 1 }),
        }),
      );
      expect(history.recordDelete).toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    it('rejects an id that is not a custom column', async () => {
      prisma.leadColumn.findMany.mockResolvedValue([
        { id: 'sys-1', isSystem: true, systemKey: 'NEW' },
        { id: 'col-1', isSystem: false, systemKey: null },
      ]);
      await expect(
        service.reorder({ columnIds: ['sys-1'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('renumbers custom columns inside a transaction', async () => {
      prisma.leadColumn.findMany.mockResolvedValue([
        { id: 'sys-1', isSystem: true, systemKey: 'NEW' },
        { id: 'col-a', isSystem: false, systemKey: null },
        { id: 'col-b', isSystem: false, systemKey: null },
      ]);

      await service.reorder({ columnIds: ['col-b', 'col-a'] });

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
