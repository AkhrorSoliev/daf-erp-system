import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { LeadSourcesService } from './lead-sources.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('LeadSourcesService', () => {
  let service: LeadSourcesService;
  let prisma: any;
  let history: any;

  beforeEach(async () => {
    prisma = {
      leadSource: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        aggregate: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      lead: { findMany: jest.fn() },
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
        LeadSourcesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();

    service = module.get(LeadSourcesService);
  });

  describe('findAll', () => {
    it('lists only active, non-deleted sources', async () => {
      prisma.leadSource.findMany.mockResolvedValue([]);
      await service.findAll();
      expect(prisma.leadSource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, isActive: true },
        }),
      );
    });
  });

  describe('findAllForFilter', () => {
    it('includes active sources and deleted-but-still-used ones with a flag', async () => {
      prisma.lead.findMany.mockResolvedValue([{ sourceId: 'src-deleted' }]);
      prisma.leadSource.findMany.mockResolvedValue([
        { id: 'src-1', name: 'Instagram', deletedAt: null },
        { id: 'src-deleted', name: 'Eski manba', deletedAt: new Date() },
      ]);

      const result = await service.findAllForFilter();

      expect(result).toEqual([
        { id: 'src-1', name: 'Instagram', deleted: false },
        { id: 'src-deleted', name: 'Eski manba', deleted: true },
      ]);
    });
  });

  describe('create', () => {
    it('rejects an empty name', async () => {
      await expect(service.create({ name: '   ' }, 1001, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a duplicate name', async () => {
      prisma.leadSource.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create({ name: 'Instagram' }, 1001, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the source at the end of the list and records history', async () => {
      prisma.leadSource.findFirst.mockResolvedValue(null);
      prisma.leadSource.aggregate.mockResolvedValue({ _max: { order: 1 } });
      prisma.leadSource.create.mockResolvedValue({
        id: 'src-1',
        name: 'Instagram',
      });

      const result = await service.create({ name: 'Instagram' }, 1001, 1);

      expect(prisma.leadSource.create).toHaveBeenCalledWith({
        data: { name: 'Instagram', order: 2 },
      });
      expect(result).toEqual({ id: 'src-1', name: 'Instagram' });
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'LeadSource',
          entityId: 'src-1',
        }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFound for a missing source', async () => {
      prisma.leadSource.findFirst.mockResolvedValue(null);
      await expect(
        service.update('x', { name: 'Y' }, 1001, 1),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a duplicate name', async () => {
      prisma.leadSource.findFirst
        .mockResolvedValueOnce({ id: 'src-1', name: 'Old' })
        .mockResolvedValueOnce({ id: 'other' });
      await expect(
        service.update('src-1', { name: 'Instagram' }, 1001, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('renames the source and records history', async () => {
      prisma.leadSource.findFirst
        .mockResolvedValueOnce({ id: 'src-1', name: 'Old' })
        .mockResolvedValueOnce(null);
      prisma.leadSource.update.mockResolvedValue({
        id: 'src-1',
        name: 'Telegram',
      });

      const result = await service.update(
        'src-1',
        { name: 'Telegram' },
        1001,
        1,
      );

      expect(result).toEqual({ id: 'src-1', name: 'Telegram' });
      expect(history.recordUpdate).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFound for a missing source', async () => {
      prisma.leadSource.findFirst.mockResolvedValue(null);
      await expect(service.remove('x', 1001, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('soft-deletes the source and records history', async () => {
      prisma.leadSource.findFirst.mockResolvedValue({
        id: 'src-1',
        name: 'Instagram',
      });

      await service.remove('src-1', 1001, 1);

      expect(prisma.leadSource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'src-1' },
          data: expect.objectContaining({ deletedById: 1 }),
        }),
      );
      expect(history.recordDelete).toHaveBeenCalled();
    });
  });
});
