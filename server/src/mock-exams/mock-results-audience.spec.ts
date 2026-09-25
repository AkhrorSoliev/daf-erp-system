import { RESULTS_AUDIENCE } from './mock-results-audience';

/**
 * CEO, 2026-09-25: only those who paid get their results. A registration that
 * owes nothing (a free exam, or a DaF price of 0) counts as paid.
 *
 * The filter is evaluated here by hand, for exactly the shape it has, so each
 * case says what Postgres would answer for that row.
 */
describe('mock results audience', () => {
  type Row = {
    paid: boolean;
    feeAmount: number | null;
    exam: { price: number };
  };
  const row = (over: Partial<Row>): Row => ({
    paid: false,
    feeAmount: 55000,
    exam: { price: 55000 },
    ...over,
  });

  const inAudience = (r: Row): boolean => {
    const matches = (where: Record<string, unknown>): boolean =>
      Object.entries(where).every(([key, value]) => {
        if (key === 'OR') {
          return (value as Record<string, unknown>[]).some(matches);
        }
        if (key === 'exam') {
          return Object.entries(value as Record<string, unknown>).every(
            ([k, v]) => (r.exam as Record<string, unknown>)[k] === v,
          );
        }
        return (r as unknown as Record<string, unknown>)[key] === value;
      });
    return matches(RESULTS_AUDIENCE);
  };

  it.each<[string, Row, boolean]>([
    ['paid', row({ paid: true }), true],
    ['unpaid', row({}), false],
    ['free for them (fee 0)', row({ feeAmount: 0 }), true],
    ['old row, free exam', row({ feeAmount: null, exam: { price: 0 } }), true],
    ['old row, priced exam, unpaid', row({ feeAmount: null }), false],
    [
      'fee owed although the exam is free now',
      row({ exam: { price: 0 } }),
      false,
    ],
  ])('%s', (_name, r, expected) => {
    expect(inAudience(r)).toBe(expected);
  });
});
