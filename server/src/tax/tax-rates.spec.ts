import { BadRequestException } from '@nestjs/common';
import { parseDatedRates, rateForMonth } from './tax-rates';

describe('parseDatedRates', () => {
  it('accepts decimals and sorts by month', () => {
    expect(
      parseDatedRates('tax.turnoverPercent', [
        { fromMonth: '2026-12', value: 6 },
        { fromMonth: '2026-10', value: 4 },
      ]),
    ).toEqual([
      { fromMonth: '2026-10', value: 4 },
      { fromMonth: '2026-12', value: 6 },
    ]);
    expect(
      parseDatedRates('fees.qr', [{ fromMonth: '2026-10', value: 2.5 }]),
    ).toEqual([{ fromMonth: '2026-10', value: 2.5 }]);
  });

  it.each([1.15, 0.07, 0.29, 4.35, 1.1, 8.2, 0.58])(
    'accepts the 2-decimal percent %s (float error must not reject it)',
    (value) => {
      expect(
        parseDatedRates('fees.qr', [{ fromMonth: '2026-10', value }]),
      ).toEqual([{ fromMonth: '2026-10', value }]);
    },
  );

  it.each([2.555, 0.001])(
    'still refuses %s (more than 2 decimals)',
    (value) => {
      expect(() =>
        parseDatedRates('fees.qr', [{ fromMonth: '2026-10', value }]),
      ).toThrow(BadRequestException);
    },
  );

  it.each([
    [[{ fromMonth: '2026-13', value: 4 }]],
    [[{ fromMonth: '2026-10', value: 101 }]],
    [[{ fromMonth: '2026-10', value: -1 }]],
    [[{ fromMonth: '2026-10', value: 2.555 }]],
    [
      [
        { fromMonth: '2026-10', value: 4 },
        { fromMonth: '2026-10', value: 5 },
      ],
    ],
    ['4'],
  ])('refuses %j', (raw) => {
    expect(() => parseDatedRates('tax.turnoverPercent', raw)).toThrow(
      BadRequestException,
    );
  });
});

describe('rateForMonth', () => {
  const list = [
    { fromMonth: '2026-10', value: 4 },
    { fromMonth: '2027-01', value: 6 },
  ];
  it('takes the latest row in force', () => {
    expect(rateForMonth(list, '2026-12')).toBe(4);
    expect(rateForMonth(list, '2027-01')).toBe(6);
  });
  it('is null before the first row and for an empty list', () => {
    expect(rateForMonth(list, '2026-09')).toBeNull();
    expect(rateForMonth([], '2026-10')).toBeNull();
  });
});
