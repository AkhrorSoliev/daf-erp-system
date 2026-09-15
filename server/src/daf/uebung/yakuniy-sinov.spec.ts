import {
  OTISH_FOIZI,
  UNIT_TEST_SAVOLLAR,
  otishUchunKerak,
  sinovdanOtdimi,
} from './yakuniy-sinov';

describe('yakuniy sinov qoidasi', () => {
  it('15 savolda kamida 14 ta to`g`ri kerak (90 %)', () => {
    expect(UNIT_TEST_SAVOLLAR).toBe(15);
    expect(OTISH_FOIZI).toBe(90);
    expect(otishUchunKerak()).toBe(14);
  });

  it('butun son foiz bilan hisoblanadi — suzuvchi nuqta bir ortiq talab qilmaydi', () => {
    // 0.9 × 10 suzuvchi nuqtada 9.000000000000002 — `Math.ceil` 10 berardi.
    expect(otishUchunKerak(10)).toBe(9);
    expect(otishUchunKerak(20)).toBe(18);
    expect(otishUchunKerak(12)).toBe(11);
  });

  it('14/15 — o`tdi, 13/15 — o`tmadi', () => {
    expect(sinovdanOtdimi({ questionCount: 15, firstTryCorrect: 14 })).toBe(
      true,
    );
    expect(sinovdanOtdimi({ questionCount: 15, firstTryCorrect: 15 })).toBe(
      true,
    );
    expect(sinovdanOtdimi({ questionCount: 15, firstTryCorrect: 13 })).toBe(
      false,
    );
  });

  it('15 tadan kam savolga javob berilgan seans o`tmaydi (14/14 ham)', () => {
    expect(sinovdanOtdimi({ questionCount: 14, firstTryCorrect: 14 })).toBe(
      false,
    );
    expect(sinovdanOtdimi({ questionCount: 3, firstTryCorrect: 3 })).toBe(
      false,
    );
  });
});
