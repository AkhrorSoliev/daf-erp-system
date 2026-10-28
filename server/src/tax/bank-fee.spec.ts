import { bankFeeDate, bankFeeWindow } from './bank-fee';

describe('bank-fee', () => {
  it('the fee is dated the last day of the month', () => {
    expect(bankFeeDate('2026-10')).toBe('2026-10-31');
    expect(bankFeeDate('2026-02')).toBe('2026-02-28');
    expect(bankFeeDate('2028-02')).toBe('2028-02-29');
  });
  it('the window is the whole month as @db.Date bounds', () => {
    expect(bankFeeWindow('2026-12')).toEqual({
      gte: new Date('2026-12-01T00:00:00.000Z'),
      lt: new Date('2027-01-01T00:00:00.000Z'),
    });
  });
});
