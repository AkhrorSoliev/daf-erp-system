/**
 * Where the money of a paid mock registration sits — and therefore who may
 * change or undo the payment.
 *
 * - `GATEWAY` — a Payme/Click payment completed against the publicId. The
 *   gateway holds the money; only the gateway can give it back (its cancel
 *   un-marks the participant itself), so the admin panel must not touch it.
 * - `BALANCE` — the pre-2026-08 deduction from a student's lesson balance
 *   (`MOCK_EXAM_FEE`). Removing the participant returns it to the balance;
 *   un-marking it by hand would keep the money and drop the registration.
 * - `MANUAL` — an admin accepted it at the desk (`markPaid`). The admin can
 *   fix its method and note, or cancel it.
 *
 * Decided from the money records, not from `paidById`: a hand-accepted
 * payment made before that column existed has no `paidById` whenever its
 * history row is missing, and it must still be correctable.
 */
export type MockPaymentSource = 'MANUAL' | 'GATEWAY' | 'BALANCE';

export function mockPaymentSource(
  paid: boolean,
  viaGateway: boolean,
  fromBalance: boolean,
): MockPaymentSource | null {
  if (!paid) return null;
  if (viaGateway) return 'GATEWAY';
  if (fromBalance) return 'BALANCE';
  return 'MANUAL';
}
