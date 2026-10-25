import { PaymentMethod as M, PaymentSource as S } from '@prisma/client';
import {
  computePaymentCosts,
  computePayrollTax,
  officialSplit,
  sumTaxCosts,
  emptyTaxCosts,
  payrollRowsOf,
} from './tax-costs';
import type { TaxRateBook } from './tax-settings.service';
import { TAX_RATE_KEYS } from './tax-rates';

const r = (value: number) => [{ fromMonth: '2026-10', value }];
function book(
  over: Partial<Record<string, number>> = {},
  tiers = true,
): TaxRateBook {
  const rates = Object.fromEntries(
    TAX_RATE_KEYS.map((k) => [k, over[k] === undefined ? [] : r(over[k])]),
  ) as TaxRateBook['rates'];
  return {
    rates,
    bankTiers: tiers
      ? [
          {
            fromMonth: '2026-10',
            tiers: [
              { fromAmount: 0, toAmount: 100_000_000, percent: 0.5 },
              { fromAmount: 100_000_000, toAmount: null, percent: 0.2 },
            ],
          },
        ]
      : [],
  };
}

describe('officialSplit', () => {
  it('2 000 000 rasmiy → 240 000 ushlanma va 240 000 ijtimoiy soliq', () => {
    expect(officialSplit(2_500_000, 2_000_000, 12, 12)).toEqual({
      official: 2_000_000,
      withholding: 240_000,
      employerSocial: 240_000,
    });
  });
  it('rasmiy hisoblangandan katta bo‘lsa hisoblangan olinadi', () => {
    expect(officialSplit(1_000_000, 2_000_000, 12, 12).official).toBe(
      1_000_000,
    );
  });
  it('stavka yo‘q — 0', () => {
    expect(officialSplit(1_000_000, 1_000_000, null, null)).toEqual({
      official: 1_000_000,
      withholding: 0,
      employerSocial: 0,
    });
  });
});

describe('computePayrollTax', () => {
  it('sums employer social tax only for users with an official salary', () => {
    const out = computePayrollTax({
      rows: [
        { userId: 1, earned: 2_000_000 },
        { userId: 2, earned: 3_000_000 },
      ],
      officialByUser: new Map([[1, 2_000_000]]),
      month: '2026-10',
      book: book({
        'payroll.employerSocialPercent': 12,
        'payroll.employeeWithholdingPercent': 12,
      }),
    });
    expect(out).toEqual({
      employerSocialTax: 240_000,
      withholding: 240_000,
      missing: [],
    });
  });
  it('lists a missing rate only when someone has an official salary', () => {
    const none = computePayrollTax({
      rows: [{ userId: 1, earned: 10 }],
      officialByUser: new Map(),
      month: '2026-10',
      book: book(),
    });
    expect(none.missing).toEqual([]);
    const some = computePayrollTax({
      rows: [{ userId: 1, earned: 10 }],
      officialByUser: new Map([[1, 10]]),
      month: '2026-10',
      book: book(),
    });
    expect(some.missing).toEqual([
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

  it('fees per channel, turnover tax and bank fee', () => {
    const out = computePaymentCosts({
      groups,
      companyTurnover: 21_000_000,
      month: '2026-10',
      book: book({
        'fees.integration': 2.5,
        'fees.app.payme': 2,
        'fees.qr': 1,
        'tax.turnoverPercent': 4,
      }),
    });
    // integration 250 000 + app 80 000 + qr 20 000 + stored 25 000
    expect(out.providerFees).toBe(375_000);
    expect(out.turnover).toBe(21_000_000);
    expect(out.turnoverTax).toBe(840_000);
    expect(out.bankFees).toBe(105_000); // 0.5% of company turnover, all in scope
    expect(out.missing).toEqual([]);
  });

  it('lists only used channels without a rate', () => {
    const out = computePaymentCosts({
      groups: groups.slice(2, 3),
      companyTurnover: 2_000_000,
      month: '2026-10',
      book: book({}, false),
    });
    expect(out.missing).toEqual([
      'fees.qr',
      'tax.turnoverPercent',
      'bank.turnoverTiers',
    ]);
    expect(out.providerFees).toBe(0);
  });

  it('splits the bank fee by the scope’s turnover share', () => {
    const out = computePaymentCosts({
      groups: [
        {
          branchId: 2,
          method: M.TRANSFER,
          source: S.ADMIN_MANUAL,
          amount: 5_000_000,
          storedFee: null,
        },
      ],
      companyTurnover: 20_000_000,
      month: '2026-10',
      book: book(),
    });
    expect(out.bankFees).toBe(25_000); // 0.5% × 20 mln × 5/20
  });
});

describe('payrollRowsOf / sumTaxCosts', () => {
  it('reads teacher and staff rows', () => {
    const rows = payrollRowsOf(
      {
        data: [{ user: { id: 1 }, fullDeserved: 900, covered: 500 }],
        staff: [{ user: { id: 2 }, monthly: 300 }],
      },
      '2026-10',
    );
    expect(rows).toEqual([
      { userId: 1, earned: 900 },
      { userId: 2, earned: 300 },
    ]);
  });
  it('adds costs and merges missing keys', () => {
    const a = {
      ...emptyTaxCosts(),
      providerFees: 1,
      total: 1,
      missingRates: ['fees.qr' as const],
    };
    const b = {
      ...emptyTaxCosts(),
      bankFees: 2,
      total: 2,
      missingRates: ['fees.qr' as const, 'bank.turnoverTiers' as const],
    };
    expect(sumTaxCosts([a, b])).toEqual({
      ...emptyTaxCosts(),
      providerFees: 1,
      bankFees: 2,
      total: 3,
      missingRates: ['fees.qr', 'bank.turnoverTiers'],
    });
  });
});
