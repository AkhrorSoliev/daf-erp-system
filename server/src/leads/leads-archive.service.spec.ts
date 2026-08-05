import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LeadsArchiveService } from './leads-archive.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('LeadsArchiveService', () => {
  let service: LeadsArchiveService;
  let prisma: any;
  let history: any;

  beforeEach(async () => {
    prisma = {
      lead: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _max: { order: null } }),
        update: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      leadSection: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _max: { order: null } }),
        update: jest.fn(),
      },
      leadColumn: { findFirst: jest.fn() },
      // Restore runs inside an interactive transaction; execute the callback
      // against the same mock client.
      $transaction: jest.fn().mockImplementation((arg: any) =>
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
        LeadsArchiveService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();

    service = module.get(LeadsArchiveService);
  });

  describe('getArchive', () => {
    it('returns archived leads + sections with per-section lead counts', async () => {
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1', firstName: 'Aziz', lastName: 'Karimov' },
      ]);
      prisma.leadSection.findMany.mockResolvedValue([
        { id: 'sec-1', name: 'Reklama', deletionBatchId: 'batch-1' },
        { id: 'sec-2', name: 'Eski', deletionBatchId: null },
      ]);
      prisma.lead.groupBy
        // by batch
        .mockResolvedValueOnce([
          { deletionBatchId: 'batch-1', _count: { _all: 2 } },
        ])
        // by section (legacy)
        .mockResolvedValueOnce([{ sectionId: 'sec-2', _count: { _all: 5 } }]);

      const result = await service.getArchive(1001, null);

      expect(result.leads).toHaveLength(1);
      expect(result.sections).toEqual([
        expect.objectContaining({ id: 'sec-1', leadCount: 2 }),
        expect.objectContaining({ id: 'sec-2', leadCount: 5 }),
      ]);
    });
  });

  describe('restoreLead', () => {
    it('throws NotFound when the archived lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.restoreLead('x', { columnId: 'c', sectionId: 's' }, 1001, 1, null),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the target section is missing or mismatched', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' });
      prisma.leadSection.findFirst.mockResolvedValue(null);
      await expect(
        service.restoreLead(
          'lead-1',
          { columnId: 'col-1', sectionId: 'sec-1' },
          1001,
          1,
          null,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('clears the archive marker, lands the lead in the section as NEW, audits it', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        statusEnum: 'NEW',
        convertedStudentId: null,
      });
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        column: { systemKey: 'NEW' },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: 3 } });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1', sectionId: 'sec-1' });

      const result = await service.restoreLead(
        'lead-1',
        { columnId: 'col-1', sectionId: 'sec-1' },
        1001,
        7,
        null,
      );

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1' },
          data: expect.objectContaining({
            deletedAt: null,
            deletionBatchId: null,
            sectionId: 'sec-1',
            order: 4,
            statusEnum: 'NEW',
          }),
        }),
      );
      expect(history.recordRestore).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'Lead', entityId: 'lead-1' }),
      );
      expect(result.sectionId).toBe('sec-1');
    });

    it('keeps CONVERTED status when restoring a converted lead (does not clobber it to NEW)', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-9',
        statusEnum: 'CONVERTED',
        convertedStudentId: 10007,
      });
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        column: { systemKey: 'NEW' },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.update.mockResolvedValue({ id: 'lead-9', sectionId: 'sec-1' });

      await service.restoreLead(
        'lead-9',
        { columnId: 'col-1', sectionId: 'sec-1' },
        1001,
        7,
        null,
      );

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ statusEnum: 'CONVERTED' }),
        }),
      );
    });
  });

  describe('restoreSection', () => {
    it('throws NotFound when the archived section is missing', async () => {
      prisma.leadSection.findFirst.mockResolvedValue(null);
      await expect(
        service.restoreSection(
          'x',
          { targetColumnId: 'col-1', withLeads: false },
          1001,
          1,
          null,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound when the target column is missing', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        name: 'Reklama',
        deletionBatchId: 'batch-1',
      });
      prisma.leadColumn.findFirst.mockResolvedValue(null);
      await expect(
        service.restoreSection(
          'sec-1',
          { targetColumnId: 'missing', withLeads: false },
          1001,
          1,
          null,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('restores the section only (without leads) and does not touch leads', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        name: 'Reklama',
        deletionBatchId: 'batch-1',
      });
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'col-2',
        systemKey: null,
      });

      const result = await service.restoreSection(
        'sec-1',
        { targetColumnId: 'col-2', withLeads: false },
        1001,
        1,
        null,
      );

      expect(prisma.leadSection.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sec-1' },
          data: expect.objectContaining({
            deletedAt: null,
            deletionBatchId: null,
            columnId: 'col-2',
          }),
        }),
      );
      expect(prisma.lead.findMany).not.toHaveBeenCalled();
      expect(result.restoredLeadCount).toBe(0);
    });

    it('restores the section AND its batch leads when withLeads is true', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-1',
        name: 'Reklama',
        deletionBatchId: 'batch-1',
      });
      prisma.leadColumn.findFirst.mockResolvedValue({
        id: 'col-2',
        systemKey: null,
      });
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1', statusEnum: 'NEW', convertedStudentId: null },
        { id: 'lead-2', statusEnum: 'NEW', convertedStudentId: null },
      ]);

      const result = await service.restoreSection(
        'sec-1',
        { targetColumnId: 'col-2', withLeads: true },
        1001,
        1,
        null,
      );

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletionBatchId: 'batch-1', deletedAt: { not: null } },
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.restoredLeadCount).toBe(2);
      // section restore + one per lead.
      expect(history.recordRestore).toHaveBeenCalledTimes(3);
    });
  });
});
