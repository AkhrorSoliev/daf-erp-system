import { perLessonPrice } from './per-lesson-price';

describe('perLessonPrice', () => {
  const course = { price: 1_200_000, lessonPaymentCount: 12 };

  it('uses the active contract before anything else', () => {
    expect(
      perLessonPrice({
        course,
        discountPercent: 50,
        contractTotalAmount: 600_000,
      }),
    ).toBe(50_000);
  });

  it('applies the student discount to the course price when there is no contract', () => {
    expect(
      perLessonPrice({ course, discountPercent: 25, contractTotalAmount: null }),
    ).toBe(75_000);
  });

  it('falls back to the bare course price when discount is missing', () => {
    expect(
      perLessonPrice({
        course,
        discountPercent: null,
        contractTotalAmount: null,
      }),
    ).toBe(100_000);
  });

  it('clamps a nonsense discount into 0..100', () => {
    expect(
      perLessonPrice({ course, discountPercent: 140, contractTotalAmount: null }),
    ).toBe(0);
    expect(
      perLessonPrice({ course, discountPercent: -30, contractTotalAmount: null }),
    ).toBe(100_000);
  });

  it('treats a zero/absent lessonPaymentCount as 12', () => {
    expect(
      perLessonPrice({
        course: { price: 1_200_000, lessonPaymentCount: 0 },
        discountPercent: null,
        contractTotalAmount: null,
      }),
    ).toBe(100_000);
  });
});
