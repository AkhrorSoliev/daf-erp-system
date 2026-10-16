import {
  kpiSignals,
  monthEndForecast,
  workingDaysOfMonth,
  type KpiSignalInput,
} from './kpi-signals';

const base: KpiSignalInput = {
  userId: 11,
  name: 'Nodira R',
  results: 0,
  compareResults: 0,
  held: 0,
  hasRecentResult: false,
  expired: 0,
  compareExpired: 0,
  promiseKept: 0,
  promiseClosed: 0,
  leadsReceived: 0,
  leadsPaid: 0,
};
const u = (patch: Partial<KpiSignalInput>): KpiSignalInput => ({
  ...base,
  ...patch,
});
const past = { isCurrentMonth: false, compareRecorded: true };
const now = { isCurrentMonth: true, compareRecorded: true };

describe('kpiSignals (spec §7.9)', () => {
  it('1. a drop of 30% or more, when one of the months has at least 3 results', () => {
    expect(kpiSignals([u({ results: 7, compareResults: 10 })], past)).toEqual([
      expect.objectContaining({
        kind: 'DROP',
        tone: 'bad',
        userId: 11,
        text: 'Nodira R: natijalar keskin kamaydi — 10 → 7 (-30%)',
      }),
    ]);
  });

  it('1. a rise, from zero too', () => {
    expect(kpiSignals([u({ results: 4, compareResults: 3 })], past)[0]).toEqual(
      expect.objectContaining({
        kind: 'SURGE',
        tone: 'good',
        text: 'Nodira R: natijalar keskin oshdi — 3 → 4 (+33%)',
      }),
    );
    expect(
      kpiSignals([u({ results: 3, compareResults: 0 })], past)[0].text,
    ).toBe('Nodira R: natijalar keskin oshdi — 0 → 3');
  });

  it('1. silent while the compare month was not fully recorded', () => {
    const partial = { isCurrentMonth: true, compareRecorded: false };
    expect(kpiSignals([u({ results: 4, compareResults: 0 })], partial)).toEqual(
      [],
    );
  });

  it('1. quiet under 30%, or under 3 results in both months', () => {
    expect(kpiSignals([u({ results: 8, compareResults: 10 })], past)).toEqual(
      [],
    );
    expect(kpiSignals([u({ results: 1, compareResults: 2 })], past)).toEqual(
      [],
    );
  });

  it('1. the 30% line is tested on exact numbers, not on rounded ones', () => {
    // 27 → 19 is -29.63%: shows as 30%, but is under the line.
    expect(kpiSignals([u({ results: 19, compareResults: 27 })], past)).toEqual(
      [],
    );
    // exactly +30% and exactly -30% fire.
    expect(
      kpiSignals([u({ results: 13, compareResults: 10 })], past)[0].kind,
    ).toBe('SURGE');
    expect(
      kpiSignals([u({ results: 7, compareResults: 10 })], past)[0].kind,
    ).toBe('DROP');
  });

  it('2. silent: 3 held leads and no result in 7 days, current month only', () => {
    const silent = u({ held: 3 });
    expect(kpiSignals([silent], now)).toEqual([
      expect.objectContaining({
        kind: 'SILENT',
        text: "Nodira R: 3 ta band lid bor, oxirgi 7 kunda natija yo'q",
      }),
    ]);
    expect(kpiSignals([silent], past)).toEqual([]);
    expect(kpiSignals([u({ held: 3, hasRecentResult: true })], now)).toEqual(
      [],
    );
    expect(kpiSignals([u({ held: 2 })], now)).toEqual([]);
  });

  it('3. many returned: 3 or more and more than the compare month', () => {
    expect(
      kpiSignals([u({ expired: 3, compareExpired: 1 })], past)[0].text,
    ).toBe(
      "Nodira R: 3 ta lid muddat o'tib qaytdi (taqqoslanayotgan oyda 1 ta)",
    );
    expect(kpiSignals([u({ expired: 3, compareExpired: 3 })], past)).toEqual(
      [],
    );
    expect(kpiSignals([u({ expired: 2 })], past)).toEqual([]);
  });

  it('3. against a compare month not recorded in full: the absolute 3 alone, no compare figure', () => {
    const partial = { isCurrentMonth: true, compareRecorded: false };
    expect(
      kpiSignals([u({ expired: 3, compareExpired: 5 })], partial)[0].text,
    ).toBe("Nodira R: 3 ta lid muddat o'tib qaytdi");
    expect(kpiSignals([u({ expired: 2 })], partial)).toEqual([]);
  });

  it('4. promises under 30% of at least 5 closed', () => {
    expect(
      kpiSignals([u({ promiseKept: 1, promiseClosed: 5 })], past)[0].text,
    ).toBe("Nodira R: va'da bajarilishi 20% (1 / 5)");
    expect(kpiSignals([u({ promiseKept: 1, promiseClosed: 4 })], past)).toEqual(
      [],
    );
    expect(kpiSignals([u({ promiseKept: 2, promiseClosed: 6 })], past)).toEqual(
      [],
    );
  });

  it('4. the 30% line is tested on exact numbers, not on rounded ones', () => {
    // exactly 30% is not under the line.
    expect(
      kpiSignals([u({ promiseKept: 3, promiseClosed: 10 })], past),
    ).toEqual([]);
    // 8 / 27 is 29.63%: under the line, though it shows as 30%.
    expect(
      kpiSignals([u({ promiseKept: 8, promiseClosed: 27 })], past)[0].text,
    ).toBe("Nodira R: va'da bajarilishi 29% (8 / 27)");
  });

  it('5. the best lead → payment share among those with 5 leads, as good news', () => {
    const out = kpiSignals(
      [
        u({ userId: 11, leadsReceived: 5, leadsPaid: 2 }),
        u({ userId: 12, name: 'Farangiz N', leadsReceived: 6, leadsPaid: 3 }),
        u({ userId: 13, name: 'Bobur K', leadsReceived: 4, leadsPaid: 4 }),
      ],
      past,
    );
    expect(out).toEqual([
      expect.objectContaining({
        kind: 'BEST_CONVERSION',
        userId: 12,
        tone: 'good',
        text: "Farangiz N: eng yuqori «Lid → to'lov» — 50% (3 / 6)",
      }),
    ]);
    expect(kpiSignals([u({ leadsReceived: 5, leadsPaid: 0 })], past)).toEqual(
      [],
    );
  });

  it('keeps the 5 heaviest, the bad ones first', () => {
    const users = [
      u({ userId: 1, name: 'A', results: 6, compareResults: 3 }),
      u({ userId: 2, name: 'B', results: 1, compareResults: 6 }),
      u({ userId: 3, name: 'C', held: 4 }),
      u({ userId: 4, name: 'D', expired: 5 }),
      u({ userId: 5, name: 'E', promiseClosed: 6 }),
      u({ userId: 6, name: 'F', leadsReceived: 5, leadsPaid: 5 }),
    ];
    expect(kpiSignals(users, now).map((s) => s.kind)).toEqual([
      'DROP',
      'SILENT',
      'EXPIRED',
      'PROMISE_LOW',
      'SURGE',
    ]);
  });
});

describe('workingDaysOfMonth', () => {
  it('counts Monday to Saturday and leaves company holidays out', () => {
    expect(workingDaysOfMonth('2026-10', () => false)).toHaveLength(27);
    const days = workingDaysOfMonth('2026-10', (d) => d === '2026-10-01');
    expect(days).toHaveLength(26);
    expect(days[0]).toBe('2026-10-02');
    expect(days).not.toContain('2026-10-04');
  });
});

describe('monthEndForecast', () => {
  const days = workingDaysOfMonth('2026-10', () => false);
  const all = '2026-10-01';

  it('waits for the third working day', () => {
    expect(monthEndForecast(4, days, '2026-10-02', all)).toBeNull();
    expect(monthEndForecast(4, days, '2026-10-03', all)).toBe(36);
  });

  it('rounds a half-way value up, with no float drift', () => {
    // 6th working day of 2026-10 is 7.10; 13 × 27 / 6 = 58.5 (13 / 6 × 27 is 58.4999…).
    expect(monthEndForecast(13, days, '2026-10-07', all)).toBe(59);
  });

  it('divides by the working days passed, today included', () => {
    // 12 working days by 14.10 (Sundays 4 and 11 left out): round(10 / 12 × 27).
    expect(monthEndForecast(10, days, '2026-10-14', all)).toBe(23);
  });

  it('counts only the days results were written on', () => {
    // Recording from 17.10: 17, 19, 20 passed by 20.10; 13 such days in the month.
    expect(monthEndForecast(6, days, '2026-10-19', '2026-10-17')).toBeNull();
    expect(monthEndForecast(6, days, '2026-10-20', '2026-10-17')).toBe(26);
  });
});
