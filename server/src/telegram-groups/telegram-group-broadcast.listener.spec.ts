import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethod,
  PaymentSource,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { TelegramGroupBroadcastListener } from './telegram-group-broadcast.listener';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { LARGE_PAYMENT_THRESHOLD_SUM } from './constants';

describe('TelegramGroupBroadcastListener', () => {
  let listener: TelegramGroupBroadcastListener;
  let enqueue: jest.Mock;
  let prisma: {
    student: { findUnique: jest.Mock };
    group: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    enqueue = jest.fn().mockResolvedValue(undefined);
    prisma = {
      student: { findUnique: jest.fn() },
      group: { findUnique: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupBroadcastListener,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
      ],
    }).compile();
    listener = module.get(TelegramGroupBroadcastListener);
  });

  const queued = () => enqueue.mock.calls[0][0];

  describe('payment.received', () => {
    const base = {
      paymentId: 'p1',
      studentId: 100,
      method: PaymentMethod.CASH,
      source: PaymentSource.ADMIN_MANUAL,
      studentBalance: 0,
      companyId: 1001,
    };

    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue({
        firstName: 'A',
        lastName: 'B',
        branches: [{ branch: { id: 7 } }],
      });
    });

    it('ignores small cash payments without looking anything up', async () => {
      await listener.onPaymentReceived({
        ...base,
        amount: LARGE_PAYMENT_THRESHOLD_SUM - 1,
      });
      expect(prisma.student.findUnique).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('queues a large cash payment for the student branch', async () => {
      await listener.onPaymentReceived({
        ...base,
        amount: LARGE_PAYMENT_THRESHOLD_SUM,
      });
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: 1001,
        companyId: 1001,
        branchId: 7,
        category: TelegramDigestCategory.GROUP_PAYMENT,
        relatedEntityId: 'p1',
        payload: {
          paymentId: 'p1',
          studentName: 'A B',
          amount: LARGE_PAYMENT_THRESHOLD_SUM,
          method: PaymentMethod.CASH,
        },
      });
    });

    it('queues an online payment regardless of size', async () => {
      await listener.onPaymentReceived({
        ...base,
        method: PaymentMethod.PAYME,
        amount: 50_000,
      });
      expect(queued().category).toBe(TelegramDigestCategory.GROUP_PAYMENT);
    });

    it('queues a very large payment too — there is no instant path any more', async () => {
      await listener.onPaymentReceived({ ...base, amount: 5_000_000 });
      expect(enqueue).toHaveBeenCalledTimes(1);
    });

    it('falls back to the student id and company-wide when the student row is gone', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await listener.onPaymentReceived({ ...base, amount: 600_000 });
      expect(queued()).toMatchObject({
        branchId: null,
        payload: { studentName: "O'quvchi ID 100" },
      });
    });
  });

  describe('student.created / group.created', () => {
    it('queues a new student with its branch', async () => {
      await listener.onStudentCreated({
        studentId: 10042,
        firstName: 'Ali',
        lastName: 'Valiyev',
        branchId: 1,
        branchName: 'Asosiy filial',
        companyId: 1001,
      });
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: 1001,
        companyId: 1001,
        branchId: 1,
        category: TelegramDigestCategory.GROUP_NEW_STUDENT,
        relatedEntityId: '10042',
        payload: {
          studentId: 10042,
          name: 'Ali Valiyev',
          branchName: 'Asosiy filial',
        },
      });
    });

    it('queues a new group with an ISO start date', async () => {
      await listener.onGroupCreated({
        groupId: 'g1',
        name: 'B1-Intensiv',
        branchId: 2,
        branchName: 'Chilonzor',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        companyId: 1001,
      });
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: 1001,
        companyId: 1001,
        branchId: 2,
        category: TelegramDigestCategory.GROUP_NEW_GROUP,
        relatedEntityId: 'g1',
        payload: {
          groupId: 'g1',
          name: 'B1-Intensiv',
          branchName: 'Chilonzor',
          startDate: '2026-06-01T00:00:00.000Z',
        },
      });
    });
  });

  describe('entity.status.changed', () => {
    const student = {
      firstName: 'Aziz',
      lastName: 'Karimov',
      branches: [{ branch: { id: 7, name: 'Chilonzor' } }],
    };
    const actor = {
      firstName: 'Dilnoza',
      lastName: 'Karimova',
      roles: [{ role: { name: 'Administrator' } }],
    };

    it('queues a student freeze with reason, actor and branch', async () => {
      prisma.student.findUnique.mockResolvedValue(student);
      prisma.user.findUnique.mockResolvedValue(actor);

      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'ACTIVE',
        newStatus: 'FROZEN',
        reason: "Ta'tilga chiqdi",
        changedById: 555,
        companyId: 1001,
      });

      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: 1001,
        companyId: 1001,
        branchId: 7,
        category: TelegramDigestCategory.GROUP_STATUS_CHANGE,
        relatedEntityId: 'Student:10042:STUDENT_FROZEN',
        payload: {
          entityType: 'Student',
          entityId: '10042',
          name: 'Aziz Karimov',
          transition: 'STUDENT_FROZEN',
          reason: "Ta'tilga chiqdi",
          actorName: 'Dilnoza Karimova',
          actorRole: 'Administrator',
          branchName: 'Chilonzor',
        },
      });
    });

    it('queues the expulsion of a frozen student with its reason', async () => {
      // A frozen student is expelled directly now; without this row the
      // 20:00 digest would say nothing about them leaving.
      prisma.student.findUnique.mockResolvedValue(student);
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'FROZEN',
        newStatus: 'EXPELLED',
        reason: "O'qishni tashladi",
        changedById: 555,
        companyId: 1001,
      });
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(queued()).toMatchObject({
        relatedEntityId: 'Student:10042:STUDENT_EXPELLED',
        payload: {
          transition: 'STUDENT_EXPELLED',
          reason: "O'qishni tashladi",
        },
      });
    });

    it('drops the reason for a reactivation', async () => {
      prisma.student.findUnique.mockResolvedValue(student);
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'FROZEN',
        newStatus: 'ACTIVE',
        reason: 'ignored',
        companyId: 1001,
      });
      expect(queued().payload).toMatchObject({
        transition: 'STUDENT_REACTIVATED',
        reason: null,
      });
    });

    it('falls back to the id, company-wide, when the student row is gone', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'ACTIVE',
        newStatus: 'GRADUATED',
        companyId: 1001,
      });
      expect(queued()).toMatchObject({
        branchId: null,
        payload: {
          name: 'ID 10042',
          transition: 'STUDENT_GRADUATED',
          branchName: null,
        },
      });
    });

    it('queues a group start scoped to the group branch', async () => {
      prisma.group.findUnique.mockResolvedValue({
        name: 'B1-Intensiv-043',
        branchId: 7,
        branch: { name: 'Chilonzor' },
      });
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'FORMING',
        newStatus: 'ACTIVE',
        companyId: 1001,
      });
      expect(queued()).toMatchObject({
        branchId: 7,
        relatedEntityId: 'Group:g1:GROUP_STARTED',
        payload: {
          entityType: 'Group',
          name: 'B1-Intensiv-043',
          transition: 'GROUP_STARTED',
          reason: null,
          branchName: 'Chilonzor',
        },
      });
    });

    it('carries reason and actor for a group that finished', async () => {
      prisma.group.findUnique.mockResolvedValue({
        name: 'B1-Intensiv-043',
        branchId: 7,
        branch: { name: 'Chilonzor' },
      });
      prisma.user.findUnique.mockResolvedValue(actor);
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'ACTIVE',
        newStatus: 'COMPLETED',
        reason: 'Kurs yakunlandi',
        changedById: 555,
        companyId: 1001,
      });
      expect(queued().payload).toMatchObject({
        transition: 'GROUP_COMPLETED',
        reason: 'Kurs yakunlandi',
        actorName: 'Dilnoza Karimova',
        actorRole: 'Administrator',
      });
    });

    it('falls back to the id when the group row is gone', async () => {
      prisma.group.findUnique.mockResolvedValue(null);
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'FORMING',
        newStatus: 'ACTIVE',
        companyId: 1001,
      });
      expect(queued()).toMatchObject({
        branchId: null,
        payload: { name: 'ID g1' },
      });
    });

    it.each([
      ['Group', 'FORMING', 'CANCELLED'],
      ['Student', 'ACTIVE', 'INACTIVE'],
      ['Enrollment', 'ACTIVE', 'FROZEN'],
    ])('ignores %s %s→%s', async (entityType, oldStatus, newStatus) => {
      await listener.onEntityStatusChanged({
        entityType,
        entityId: '1',
        oldStatus,
        newStatus,
        companyId: 1001,
      });
      expect(prisma.group.findUnique).not.toHaveBeenCalled();
      expect(prisma.student.findUnique).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('ignores events without a company', async () => {
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '1',
        oldStatus: 'ACTIVE',
        newStatus: 'FROZEN',
      });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('swallows queue errors without throwing', async () => {
      prisma.student.findUnique.mockResolvedValue(student);
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(
        listener.onEntityStatusChanged({
          entityType: 'Student',
          entityId: '10042',
          oldStatus: 'ACTIVE',
          newStatus: 'FROZEN',
          companyId: 1001,
        }),
      ).resolves.toBeUndefined();
    });
  });
});
