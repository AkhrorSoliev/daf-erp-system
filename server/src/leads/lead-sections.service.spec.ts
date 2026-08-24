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
      lead: {
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      // Supports both the array form (reorder) and the interactive callback
      // form (cascade remove), running the callback against the same mock.
      $transaction: jest
        .fn()
        .mockImplementation((arg: any) =>
          typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
        ),
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
        service.create({ columnId: 'col-1', name: '  ' }, 1001, 1, null),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the column is missing', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ columnId: 'missing', name: 'Reklama' }, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
    });

    it('appends the section to the end of the column and records history', async () => {
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'col-1',
        branchId: 1,
      });
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
        null,
      );

      expect(prisma.leadSection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Reklama',
          columnId: 'col-1',
          order: 3,
        }),
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
        service.update('x', { name: 'Y' }, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
    });

    it('renames the section and records history', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        name: 'Old',
        columnId: 'col-1',
        column: { id: 'col-1', branchId: 1 },
      });
      prisma.leadSection.update.mockResolvedValue({
        id: 'sec-1',
        name: 'New',
        columnId: 'col-1',
      });

      const result = await service.update(
        'sec-1',
        { name: 'New' },
        1001,
        1,
        null,
      );

      expect(result).toEqual({
        id: 'sec-1',
        name: 'New',
        columnId: 'col-1',
      });
      expect(history.recordUpdate).toHaveBeenCalled();
    });
  });

  describe('remove (cascade archive)', () => {
    it('throws NotFound for a missing section', async () => {
      prisma.leadSection.findFirst.mockResolvedValue(null);
      await expect(service.remove('missing', 1001, 1, null)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('archives the section + every lead inside it with a shared batch and audits each', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        name: 'Reklama',
        columnId: 'col-1',
        column: { id: 'col-1', branchId: 1 },
      });
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1', firstName: 'Aziz', lastName: 'Karimov' },
        { id: 'lead-2', firstName: 'Olim', lastName: 'Aliyev' },
      ]);

      const result = await service.remove('sec-1', 1001, 1, null);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ columnId: 'col-1', archivedLeadCount: 2 }),
      );
      // One section delete + one delete per cascaded lead = 3 audit rows.
      expect(history.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'LeadSection',
          entityId: 'sec-1',
        }),
      );
      expect(history.recordDelete).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'Lead', entityId: 'lead-1' }),
      );
      expect(history.recordDelete).toHaveBeenCalledTimes(3);
    });

    it('archives an empty section with no cascaded leads', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        name: 'Reklama',
        columnId: 'col-1',
        column: { id: 'col-1', branchId: 1 },
      });
      prisma.lead.findMany.mockResolvedValue([]);

      const result = await service.remove('sec-1', 1001, 1, null);

      expect(result.archivedLeadCount).toBe(0);
      expect(history.recordDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe('move', () => {
    it('throws NotFound for a missing section', async () => {
      prisma.leadSection.findFirst.mockResolvedValue(null);
      await expect(
        service.move('missing', { targetColumnId: 'col-2' }, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the target column is missing', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        columnId: 'col-1',
        name: 'Reklama',
        order: 0,
        column: { id: 'col-1', branchId: 1 },
      });
      prisma.leadColumn.findFirst.mockResolvedValue(null);
      await expect(
        service.move('sec-1', { targetColumnId: 'missing' }, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
    });

    it('moves the section to the end of the target column and records history', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        columnId: 'col-1',
        name: 'Reklama',
        order: 0,
        column: { id: 'col-1', branchId: 1 },
      });
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'col-2',
        branchId: 1,
      });
      prisma.leadSection.aggregate.mockResolvedValue({ _max: { order: 1 } });
      prisma.leadSection.update.mockResolvedValue({
        id: 'sec-1',
        name: 'Reklama',
        columnId: 'col-2',
        order: 2,
      });

      const result = await service.move(
        'sec-1',
        { targetColumnId: 'col-2' },
        1001,
        1,
        null,
      );

      expect(prisma.leadSection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sec-1' },
          data: { columnId: 'col-2', order: 2 },
        }),
      );
      expect(result).toEqual({
        id: 'sec-1',
        name: 'Reklama',
        columnId: 'col-2',
        order: 2,
      });
      expect(history.recordUpdate).toHaveBeenCalled();
    });

    it("refuses to move a section into another branch's column", async () => {
      // The section carries its leads with it. Landing them on the other
      // branch's board while their own `branchId` stays put is what makes a
      // lead visible in one branch's funnel and counted in the other's — and a
      // CEO spans both branches, so scope alone does not stop this.
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        columnId: 'col-1',
        name: 'Reklama',
        order: 0,
        column: { id: 'col-1', branchId: 1 },
      });
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'col-9',
        branchId: 2,
      });

      await expect(
        service.move('sec-1', { targetColumnId: 'col-9' }, 1001, 1, null),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.leadSection.update).not.toHaveBeenCalled();
    });

    it('is a no-op when the section is already in the target column', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        columnId: 'col-1',
        name: 'Reklama',
        order: 0,
        column: { id: 'col-1', branchId: 1 },
      });
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'col-1',
        branchId: 1,
      });

      const result = await service.move(
        'sec-1',
        { targetColumnId: 'col-1' },
        1001,
        1,
        null,
      );

      expect(prisma.leadSection.update).not.toHaveBeenCalled();
      expect(result.columnId).toBe('col-1');
    });
  });

  describe('reorder', () => {
    // Reordering is gated on the COLUMN, which is what carries the branch.
    beforeEach(() => {
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'col-1',
        branchId: 1,
      });
    });

    it('rejects a section that does not belong to the column', async () => {
      prisma.leadSection.findMany.mockResolvedValue([{ id: 'sec-1' }]);
      await expect(
        service.reorder(
          { columnId: 'col-1', sectionIds: ['other'] },
          1001,
          null,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('renumbers the column sections inside a transaction', async () => {
      prisma.leadSection.findMany.mockResolvedValue([
        { id: 'sec-1' },
        { id: 'sec-2' },
      ]);
      await service.reorder(
        { columnId: 'col-1', sectionIds: ['sec-2', 'sec-1'] },
        1001,
        null,
      );
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
