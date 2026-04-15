/**
 * Tax math for salary and refund calculations.
 *
 * Rates are stored as percentages in CompanyTaxConfig (e.g. 12.0 for Uzbekistan
 * ASOT). The helper accepts any non-negative rate; callers are responsible for
 * clamping it to a sensible range before calling.
 */
export function calculateTax(
  grossAmount: number,
  taxRate: number,
): { taxAmount: number; netAmount: number } {
  if (grossAmount <= 0 || taxRate <= 0) {
    return { taxAmount: 0, netAmount: grossAmount };
  }
  const taxAmount = Math.round((grossAmount * taxRate) / 100);
  const netAmount = grossAmount - taxAmount;
  return { taxAmount, netAmount };
}

export const DEFAULT_SALARY_TAX_RATE = 12.0;
export const DEFAULT_REFUND_TAX_RATE = 0.0;
