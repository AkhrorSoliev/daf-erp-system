import {
  KPI_FIRST_MONTH,
  KPI_START,
  explainKpi,
  isKpiEligible,
  kpiAmount,
  recordingSince,
  promiseOldEnough,
} from './kpi-rules';

describe('KPI rules (ADR-0095)', () => {
  it('counts from 17.10.2026 00:00 Tashkent', () => {
    expect(KPI_START.toISOString()).toBe('2026-10-16T19:00:00.000Z');
    expect(KPI_FIRST_MONTH).toBe('2026-10');
  });

  it("a fixed rule is its sum; a percent rounds to the so'm", () => {
    expect(kpiAmount({ mode: 'FIXED', value: 50_000 }, 600_000)).toBe(50_000);
    expect(kpiAmount({ mode: 'PERCENT', value: 5 }, 600_000)).toBe(30_000);
    expect(kpiAmount({ mode: 'PERCENT', value: 5 }, 333_333)).toBe(16_667);
    expect(kpiAmount({ mode: 'PERCENT', value: 0 }, 600_000)).toBe(0);
  });

  it('records from KPI_START or from when the switch came back on, never while off', () => {
    expect(recordingSince({ enabled: true, changedAt: null })).toEqual(
      KPI_START,
    );
    expect(
      recordingSince({
        enabled: true,
        changedAt: new Date('2026-10-10T00:00:00Z'),
      }),
    ).toEqual(KPI_START);
    const back = new Date('2026-11-02T06:00:00Z');
    expect(recordingSince({ enabled: true, changedAt: back })).toEqual(back);
    expect(recordingSince({ enabled: false, changedAt: back })).toBeNull();
  });

  it('an administrator who is neither CEO nor Branch Director', () => {
    expect(isKpiEligible(['Administrator'])).toBe(true);
    expect(isKpiEligible(['Administrator', 'Cashier'])).toBe(true);
    expect(isKpiEligible(['Administrator', 'CEO'])).toBe(false);
    expect(isKpiEligible(['Administrator', 'Branch Director'])).toBe(false);
    expect(isKpiEligible(['Cashier'])).toBe(false);
    expect(isKpiEligible([])).toBe(false);
  });

  it('says how a result was counted', () => {
    expect(
      explainKpi({
        type: 'LEAD_PAID',
        ruleMode: 'PERCENT',
        ruleValue: 5,
        baseAmount: 600_000,
      }),
    ).toBe("birinchi to'lov 600 000 × 5%");
    expect(
      explainKpi({
        type: 'PROMISE_KEPT',
        ruleMode: 'PERCENT',
        ruleValue: 5,
        baseAmount: 400_000,
      }),
    ).toBe('qarz 400 000 × 5%');
    expect(
      explainKpi({
        type: 'LEAD_PAID',
        ruleMode: 'FIXED',
        ruleValue: 50_000,
        baseAmount: 600_000,
      }),
    ).toBe("qat'iy summa");
  });
});

describe('promiseOldEnough', () => {
  const paid = new Date('2026-10-20T10:00:00+05:00');
  it('needs an earlier Tashkent day than the payment', () => {
    expect(promiseOldEnough(new Date('2026-10-19T23:59:00+05:00'), paid)).toBe(
      true,
    );
    expect(promiseOldEnough(new Date('2026-10-20T00:00:00+05:00'), paid)).toBe(
      false,
    );
    // 19:30 UTC on the 19th is already the 20th in Tashkent.
    expect(promiseOldEnough(new Date('2026-10-19T19:30:00Z'), paid)).toBe(
      false,
    );
  });
});
