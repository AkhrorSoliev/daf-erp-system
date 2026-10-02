import { departureMoneyNote } from './departure-money-note';

const share = { held: 6, covered: 13, percent: 46 };

describe('departureMoneyNote (ADR-0043)', () => {
  it('says nothing when the enrollment had no month to settle', () => {
    expect(departureMoneyNote(null)).toBeNull();
  });

  it('explains a month kept by rule 6.2 with the share that decided it', () => {
    expect(
      departureMoneyNote({
        refunded: 0,
        lessons: 0,
        policy: 'STUDENT_CANCELLED',
        share,
        withheld: true,
        trial: false,
      }),
    ).toBe(
      "Shartnoma 6.2: oy darslarining 46% o'tgan (6/13) — oy to'lovi qaytarilmadi",
    );
  });

  it('names the unheld lessons returned on the student’s own decision', () => {
    expect(
      departureMoneyNote({
        refunded: 640000,
        lessons: 8,
        policy: 'STUDENT_CANCELLED',
        share: { held: 5, covered: 13, percent: 38 },
        withheld: false,
        trial: false,
      }),
    ).toBe("O'tmagan 8 dars puli qaytarildi — 640 000 so'm");
  });

  it('names a completed level', () => {
    expect(
      departureMoneyNote({
        refunded: 560000,
        lessons: 7,
        policy: 'LEVEL_COMPLETED',
        share,
        withheld: false,
        trial: false,
      }),
    ).toBe("Darajani tugatdi: o'tmagan 7 dars puli qaytarildi — 560 000 so'm");
  });

  it('names the centre’s initiative', () => {
    expect(
      departureMoneyNote({
        refunded: 560000,
        lessons: 7,
        policy: 'CENTER_INITIATIVE',
        share,
        withheld: false,
        trial: false,
      }),
    ).toBe("Markaz tashabbusi: o'tmagan 7 dars puli qaytarildi — 560 000 so'm");
  });

  it('names a quality claim returning the whole month', () => {
    expect(
      departureMoneyNote({
        refunded: 1040000,
        lessons: 13,
        policy: 'QUALITY_CLAIM',
        share,
        withheld: false,
        trial: false,
      }),
    ).toBe(
      "Sifat bo'yicha shikoyat: oyning 13 darsi puli to'liq qaytarildi — 1 040 000 so'm",
    );
  });

  it('names a trial lesson returning the whole month (contract 3.5)', () => {
    expect(
      departureMoneyNote({
        refunded: 450000,
        lessons: 13,
        policy: 'STUDENT_CANCELLED',
        share: { held: 1, covered: 13, percent: 8 },
        withheld: false,
        trial: true,
      }),
    ).toBe("Sinov darsi (3.5): oyning puli to'liq qaytarildi — 450 000 so'm");
  });
});
