import { monthWord, partViews, periodShape } from './part-labels';

describe('periodShape', () => {
  it('whole month', () =>
    expect(periodShape('2026-10-01', '2026-10-31')).toEqual({
      startMonth: '2026-10',
      endMonth: '2026-10',
      singleMonth: true,
      endsOnMonthEnd: true,
    }));
  it('a week across two months', () =>
    expect(periodShape('2026-09-28', '2026-10-04')).toMatchObject({
      singleMonth: false,
      endsOnMonthEnd: false,
    }));
  it('a single day inside a month', () =>
    expect(periodShape('2026-10-11', '2026-10-11')).toMatchObject({
      singleMonth: true,
      endsOnMonthEnd: false,
    }));
});

describe('monthWord', () => {
  it('drops the current year', () =>
    expect(monthWord('2026-08', '2026')).toBe('Avgust'));
  it('keeps another year', () =>
    expect(monthWord('2025-12', '2026')).toBe('Dekabr 2025'));
});

describe('partViews', () => {
  const parts = {
    currentMonth: 385_714,
    advance: 100_000,
    late: [
      { monthKey: '2026-09', amount: 150_000 },
      { monthKey: '2026-08', amount: 20_000 },
    ],
  };
  it('whole month: old debts newest first, then this month, then next month ahead', () => {
    expect(
      partViews(parts, periodShape('2026-10-01', '2026-10-31'), '2026'),
    ).toEqual([
      {
        kind: 'LATE',
        monthKey: '2026-09',
        label: 'Sentabr qarzi',
        amount: 150_000,
      },
      {
        kind: 'LATE',
        monthKey: '2026-08',
        label: 'Avgust qarzi',
        amount: 20_000,
      },
      {
        kind: 'CURRENT',
        monthKey: '2026-10',
        label: "Oktabr to'lovi",
        amount: 385_714,
      },
      {
        kind: 'ADVANCE',
        monthKey: '2026-11',
        label: 'Noyabr uchun oldindan',
        amount: 100_000,
      },
    ]);
  });
  it('a week across months and not on a month end', () => {
    const v = partViews(parts, periodShape('2026-09-28', '2026-10-04'), '2026');
    expect(v.find((p) => p.kind === 'CURRENT')).toEqual({
      kind: 'CURRENT',
      monthKey: null,
      label: "Shu davr to'lovi",
      amount: 385_714,
    });
    expect(v.find((p) => p.kind === 'ADVANCE')).toEqual({
      kind: 'ADVANCE',
      monthKey: null,
      label: 'Oldindan (balansda)',
      amount: 100_000,
    });
  });
  it('an «Oraliq» of two whole months', () => {
    const v = partViews(parts, periodShape('2026-09-01', '2026-10-31'), '2026');
    expect(v.find((p) => p.kind === 'CURRENT')?.label).toBe("Shu davr to'lovi");
    expect(v.find((p) => p.kind === 'ADVANCE')?.label).toBe(
      'Noyabr uchun oldindan',
    );
  });
  it('leaves out zero parts', () => {
    expect(
      partViews(
        { currentMonth: 0, advance: 0, late: [] },
        periodShape('2026-10-01', '2026-10-31'),
        '2026',
      ),
    ).toEqual([]);
  });
});
