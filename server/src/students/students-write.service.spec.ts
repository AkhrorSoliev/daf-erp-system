import { computeDiscountAdjustment } from './students-write.service';

// F-01 regression: changing a student's discount writes a single signed
// DISCOUNT_ADJUSTMENT for the delta. LESSON_DEDUCTION rows store `amount`
// NEGATIVE, so the previous code summed negatives and compared against the
// positive targetCharge — inverting the sign (and inflating the magnitude),
// debiting students on a discount increase instead of crediting them.
describe('computeDiscountAdjustment (F-01)', () => {
  it('credits the student (positive) when the discount increases 0% → 50%', () => {
    // Fully charged 100,000 at full price (metadata.fullAmount = 100,000).
    const deductions = [{ amount: -100000, metadata: { fullAmount: 100000 } }];
    const r = computeDiscountAdjustment(deductions, 50);
    expect(r.netCharged).toBe(100000);
    expect(r.targetCharge).toBe(50000);
    // +50,000 credit — NOT the old -150,000 debit.
    expect(r.adjustmentAmount).toBe(50000);
  });

  it('debits the student (negative) when the discount decreases 50% → 0%', () => {
    // Charged 50,000 under a 50% discount; full price 100,000.
    const deductions = [{ amount: -50000, metadata: { fullAmount: 100000 } }];
    const r = computeDiscountAdjustment(deductions, 0);
    expect(r.netCharged).toBe(50000);
    expect(r.targetCharge).toBe(100000);
    expect(r.adjustmentAmount).toBe(-50000);
  });

  it('is zero when the effective charge does not change', () => {
    const deductions = [{ amount: -100000, metadata: { fullAmount: 100000 } }];
    const r = computeDiscountAdjustment(deductions, 0);
    expect(r.adjustmentAmount).toBe(0);
  });

  it('sums across rows; legacy rows (no fullAmount) use |amount| as full price', () => {
    const deductions = [
      { amount: -100000, metadata: { fullAmount: 100000 } }, // discount-aware
      { amount: -200000, metadata: null }, // legacy: full price = |amount|
    ];
    const r = computeDiscountAdjustment(deductions, 50);
    expect(r.netCharged).toBe(300000);
    expect(r.totalFullAmount).toBe(300000); // 100k + 200k, not 100k - 200k
    expect(r.targetCharge).toBe(150000);
    expect(r.adjustmentAmount).toBe(150000);
  });

  it('returns 0/0 for a student with no deductions', () => {
    const r = computeDiscountAdjustment([], 30);
    expect(r.netCharged).toBe(0);
    expect(r.adjustmentAmount).toBe(0);
  });
});
