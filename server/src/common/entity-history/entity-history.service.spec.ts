import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityHistoryService } from './entity-history.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('EntityHistoryService', () => {
  let service: EntityHistoryService;
  let prisma: { entityHistory: { create: jest.Mock } };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      entityHistory: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityHistoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<EntityHistoryService>(EntityHistoryService);
  });

  describe('tx-awareness', () => {
    // The whole point of FAZA 0.1: every record* method must write through
    // the supplied tx client when present, so an outer $transaction can
    // roll back the audit row alongside the change it describes.
    it('recordStatusChange uses tx.entityHistory.create when tx is provided', async () => {
      const tx = { entityHistory: { create: jest.fn().mockResolvedValue(undefined) } };

      await service.recordStatusChange({
        entityType: 'Student',
        entityId: 10001,
        oldValues: { status: 'ACTIVE' },
        newValues: { status: 'FROZEN' },
        changedById: 1,
        companyId: 1,
        tx: tx as any,
      });

      expect(tx.entityHistory.create).toHaveBeenCalledTimes(1);
      expect(prisma.entityHistory.create).not.toHaveBeenCalled();
    });

    it('recordStatusChange falls back to prisma when no tx', async () => {
      await service.recordStatusChange({
        entityType: 'Student',
        entityId: 10001,
        oldValues: { status: 'ACTIVE' },
        newValues: { status: 'FROZEN' },
        changedById: 1,
        companyId: 1,
      });

      expect(prisma.entityHistory.create).toHaveBeenCalledTimes(1);
    });

    it('recordStatusChange always emits entity.status.changed (outside tx)', async () => {
      const tx = { entityHistory: { create: jest.fn().mockResolvedValue(undefined) } };

      await service.recordStatusChange({
        entityType: 'Student',
        entityId: 10001,
        oldValues: { status: 'ACTIVE' },
        newValues: { status: 'FROZEN', reason: 'test' },
        changedById: 1,
        companyId: 1,
        tx: tx as any,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'entity.status.changed',
        expect.objectContaining({
          entityType: 'Student',
          entityId: '10001',
          oldStatus: 'ACTIVE',
          newStatus: 'FROZEN',
          reason: 'test',
        }),
      );
    });

    it('recordRestore uses tx.entityHistory.create when tx is provided', async () => {
      const tx = { entityHistory: { create: jest.fn().mockResolvedValue(undefined) } };

      await service.recordRestore({
        entityType: 'Student',
        entityId: 10001,
        newValues: { status: 'ACTIVE' },
        changedById: 1,
        companyId: 1,
        tx: tx as any,
      });

      expect(tx.entityHistory.create).toHaveBeenCalledTimes(1);
      expect(prisma.entityHistory.create).not.toHaveBeenCalled();
    });

    it('recordRestore falls back to prisma when no tx', async () => {
      await service.recordRestore({
        entityType: 'Student',
        entityId: 10001,
        newValues: { status: 'ACTIVE' },
        changedById: 1,
        companyId: 1,
      });

      expect(prisma.entityHistory.create).toHaveBeenCalledTimes(1);
    });
  });
});
