import { Test, TestingModule } from '@nestjs/testing';
import { TelegramGroupBroadcastListener } from './telegram-group-broadcast.listener';
import { TelegramGroupBroadcastService } from './telegram-group-broadcast.service';
import { TelegramGroupDigestBufferService } from './telegram-group-digest-buffer.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod, PaymentSource } from '@prisma/client';
import {
  INSTANT_PAYMENT_THRESHOLD_SUM,
  LARGE_PAYMENT_THRESHOLD_SUM,
} from './constants';

describe('TelegramGroupBroadcastListener', () => {
  let listener: TelegramGroupBroadcastListener;
  const broadcast = jest.fn().mockResolvedValue(undefined);
  const push = jest.fn().mockResolvedValue(undefined);
  const mockPrisma = {
    student: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupBroadcastListener,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TelegramGroupBroadcastService, useValue: { broadcast } },
        { provide: TelegramGroupDigestBufferService, useValue: { push } },
      ],
    }).compile();
    listener = module.get(TelegramGroupBroadcastListener);
  });

  describe('payment.received', () => {
    const basePayload = {
      paymentId: 'p1',
      studentId: 100,
      method: PaymentMethod.CASH,
      source: PaymentSource.ADMIN_MANUAL,
      studentBalance: 0,
      companyId: 1001,
    };

    it('ignores small cash payments (below digest threshold)', async () => {
      await listener.onPaymentReceived({
        ...basePayload,
        amount: LARGE_PAYMENT_THRESHOLD_SUM - 1,
      });
      expect(broadcast).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    });

    it('buffers large cash payments into the digest (not instant)', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        firstName: 'A',
        lastName: 'B',
        branches: [],
      });
      await listener.onPaymentReceived({
        ...basePayload,
        amount: LARGE_PAYMENT_THRESHOLD_SUM,
      });
      expect(broadcast).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({ kind: 'payment', amount: LARGE_PAYMENT_THRESHOLD_SUM }),
      );
    });

    it('buffers external gateway payments regardless of size', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        firstName: 'A',
        lastName: 'B',
        branches: [],
      });
      await listener.onPaymentReceived({
        ...basePayload,
        method: PaymentMethod.PAYME,
        amount: 50_000, // small
      });
      expect(broadcast).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({ kind: 'payment', method: PaymentMethod.PAYME }),
      );
    });

    it('broadcasts very large payments instantly (no digest buffering)', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        firstName: 'A',
        lastName: 'B',
        branches: [{ branch: { id: 7, name: 'Filial' } }],
      });
      await listener.onPaymentReceived({
        ...basePayload,
        amount: INSTANT_PAYMENT_THRESHOLD_SUM,
      });
      expect(push).not.toHaveBeenCalled();
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 1001, branchId: 7 }),
      );
    });
  });

  describe('entity.status.changed', () => {
    it('broadcasts Student ACTIVE → FROZEN instantly', async () => {
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'ACTIVE',
        newStatus: 'FROZEN',
        companyId: 1001,
      });
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 1001,
          message: expect.stringContaining('muzlatildi'),
          // throttle bucket is per-entity so two students don't collide
          eventClass: 'entity.status.changed:Student:10042',
        }),
      );
    });

    it('broadcasts Group FORMING → ACTIVE', async () => {
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'FORMING',
        newStatus: 'ACTIVE',
        companyId: 1001,
      });
      expect(broadcast).toHaveBeenCalled();
    });

    it('is silent for transitions not in the whitelist', async () => {
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '1',
        oldStatus: 'ACTIVE',
        newStatus: 'INACTIVE',
        companyId: 1001,
      });
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('is silent when companyId is missing', async () => {
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '1',
        oldStatus: 'ACTIVE',
        newStatus: 'FROZEN',
      });
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('student.created', () => {
    it('buffers the new student into the digest (no instant broadcast)', async () => {
      await listener.onStudentCreated({
        studentId: 10042,
        firstName: 'Ali',
        lastName: 'Valiyev',
        branchId: 1,
        branchName: 'Asosiy filial',
        companyId: 1001,
      });
      expect(broadcast).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          kind: 'student',
          branchId: 1,
          studentId: 10042,
          name: 'Ali Valiyev',
        }),
      );
    });
  });

  describe('group.created', () => {
    it('buffers the new group into the digest', async () => {
      await listener.onGroupCreated({
        groupId: 'g1',
        name: 'B1-Intensiv',
        branchId: 2,
        branchName: 'Chilonzor',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        companyId: 1001,
      });
      expect(broadcast).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          kind: 'group',
          branchId: 2,
          name: 'B1-Intensiv',
        }),
      );
    });
  });
});
