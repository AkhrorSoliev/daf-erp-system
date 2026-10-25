import { BadRequestException } from '@nestjs/common';

/**
 * Soliq va komissiya stavkalari (spec 2026-10-25). Har kalit — oydan kuchga
 * kiradigan qatorlar ro'yxati; bo'sh ro'yxat = «kiritilmagan». Stavka kodga
 * yozilmaydi: CEO yoki buxgalter sozlama sahifasida kiritadi.
 */
export const TAX_RATE_KEYS = [
  'fees.app.payme',
  'fees.app.click',
  'fees.app.uzum',
  'fees.integration',
  'fees.qr',
  'payroll.employeeWithholdingPercent',
  'payroll.employerSocialPercent',
  'tax.turnoverPercent',
] as const;
export type TaxRateKey = (typeof TAX_RATE_KEYS)[number];

export const BANK_TIERS_KEY = 'bank.turnoverTiers' as const;
export type TaxSettingKey = TaxRateKey | typeof BANK_TIERS_KEY;
export const TAX_SETTING_KEYS: readonly TaxSettingKey[] = [
  ...TAX_RATE_KEYS,
  BANK_TIERS_KEY,
];

export type DatedRate = { fromMonth: string; value: number };
export type BankTier = {
  fromAmount: number;
  toAmount: number | null;
  percent: number;
};
export type DatedTiers = { fromMonth: string; tiers: BankTier[] };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function fail(key: string, why: string, raw: unknown): never {
  throw new BadRequestException(
    `${key}: ${why}, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}

function isPercent(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= 0 &&
    v <= 100 &&
    Math.round(v * 100) === v * 100
  );
}

function isWholeSom(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function parseMonths<T extends { fromMonth: string }>(
  key: string,
  raw: unknown,
  row: (r: Record<string, unknown>) => T,
): T[] {
  if (!Array.isArray(raw)) fail(key, "ro'yxat bo'lishi kerak", raw);
  const rows = raw.map((r) => {
    if (typeof r !== 'object' || r === null)
      fail(key, "qator obyekt bo'lishi kerak", r);
    const rec = r as Record<string, unknown>;
    if (typeof rec.fromMonth !== 'string' || !MONTH_RE.test(rec.fromMonth)) {
      fail(key, "oy YYYY-MM ko'rinishida bo'lishi kerak", r);
    }
    return row(rec);
  });
  rows.sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].fromMonth === rows[i - 1].fromMonth)
      fail(key, 'bir oy ikki marta berilgan', raw);
  }
  return rows;
}

export function parseDatedRates(key: string, raw: unknown): DatedRate[] {
  return parseMonths(key, raw, (r) => {
    if (!isPercent(r.value))
      fail(key, "foiz 0 dan 100 gacha, ko'pi bilan 2 kasr bo'lishi kerak", r);
    return { fromMonth: r.fromMonth as string, value: r.value };
  });
}

function parseTiers(key: string, raw: unknown): BankTier[] {
  if (!Array.isArray(raw) || raw.length === 0)
    fail(key, "kamida bitta oraliq bo'lishi kerak", raw);
  const tiers = raw.map((t) => {
    const r = (t ?? {}) as Record<string, unknown>;
    const toAmount = r.toAmount === null ? null : r.toAmount;
    if (
      !isWholeSom(r.fromAmount) ||
      (toAmount !== null && !isWholeSom(toAmount)) ||
      !isPercent(r.percent)
    ) {
      fail(key, "oraliq noto'g'ri", t);
    }
    return {
      fromAmount: r.fromAmount,
      toAmount: toAmount,
      percent: r.percent,
    };
  });
  if (tiers[0].fromAmount !== 0)
    fail(key, '1-oraliq 0 dan boshlanishi kerak', raw);
  if (tiers[tiers.length - 1].toAmount !== null)
    fail(key, "oxirgi oraliqning yuqori chegarasi bo'sh bo'lishi kerak", raw);
  for (let i = 0; i < tiers.length - 1; i++) {
    const t = tiers[i];
    if (t.toAmount === null || t.toAmount <= t.fromAmount)
      fail(key, "oraliq chegarasi noto'g'ri", raw);
    if (tiers[i + 1].fromAmount !== t.toAmount)
      fail(key, "oraliqlar orasida bo'shliq yoki kesishma bor", raw);
  }
  return tiers;
}

export function parseDatedTiers(key: string, raw: unknown): DatedTiers[] {
  return parseMonths(key, raw, (r) => ({
    fromMonth: r.fromMonth as string,
    tiers: parseTiers(key, r.tiers),
  }));
}

function inForce<T extends { fromMonth: string }>(
  list: T[],
  month: string,
): T | null {
  let hit: T | null = null;
  for (const row of list) if (row.fromMonth <= month) hit = row;
  return hit;
}

export function rateForMonth(list: DatedRate[], month: string): number | null {
  return inForce(list, month)?.value ?? null;
}

export function tiersForMonth(
  list: DatedTiers[],
  month: string,
): BankTier[] | null {
  return inForce(list, month)?.tiers ?? null;
}

export function tierPercentFor(tiers: BankTier[], amount: number): number {
  const hit = tiers.find(
    (t) =>
      amount >= t.fromAmount && (t.toAmount === null || amount < t.toAmount),
  );
  return (hit ?? tiers[tiers.length - 1]).percent;
}
