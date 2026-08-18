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

  /**
   * A history row must never be the thing that breaks the operation it is
   * describing. On 2026-08-18 a payment receipt was delivered, its SmsMessage
   * row written, and then `entityHistory.create` was refused by PostgreSQL
   * because a caller's own truncation had left half an emoji in the payload —
   * "invalid input syntax for type json". Callers were fixed, but this layer
   * is the single funnel every history write goes through, so it sanitises
   * too: no future caller can poison the audit trail the same way.
   */
  describe('jsonb safety', () => {
    it('strips a lone surrogate from recordCreate values', async () => {
      await service.recordCreate({
        entityType: 'Student',
        entityId: 10001,
        newValues: { xabar: 'Chek yuborildi \uD83D' },
        companyId: 1,
      });

      const data = prisma.entityHistory.create.mock.calls[0][0].data;
      expect(data.newValues.xabar).toBe('Chek yuborildi ');
    });

    it('leaves a well-formed emoji alone', async () => {
      await service.recordCreate({
        entityType: 'Student',
        entityId: 10001,
        newValues: { xabar: 'Chek \u{1F4C4}' },
        companyId: 1,
      });

      const data = prisma.entityHistory.create.mock.calls[0][0].data;
      expect(data.newValues.xabar).toBe('Chek \u{1F4C4}');
    });

    it('sanitises both sides of an update diff', async () => {
      await service.recordUpdate({
        entityType: 'Student',
        entityId: 10001,
        oldValues: { ism: 'Eski \uD83D' },
        newValues: { ism: 'Yangi \uDCC4' },
        companyId: 1,
      });

      const data = prisma.entityHistory.create.mock.calls[0][0].data;
      expect(data.oldValues.ism).toBe('Eski ');
      expect(data.newValues.ism).toBe('Yangi ');
    });

    it('does not disturb non-string values', async () => {
      await service.recordCreate({
        entityType: 'Student',
        entityId: 10001,
        newValues: { soni: 42, bor: true, yoq: null },
        companyId: 1,
      });

      const data = prisma.entityHistory.create.mock.calls[0][0].data;
      expect(data.newValues).toEqual({ soni: 42, bor: true, yoq: null });
    });
  });
});
