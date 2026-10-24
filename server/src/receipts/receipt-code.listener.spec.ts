import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { PaymentReceivedPayload } from '../payments/payments-write.service';
import { allocatePaymentReceiptCode } from './receipt-code';
import { ReceiptCodeListener } from './receipt-code.listener';

jest.mock('./receipt-code');

const payload = { paymentId: 'p1' } as PaymentReceivedPayload;
const prisma = {} as PrismaService;

describe('ReceiptCodeListener', () => {
  afterEach(() => jest.restoreAllMocks());

  it('allocates the code of the received payment', async () => {
    (allocatePaymentReceiptCode as jest.Mock).mockResolvedValue('R-2026-00001');
    await new ReceiptCodeListener(prisma).assign(payload);
    expect(allocatePaymentReceiptCode).toHaveBeenCalledWith(prisma, 'p1');
  });

  it('logs and swallows a failure', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    (allocatePaymentReceiptCode as jest.Mock).mockRejectedValue(
      new Error('boom'),
    );
    await expect(
      new ReceiptCodeListener(prisma).assign(payload),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('p1'));
  });
});
