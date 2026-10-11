import { Prisma } from '@prisma/client';
import {
  allocatePaymentReceiptCode,
  allocateRefundReceiptCode,
  nextSequence,
} from './receipt-code';

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'x',
  });
}

describe('receipt-code', () => {
  let tx: any;
  let prisma: any;

  beforeEach(() => {
    tx = {
      payment: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      refund: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  });

  afterEach(() => jest.useRealTimers());

  it('numbers a payment by its Tashkent year, from the global highest', async () => {
    tx.payment.findUnique.mockResolvedValue({
      receiptCode: null,
      createdAt: new Date('2026-12-31T20:00:00Z'),
    });
    tx.payment.findFirst.mockResolvedValue({ receiptCode: 'R-2027-00041' });

    await expect(allocatePaymentReceiptCode(prisma, 'p1')).resolves.toBe(
      'R-2027-00042',
    );
    expect(tx.payment.findFirst).toHaveBeenCalledWith({
      where: { receiptCode: { startsWith: 'R-2027-' } },
      orderBy: { receiptCode: 'desc' },
      select: { receiptCode: true },
    });
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { receiptCode: 'R-2027-00042' },
    });
  });

  it('returns an existing code without writing', async () => {
    tx.payment.findUnique.mockResolvedValue({
      receiptCode: 'R-2026-00007',
      createdAt: new Date(),
    });
    await expect(allocatePaymentReceiptCode(prisma, 'p1')).resolves.toBe(
      'R-2026-00007',
    );
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it('returns null for a missing payment', async () => {
    tx.payment.findUnique.mockResolvedValue(null);
    await expect(allocatePaymentReceiptCode(prisma, 'x')).resolves.toBeNull();
  });

  it('retries a clash and succeeds; rethrows after three', async () => {
    tx.payment.findUnique.mockResolvedValue({
      receiptCode: null,
      createdAt: new Date('2026-05-01T10:00:00Z'),
    });
    tx.payment.findFirst.mockResolvedValue(null);
    tx.payment.update.mockRejectedValueOnce(p2002()).mockResolvedValueOnce({});
    await expect(allocatePaymentReceiptCode(prisma, 'p1')).resolves.toBe(
      'R-2026-00001',
    );

    prisma.$transaction.mockClear();
    tx.payment.update.mockRejectedValue(p2002());
    await expect(
      allocatePaymentReceiptCode(prisma, 'p1'),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('numbers a refund by the Tashkent year of now, globally', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-31T20:00:00Z'));
    tx.refund.findUnique.mockResolvedValue({ receiptCode: null });
    tx.refund.findFirst.mockResolvedValue({ receiptCode: 'Q-2027-00003' });

    await expect(allocateRefundReceiptCode(prisma, 'r1')).resolves.toBe(
      'Q-2027-00004',
    );
    expect(tx.refund.findFirst).toHaveBeenCalledWith({
      where: { receiptCode: { startsWith: 'Q-2027-' } },
      orderBy: { receiptCode: 'desc' },
      select: { receiptCode: true },
    });
  });

  it('nextSequence', () => {
    expect(nextSequence(null, 'R-2026-')).toBe('00001');
    expect(nextSequence('R-2026-00099', 'R-2026-')).toBe('00100');
  });
});
