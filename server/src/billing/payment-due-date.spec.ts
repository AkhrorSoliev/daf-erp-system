import { paymentDueDate } from './payment-due-date';

describe('paymentDueDate', () => {
  it('is the 2nd lesson of the month', () => {
    expect(paymentDueDate(['2026-10-02', '2026-10-05', '2026-10-07'])).toBe(
      '2026-10-05',
    );
  });

  it('sorts first — the stored order is not trusted', () => {
    expect(paymentDueDate(['2026-10-07', '2026-10-02', '2026-10-05'])).toBe(
      '2026-10-05',
    );
  });

  it('is null with fewer than two lessons — there is no 2nd lesson to name', () => {
    expect(paymentDueDate(['2026-10-30'])).toBeNull();
    expect(paymentDueDate([])).toBeNull();
  });
});
