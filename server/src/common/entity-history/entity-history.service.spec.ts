import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityHistoryService } from './entity-history.service';
import type { EntityStatusChangedEvent } from './entity-history.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('EntityHistoryService', () => {
  let service: EntityHistoryService;
  let prisma: {
    entityHistory: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      entityHistory: {
        create: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
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
      const tx = {
        entityHistory: { create: jest.fn().mockResolvedValue(undefined) },
      };

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
      const tx = {
        entityHistory: { create: jest.fn().mockResolvedValue(undefined) },
      };

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

    it('holds the event back when the caller defers it, and emits it on request', async () => {
      const deferredEvents: EntityStatusChangedEvent[] = [];

      await service.recordStatusChange({
        entityType: 'Group',
        entityId: 'group-1',
        oldValues: { status: 'ACTIVE' },
        newValues: { status: 'COMPLETED', reason: 'tugadi' },
        changedById: 1,
        companyId: 1,
        deferredEvents,
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(deferredEvents).toEqual([
        {
          entityType: 'Group',
          entityId: 'group-1',
          oldStatus: 'ACTIVE',
          newStatus: 'COMPLETED',
          reason: 'tugadi',
          changedById: 1,
          companyId: 1,
        },
      ]);

      service.emitStatusChanged(deferredEvents);

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'entity.status.changed',
        deferredEvents[0],
      );
    });

    it('recordRestore uses tx.entityHistory.create when tx is provided', async () => {
      const tx = {
        entityHistory: { create: jest.fn().mockResolvedValue(undefined) },
      };

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

  /**
   * `User.balance` is the employee's salary balance. `teachers.view` and
   * `employees.view` open an employee's history; neither means «may see
   * pay» (ADR-0087). `users.service.ts` hands `userSelect`, balance
   * included, to recordCreate and recordDelete.
   */
  describe('employee balance', () => {
    it('stores no User.balance on create, update or delete', async () => {
      await service.recordCreate({
        entityType: 'User',
        entityId: 10050,
        newValues: { firstName: 'Ali', balance: 1 },
        companyId: 1,
      });
      await service.recordUpdate({
        entityType: 'User',
        entityId: 10050,
        oldValues: { firstName: 'Ali', balance: 1 },
        newValues: { firstName: 'Vali', balance: 2 },
        companyId: 1,
      });
      await service.recordDelete({
        entityType: 'User',
        entityId: 10050,
        oldValues: { firstName: 'Vali', balance: 2 },
        companyId: 1,
      });

      const [created, updated, deleted] =
        prisma.entityHistory.create.mock.calls.map((c) => c[0].data);
      expect(created.newValues).toEqual({ firstName: 'Ali' });
      expect(updated.oldValues).toEqual({ firstName: 'Ali' });
      expect(updated.newValues).toEqual({ firstName: 'Vali' });
      expect(deleted.oldValues).toEqual({ firstName: 'Vali' });
    });

    it('keeps a Student balance', async () => {
      await service.recordCreate({
        entityType: 'Student',
        entityId: 10001,
        newValues: { firstName: 'Ali', balance: 1 },
        companyId: 1,
      });
      const data = prisma.entityHistory.create.mock.calls[0][0].data;
      expect(data.newValues).toEqual({ firstName: 'Ali', balance: 1 });
    });

    it('strips a balance stored before the fix when it reads User history', async () => {
      prisma.entityHistory.findMany.mockResolvedValue([
        {
          id: 'h1',
          action: 'DELETE',
          oldValues: { firstName: 'Ali', balance: 1 },
          newValues: null,
        },
      ]);
      prisma.entityHistory.count.mockResolvedValue(1);

      const page = await service.getHistory('User', '10050', 1);

      expect(page.data[0].oldValues).toEqual({ firstName: 'Ali' });
      expect(page.data[0].newValues).toBeNull();
      expect(page.total).toBe(1);
    });

    it('returns a stored Student balance unchanged', async () => {
      prisma.entityHistory.findMany.mockResolvedValue([
        {
          id: 'h2',
          action: 'CREATE',
          oldValues: null,
          newValues: { balance: 1 },
        },
      ]);

      const page = await service.getHistory('Student', '10001', 1);

      expect(page.data[0].newValues).toEqual({ balance: 1 });
    });

    it('hides officialSalary from User history unless the reader may see pay', async () => {
      prisma.entityHistory.findMany.mockResolvedValue([
        {
          id: 'h3',
          action: 'UPDATE',
          oldValues: { officialSalary: null },
          newValues: { officialSalary: 2_000_000 },
        },
      ]);

      const hidden = await service.getHistory('User', '10050', 1);
      expect(hidden.data[0].newValues).toEqual({});

      const shown = await service.getHistory('User', '10050', 1, {
        canViewSalary: true,
      });
      expect(shown.data[0].newValues).toEqual({ officialSalary: 2_000_000 });
    });
  });
});
