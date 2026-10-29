import { PaymentMethod, PaymentSource } from '@prisma/client';
import { channelRateKey, feeChannelOf } from './fee-channel';
import { DatedRate, rateForMonth, TaxRateKey } from './tax-rates';

/** O'tgan oyda bank hisobiga bank xarajati kiritilmagan (spec 2026-10-28 §5). */
export const BANK_FEES_ENTERED_KEY = 'bank.feesEntered' as const;
export type TaxMissingKey = TaxRateKey | typeof BANK_FEES_ENTERED_KEY;

/**
 * Sof foydadan ayriladigan soliq va komissiyalar (spec 2026-10-25, 2026-10-28).
 * `withholding` va `bankPaidSalary` faqat ma'lumot. Bank xizmati bu yerda yo'q:
 * u oddiy xarajat (`BANK_FEES`), `operatingExpenses` ichida.
 */
export interface TaxCosts {
  providerFees: number;
  employerSocialTax: number;
  turnoverTax: number;
  withholding: number;
  bankPaidSalary: number;
  turnover: number;
  total: number;
  missingRates: TaxMissingKey[];
}

export function emptyTaxCosts(): TaxCosts {
  return {
    providerFees: 0,
    employerSocialTax: 0,
    turnoverTax: 0,
    withholding: 0,
    bankPaidSalary: 0,
    turnover: 0,
    total: 0,
    missingRates: [],
  };
}

export function sumTaxCosts(list: TaxCosts[]): TaxCosts {
  const out = emptyTaxCosts();
  const missing = new Set<TaxMissingKey>();
  for (const t of list) {
    out.providerFees += t.providerFees;
    out.employerSocialTax += t.employerSocialTax;
    out.turnoverTax += t.turnoverTax;
    out.withholding += t.withholding;
    out.bankPaidSalary += t.bankPaidSalary;
    out.turnover += t.turnover;
    out.total += t.total;
    t.missingRates.forEach((k) => missing.add(k));
  }
  out.missingRates = [...missing];
  return out;
}

const pct = (amount: number, percent: number) =>
  Math.round((amount * percent) / 100);

export type PaymentGroup = {
  branchId: number | null;
  method: PaymentMethod;
  source: PaymentSource;
  amount: number;
  storedFee: number | null;
};

export function computePaymentCosts(input: {
  groups: PaymentGroup[];
  month: string;
  rates: Record<TaxRateKey, DatedRate[]>;
}) {
  const { groups, month, rates } = input;
  const missing = new Set<TaxRateKey>();
  let providerFees = 0;
  let turnover = 0;
  for (const g of groups) {
    if (g.method !== PaymentMethod.CASH) turnover += g.amount;
    if (g.storedFee !== null) {
      providerFees += g.storedFee;
      continue;
    }
    const channel = feeChannelOf(g.method, g.source);
    if (!channel || g.amount === 0) continue;
    const key = channelRateKey(channel);
    const rate = rateForMonth(rates[key], month);
    if (rate === null) missing.add(key);
    else providerFees += pct(g.amount, rate);
  }
  let turnoverTax = 0;
  if (turnover > 0) {
    const taxRate = rateForMonth(rates['tax.turnoverPercent'], month);
    if (taxRate === null) missing.add('tax.turnoverPercent');
    else turnoverTax = pct(turnover, taxRate);
  }
  return { providerFees, turnoverTax, turnover, missing: [...missing] };
}

/** Bankdan berilgan oylikdan: korxona solig'i (xarajat) va ushlanma (ma'lumot). */
export function computePayrollTax(input: {
  bankPaidSalary: number;
  month: string;
  rates: Record<TaxRateKey, DatedRate[]>;
}) {
  const { bankPaidSalary, month, rates } = input;
  if (bankPaidSalary <= 0)
    return {
      employerSocialTax: 0,
      withholding: 0,
      missing: [] as TaxRateKey[],
    };
  const w = rateForMonth(rates['payroll.employeeWithholdingPercent'], month);
  const s = rateForMonth(rates['payroll.employerSocialPercent'], month);
  const missing: TaxRateKey[] = [];
  if (w === null) missing.push('payroll.employeeWithholdingPercent');
  if (s === null) missing.push('payroll.employerSocialPercent');
  return {
    employerSocialTax: s === null ? 0 : pct(bankPaidSalary, s),
    withholding: w === null ? 0 : pct(bankPaidSalary, w),
    missing,
  };
}
