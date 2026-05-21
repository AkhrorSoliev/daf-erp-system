import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadSectionsService } from './lead-sections.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('LeadSectionsService', () => {
  let service: LeadSectionsService;
  let prisma: any;
  let history: any;

  beforeEach(async () => {
    prisma = {
      leadColumn: { findFirst: jest.fn() },
      leadSection: {
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      lead: { count: jest.fn() },
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
        LeadSectionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();

    service = module.get(LeadSectionsService);
  });

  describe('create', () => {
    it('rejects an empty name', async () => {
      await expect(
        service.create({ columnId: 'col-1', name: '  ' }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the column is missing', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ columnId: 'missing', name: 'Reklama' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('appends the section to the end of the column and records history', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue({ id: 'col-1' });
      prisma.leadSection.aggregate.mockResolvedValue({ _max: { order: 2 } });
      prisma.leadSection.create.mockResolvedValue({
        id: 'sec-9',
        name: 'Reklama',
        columnId: 'col-1',
        order: 3,
      });

      const result = await service.create(
        { columnId: 'col-1', name: 'Reklama' },
        1001,
        1,
      );

      expect(prisma.leadSection.create).toHaveBeenCalledWith({
        data: { name: 'Reklama', columnId: 'col-1', order: 3 },
      });
      expect(result.leadCount).toBe(0);
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'LeadSection',
          entityId: 'sec-9',
        }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFound for a missing section', async () => {
      prisma.leadSection.findFirst.mockResolvedValue(null);
      await expect(
        service.update('x', { name: 'Y' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('renames the section and records history', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        name: 'Old',
        columnId: 'col-1',
      });
      prisma.leadSection.update.mockResolvedValue({
        id: 'sec-1',
        name: 'New',
        columnId: 'col-1',
      });

      const result = await service.update('sec-1', { name: 'New' }, 1001, 1);

      expect(result).toEqual({
        id: 'sec-1',
        name: 'New',
        columnId: 'col-1',
      });
      expect(history.recordUpdate).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('refuses to delete a section that still has leads', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        name: 'Reklama',
        columnId: 'col-1',
      });
      prisma.lead.count.mockResolvedValue(3);
      await expect(service.remove('sec-1', 1001, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('soft-deletes an empty section and returns its column id', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        name: 'Reklama',
        columnId: 'col-1',
      });
      prisma.lead.count.mockResolvedValue(0);

      const result = await service.remove('sec-1', 1001, 1);

      expect(result.columnId).toBe('col-1');
      expect(prisma.leadSection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sec-1' },
          data: expect.objectContaining({ deletedById: 1 }),
        }),
      );
      expect(history.recordDelete).toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    it('rejects a section that does not belong to the column', async () => {
      prisma.leadSection.findMany.mockResolvedValue([{ id: 'sec-1' }]);
      await expect(
        service.reorder({ columnId: 'col-1', sectionIds: ['other'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('renumbers the column sections inside a transaction', async () => {
      prisma.leadSection.findMany.mockResolvedValue([
        { id: 'sec-1' },
        { id: 'sec-2' },
      ]);
      await service.reorder({
        columnId: 'col-1',
        sectionIds: ['sec-2', 'sec-1'],
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
