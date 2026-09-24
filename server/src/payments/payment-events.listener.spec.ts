import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethod,
  PaymentSource,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PaymentEventsListener } from './payment-events.listener';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';

describe('PaymentEventsListener', () => {
  let listener: PaymentEventsListener;
  let enqueue: jest.Mock;

  const basePayload = {
    paymentId: 'pay-1',
    studentId: 10001,
    amount: 1500000,
    method: PaymentMethod.CASH,
    source: PaymentSource.ADMIN_MANUAL,
    studentBalance: 2000000,
    companyId: 1,
    performedById: 99,
  };

  const clearEnv = () => {
    delete process.env.INVOICE_BASE_URL;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.APP_URL;
  };

  beforeEach(async () => {
    clearEnv();
    enqueue = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEventsListener,
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
      ],
    }).compile();
    listener = module.get(PaymentEventsListener);
  });

  afterEach(clearEnv);

  it('queues the receipt for the 20:00 digest with a structured payload', async () => {
    await listener.handle(basePayload);

    expect(enqueue).toHaveBeenCalledWith({
      recipientKind: TelegramDigestRecipientKind.STUDENT,
      recipientId: 10001,
      companyId: 1,
      category: TelegramDigestCategory.PAYMENT_RECEIVED,
      relatedEntityId: 'pay-1',
      payload: {
        paymentId: 'pay-1',
        amount: 1500000,
        method: PaymentMethod.CASH,
        receiptUrl: 'https://admin.dafzentrum.uz/r/pay-1',
        performedById: 99,
      },
    });
  });

  it('builds the receipt link from INVOICE_BASE_URL when configured', async () => {
    process.env.INVOICE_BASE_URL = 'https://invoice.dafzentrum.uz';
    await listener.handle(basePayload);
    expect(enqueue.mock.calls[0][0].payload.receiptUrl).toBe(
      'https://invoice.dafzentrum.uz/pay-1',
    );
  });

  it('falls back to PUBLIC_BASE_URL/r/<id> when INVOICE_BASE_URL is missing', async () => {
    process.env.PUBLIC_BASE_URL = 'https://erp.example.uz';
    await listener.handle(basePayload);
    expect(enqueue.mock.calls[0][0].payload.receiptUrl).toBe(
      'https://erp.example.uz/r/pay-1',
    );
  });

  it('stores a missing performer as null', async () => {
    await listener.handle({ ...basePayload, performedById: undefined });
    expect(enqueue.mock.calls[0][0].payload.performedById).toBeNull();
  });

  it('swallows queue errors without throwing', async () => {
    enqueue.mockRejectedValueOnce(new Error('db down'));
    await expect(listener.handle(basePayload)).resolves.toBeUndefined();
  });

  describe('handleReversed', () => {
    const reversedPayload = {
      paymentId: 'pay-1',
      studentId: 10001,
      amount: 5000000,
      studentBalance: 100000,
      reason: 'Summa ortiqcha kiritilgan',
      companyId: 1,
      performedById: 99,
    };

    it('queues the reversal with its reason', async () => {
      await listener.handleReversed(reversedPayload);

      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10001,
        companyId: 1,
        category: TelegramDigestCategory.PAYMENT_REVERSED,
        relatedEntityId: 'pay-1',
        payload: {
          paymentId: 'pay-1',
          amount: 5000000,
          reason: 'Summa ortiqcha kiritilgan',
          performedById: 99,
        },
      });
    });

    it('keeps a null reason as null', async () => {
      await listener.handleReversed({ ...reversedPayload, reason: null });
      expect(enqueue.mock.calls[0][0].payload.reason).toBeNull();
    });

    it('swallows queue errors without throwing', async () => {
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(
        listener.handleReversed(reversedPayload),
      ).resolves.toBeUndefined();
    });
  });
});
