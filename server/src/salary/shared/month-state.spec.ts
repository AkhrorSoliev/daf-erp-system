import { SalaryPaymentStatus as S } from '@prisma/client';
import { monthStateOf } from './month-state';

describe('monthStateOf', () => {
  it('is OPEN for the current month whatever the payments', () => {
    expect(monthStateOf(true, [])).toEqual({
      kind: 'OPEN',
      paidCount: 0,
      payableCount: 0,
    });
  });

  it('is NOT_CALCULATED for a past month with no payment', () => {
    expect(monthStateOf(false, []).kind).toBe('NOT_CALCULATED');
  });

  it('is CALCULATED while any row waits for approval and none is paid', () => {
    expect(monthStateOf(false, [S.CALCULATED, S.APPROVED]).kind).toBe(
      'CALCULATED',
    );
  });

  it('is APPROVED when every unpaid row is approved and none is paid', () => {
    expect(monthStateOf(false, [S.APPROVED, S.APPROVED]).kind).toBe('APPROVED');
  });

  it('is PARTLY_PAID with counts', () => {
    expect(monthStateOf(false, [S.PAID, S.CALCULATED, S.APPROVED])).toEqual({
      kind: 'PARTLY_PAID',
      paidCount: 1,
      payableCount: 3,
    });
  });

  it('is PAID when every row is paid', () => {
    expect(monthStateOf(false, [S.PAID, S.PAID])).toEqual({
      kind: 'PAID',
      paidCount: 2,
      payableCount: 2,
    });
  });
});
