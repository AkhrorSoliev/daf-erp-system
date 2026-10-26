import { PaymentMethod, PaymentSource } from '@prisma/client';
import { isTopUpMonth } from '../salary/shared/topup';
import { channelRateKey, feeChannelOf } from './fee-channel';
import {
  BANK_TIERS_KEY,
  rateForMonth,
  TaxSettingKey,
  tierPercentFor,
  tiersForMonth,
} from './tax-rates';
import type { TaxRateBook } from './tax-settings.service';

/** Sof foydadan ayriladigan soliq va komissiyalar (spec 2026-10-25). `withholding` faqat ma'lumot. */
export interface TaxCosts {
  providerFees: number;
  employerSocialTax: number;
  turnoverTax: number;
  bankFees: number;
  withholding: number;
  turnover: number;
  total: number;
  missingRates: TaxSettingKey[];
}

export function emptyTaxCosts(): TaxCosts {
  return {
    providerFees: 0,
    employerSocialTax: 0,
    turnoverTax: 0,
    bankFees: 0,
    withholding: 0,
    turnover: 0,
    total: 0,
    missingRates: [],
  };
}

export function sumTaxCosts(list: TaxCosts[]): TaxCosts {
  const out = emptyTaxCosts();
  const missing = new Set<TaxSettingKey>();
  for (const t of list) {
    out.providerFees += t.providerFees;
    out.employerSocialTax += t.employerSocialTax;
    out.turnoverTax += t.turnoverTax;
    out.bankFees += t.bankFees;
    out.withholding += t.withholding;
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
  companyTurnover: number;
  month: string;
  book: TaxRateBook;
}) {
  const { groups, companyTurnover, month, book } = input;
  const missing = new Set<TaxSettingKey>();
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
    const rate = rateForMonth(book.rates[key], month);
    if (rate === null) missing.add(key);
    else providerFees += pct(g.amount, rate);
  }

  let turnoverTax = 0;
  let bankFees = 0;
  if (turnover > 0) {
    const taxRate = rateForMonth(book.rates['tax.turnoverPercent'], month);
    if (taxRate === null) missing.add('tax.turnoverPercent');
    else turnoverTax = pct(turnover, taxRate);

    const tiers = tiersForMonth(book.bankTiers, month);
    if (tiers === null) missing.add(BANK_TIERS_KEY);
    else if (companyTurnover > 0) {
      // ponytail: bitta yaxlitlash ulush bo'yicha; filiallar yig'indisi kompaniyadan 1 so'm farq qilishi mumkin.
      const companyFee =
        (companyTurnover * tierPercentFor(tiers, companyTurnover)) / 100;
      bankFees = Math.round((companyFee * turnover) / companyTurnover);
    }
  }
  return {
    providerFees,
    turnoverTax,
    bankFees,
    turnover,
    missing: [...missing],
  };
}

export type PayrollRow = { userId: number; earned: number };

export function officialSplit(
  earned: number,
  officialSalary: number,
  withholdingPct: number | null,
  socialPct: number | null,
) {
  const official = Math.max(0, Math.min(officialSalary, earned));
  return {
    official,
    withholding: withholdingPct === null ? 0 : pct(official, withholdingPct),
    employerSocial: socialPct === null ? 0 : pct(official, socialPct),
  };
}

export function computePayrollTax(input: {
  rows: PayrollRow[];
  officialByUser: Map<number, number>;
  month: string;
  book: TaxRateBook;
}) {
  const w = rateForMonth(
    input.book.rates['payroll.employeeWithholdingPercent'],
    input.month,
  );
  const s = rateForMonth(
    input.book.rates['payroll.employerSocialPercent'],
    input.month,
  );
  let employerSocialTax = 0;
  let withholding = 0;
  let anyOfficial = false;
  for (const row of input.rows) {
    const split = officialSplit(
      row.earned,
      input.officialByUser.get(row.userId) ?? 0,
      w,
      s,
    );
    if (split.official > 0) anyOfficial = true;
    employerSocialTax += split.employerSocial;
    withholding += split.withholding;
  }
  const missing: TaxSettingKey[] = [];
  if (anyOfficial && w === null)
    missing.push('payroll.employeeWithholdingPercent');
  if (anyOfficial && s === null) missing.push('payroll.employerSocialPercent');
  return { employerSocialTax, withholding, missing };
}

/** `getSalaryMonthly` natijasidan har xodimning shu oy hisoblangan oyligi (sof foyda bilan bir xil asos). */
export function payrollRowsOf(salaries: any, month: string): PayrollRow[] {
  const topUp = isTopUpMonth(month);
  const teachers: PayrollRow[] = (salaries?.data ?? []).map((t: any) => ({
    userId: t.user.id,
    earned: (topUp ? t.fullDeserved : t.covered) ?? 0,
  }));
  const staff: PayrollRow[] = (salaries?.staff ?? []).map((s: any) => ({
    userId: s.user.id,
    earned: s.monthly ?? 0,
  }));
  return [...teachers, ...staff];
}
