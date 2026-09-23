import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethod,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestQueueService } from './telegram-digest-queue.service';

describe('TelegramDigestQueueService', () => {
  let service: TelegramDigestQueueService;
  let create: jest.Mock;

  beforeEach(async () => {
    create = jest.fn().mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestQueueService,
        {
          provide: PrismaService,
          useValue: { telegramDigestItem: { create } },
        },
      ],
    }).compile();
    service = module.get(TelegramDigestQueueService);
  });

  const receipt = {
    paymentId: 'pay-1',
    amount: 100000,
    method: PaymentMethod.CASH,
    receiptUrl: 'https://invoice.dafzentrum.uz/pay-1',
    performedById: 99,
  };

  it('writes one row with every field it was given', async () => {
    await service.enqueue({
      recipientKind: TelegramDigestRecipientKind.STUDENT,
      recipientId: 10042,
      companyId: 1001,
      branchId: 7,
      category: TelegramDigestCategory.PAYMENT_RECEIVED,
      relatedEntityId: 'pay-1',
      payload: receipt,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10042,
        companyId: 1001,
        branchId: 7,
        category: TelegramDigestCategory.PAYMENT_RECEIVED,
        relatedEntityId: 'pay-1',
        payload: receipt,
      },
    });
  });

  it('stores branchId and relatedEntityId as null when omitted', async () => {
    await service.enqueue({
      recipientKind: TelegramDigestRecipientKind.USER,
      recipientId: 10001,
      companyId: 1001,
      category: TelegramDigestCategory.SALARY_CARRIED_OVER,
      payload: { count: 2, total: 40000 },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ branchId: null, relatedEntityId: null }),
    });
  });

  it('propagates a database error to the caller', async () => {
    create.mockRejectedValue(new Error('db down'));

    await expect(
      service.enqueue({
        recipientKind: TelegramDigestRecipientKind.USER,
        recipientId: 10001,
        companyId: 1001,
        category: TelegramDigestCategory.SALARY_CARRIED_OVER,
        payload: { count: 1, total: 10000 },
      }),
    ).rejects.toThrow('db down');
  });
});
