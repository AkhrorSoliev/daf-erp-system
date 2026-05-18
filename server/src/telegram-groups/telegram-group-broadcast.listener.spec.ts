import { Test, TestingModule } from '@nestjs/testing';
import { TelegramGroupBroadcastListener } from './telegram-group-broadcast.listener';
import { TelegramGroupBroadcastService } from './telegram-group-broadcast.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod, PaymentSource } from '@prisma/client';
import { LARGE_PAYMENT_THRESHOLD_SUM } from './constants';

describe('TelegramGroupBroadcastListener', () => {
  let listener: TelegramGroupBroadcastListener;
  const broadcast = jest.fn().mockResolvedValue(undefined);
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

    it('does not broadcast small cash payments (below threshold)', async () => {
      await listener.onPaymentReceived({
        ...basePayload,
        amount: LARGE_PAYMENT_THRESHOLD_SUM - 1,
      });
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('broadcasts large cash payments', async () => {
      mockPrisma.student.findUnique.mockResolvedValue({
        firstName: 'A',
        lastName: 'B',
        branches: [],
      });
      await listener.onPaymentReceived({
        ...basePayload,
        amount: LARGE_PAYMENT_THRESHOLD_SUM,
      });
      expect(broadcast).toHaveBeenCalled();
    });

    it('broadcasts external gateway payments regardless of size', async () => {
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
      expect(broadcast).toHaveBeenCalled();
    });
  });

  describe('entity.status.changed', () => {
    it('broadcasts Student ACTIVE → FROZEN', async () => {
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
    it('broadcasts with branch context', async () => {
      await listener.onStudentCreated({
        studentId: 10042,
        firstName: 'Ali',
        lastName: 'Valiyev',
        branchId: 1,
        branchName: 'Asosiy filial',
        companyId: 1001,
      });
      expect(broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 1001,
          branchId: 1,
          message: expect.stringContaining('Yangi'),
        }),
      );
    });
  });
});
