import { PaymentMethod as M, PaymentSource as S } from '@prisma/client';
import {
  computePaymentCosts,
  computePayrollTax,
  sumTaxCosts,
  emptyTaxCosts,
} from './tax-costs';
import { DatedRate, TAX_RATE_KEYS, TaxRateKey } from './tax-rates';

const rates = (over: Partial<Record<TaxRateKey, DatedRate[]>> = {}) =>
  ({
    ...Object.fromEntries(TAX_RATE_KEYS.map((k) => [k, []])),
    ...over,
  }) as Record<TaxRateKey, DatedRate[]>;
const r = (value: number): DatedRate[] => [{ fromMonth: '2026-10', value }];

describe('computePayrollTax', () => {
  it('12% + 12% of the bank-paid salary', () => {
    const out = computePayrollTax({
      bankPaidSalary: 2_000_000,
      month: '2026-10',
      rates: rates({
        'payroll.employeeWithholdingPercent': [
          { fromMonth: '2026-10', value: 12 },
        ],
        'payroll.employerSocialPercent': [{ fromMonth: '2026-10', value: 12 }],
      }),
    });
    expect(out).toEqual({
      employerSocialTax: 240_000,
      withholding: 240_000,
      missing: [],
    });
  });
  it('no bank-paid salary: nothing, and no missing rate', () => {
    expect(
      computePayrollTax({
        bankPaidSalary: 0,
        month: '2026-10',
        rates: rates(),
      }),
    ).toEqual({ employerSocialTax: 0, withholding: 0, missing: [] });
  });
  it('bank-paid salary without rates: 0 and both keys missing', () => {
    expect(
      computePayrollTax({
        bankPaidSalary: 1_000,
        month: '2026-10',
        rates: rates(),
      }).missing,
    ).toEqual([
      'payroll.employeeWithholdingPercent',
      'payroll.employerSocialPercent',
    ]);
  });
});

describe('computePaymentCosts', () => {
  const groups = [
    {
      branchId: 1,
      method: M.PAYME,
      source: S.GATEWAY_WEBHOOK,
      amount: 10_000_000,
      storedFee: null,
    },
    {
      branchId: 1,
      method: M.PAYME,
      source: S.ADMIN_MANUAL,
      amount: 4_000_000,
      storedFee: null,
    },
    {
      branchId: 1,
      method: M.QR,
      source: S.ADMIN_MANUAL,
      amount: 2_000_000,
      storedFee: null,
    },
    {
      branchId: 1,
      method: M.TRANSFER,
      source: S.ADMIN_MANUAL,
      amount: 4_000_000,
      storedFee: null,
    },
    {
      branchId: 1,
      method: M.CLICK,
      source: S.MANUAL_ATTACH,
      amount: 1_000_000,
      storedFee: 25_000,
    },
  ];

  it('fees per channel and turnover tax', () => {
    const out = computePaymentCosts({
      groups,
      month: '2026-10',
      rates: rates({
        'fees.integration': r(2.5),
        'fees.app.payme': r(2),
        'fees.qr': r(1),
        'tax.turnoverPercent': r(4),
      }),
    });
    // integration 250 000 + app 80 000 + qr 20 000 + stored 25 000
    expect(out.providerFees).toBe(375_000);
    expect(out.turnover).toBe(21_000_000);
    expect(out.turnoverTax).toBe(840_000);
    expect(out.missing).toEqual([]);
    expect(out).not.toHaveProperty('bankFees');
  });

  it('sums a stored providerFee as stored, even on a CASH or TRANSFER group', () => {
    // Documents current behaviour: the stored fee wins over the channel map.
    const out = computePaymentCosts({
      groups: [
        {
          branchId: 1,
          method: M.CASH,
          source: S.ADMIN_MANUAL,
          amount: 1_000_000,
          storedFee: 7_000,
        },
        {
          branchId: 1,
          method: M.TRANSFER,
          source: S.ADMIN_MANUAL,
          amount: 2_000_000,
          storedFee: 11_000,
        },
      ],
      month: '2026-10',
      rates: rates(),
    });
    expect(out.providerFees).toBe(18_000);
    expect(out.missing).not.toContain('fees.integration');
  });

  it('lists only used channels without a rate', () => {
    const out = computePaymentCosts({
      groups: groups.slice(2, 3),
      month: '2026-10',
      rates: rates(),
    });
    expect(out.missing).toEqual(['fees.qr', 'tax.turnoverPercent']);
    expect(out.providerFees).toBe(0);
  });
});

describe('sumTaxCosts', () => {
  it('adds costs and merges missing keys', () => {
    const a = {
      ...emptyTaxCosts(),
      providerFees: 1,
      bankPaidSalary: 10,
      total: 1,
      missingRates: ['fees.qr' as const],
    };
    const b = {
      ...emptyTaxCosts(),
      employerSocialTax: 2,
      bankPaidSalary: 20,
      total: 2,
      missingRates: ['fees.qr' as const, 'bank.feesEntered' as const],
    };
    expect(sumTaxCosts([a, b])).toEqual({
      ...emptyTaxCosts(),
      providerFees: 1,
      employerSocialTax: 2,
      bankPaidSalary: 30,
      total: 3,
      missingRates: ['fees.qr', 'bank.feesEntered'],
    });
  });
});
