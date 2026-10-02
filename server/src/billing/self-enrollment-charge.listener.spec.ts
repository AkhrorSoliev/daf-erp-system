import { Logger } from '@nestjs/common';
import { SelfEnrollmentChargeListener } from './self-enrollment-charge.listener';

describe('SelfEnrollmentChargeListener', () => {
  const event = { enrollmentId: 'enr-1', companyId: 1001 };
  const tx = { tag: 'tx' };
  let prisma: { $transaction: jest.Mock };
  let charges: { chargeJoinMonth: jest.Mock };
  let listener: SelfEnrollmentChargeListener;

  beforeEach(() => {
    prisma = { $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) };
    charges = {
      chargeJoinMonth: jest.fn().mockResolvedValue({ id: 'charge-1' }),
    };
    listener = new SelfEnrollmentChargeListener(
      prisma as never,
      charges as never,
    );
  });

  it('charges the join month in its own Serializable transaction', async () => {
    await listener.onSelfEnrolled(event);

    expect(charges.chargeJoinMonth).toHaveBeenCalledWith(tx, event);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });

  it('logs a failed charge instead of failing the registration that already happened', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    charges.chargeJoinMonth.mockRejectedValue(new Error('serialization'));

    await expect(listener.onSelfEnrolled(event)).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('enr-1'),
      expect.any(Error),
    );
    logged.mockRestore();
  });
});
