import { resolvePackPerLessonCost } from './prepaid-refund-price';

describe('resolvePackPerLessonCost', () => {
  it("50% chegirmali o'quvchi uchun batch summasidan chegirmali qaytarishni hisoblaydi — metadata.perLessonCost'dan emas", () => {
    // 400 000/12 kurs, 50% chegirma: FULL_CYCLE deduction 200 000 (chegirmali
    // summa), metadata.perLessonCost esa ATAYLAB chegirmasiz 33 333
    // (lesson-billing.service.ts: "keeps perLessonCost at the full,
    // un-discounted rate").
    const result = resolvePackPerLessonCost({
      remaining: 5,
      course: { price: 400_000, lessonPaymentCount: 12 },
      batch: { amount: -200_000, lessonsCovered: 12, perLessonCost: 33_333 },
    });

    // Haqiqiy refund (EnrollmentBillingService.prepaidRefundValue):
    // 200 000 - cycleCostFor(200 000, 12, 7 sarflangan) = 200 000 - 116 669 = 83 331.
    // Bitta stavkaga aylantirilganda: round(83 331 / 5) = 16 666.
    expect(result).toBe(16_666);
    // 5 dars uchun qayta ko'paytirilganda haqiqiy refundga bir necha so'm
    // ichida mos keladi (MigrationRow bitta stavka talab qilgani uchun
    // yaxlitlash farqi muqarrar, lekin ikki barobar xato emas).
    expect(Math.abs(result * 5 - 83_331)).toBeLessThanOrEqual(5);
  });

  it("metadata.perLessonCost'ni to'g'ridan-to'g'ri qaytarmaydi — u chegirmasiz (eski xato)", () => {
    const result = resolvePackPerLessonCost({
      remaining: 5,
      course: { price: 400_000, lessonPaymentCount: 12 },
      batch: { amount: -200_000, lessonsCovered: 12, perLessonCost: 33_333 },
    });
    expect(result).not.toBe(33_333);
  });

  it("batch ma'lumoti bo'lmasa kurs narxiga tushadi — chegirmasiz, real resolvePerLessonCost fallback'i kabi", () => {
    const result = resolvePackPerLessonCost({
      remaining: 3,
      course: { price: 450_000, lessonPaymentCount: 12 },
      batch: null,
    });
    expect(result).toBe(37_500); // round(450 000 / 12)
  });

  it("remaining batch qoplagan darslar sonidan ko'p bo'lsa (mos kelmaydigan/eski batch) metadataga tushadi", () => {
    const result = resolvePackPerLessonCost({
      remaining: 20,
      course: { price: 450_000, lessonPaymentCount: 12 },
      batch: { amount: -450_000, lessonsCovered: 12, perLessonCost: 37_500 },
    });
    expect(result).toBe(37_500);
  });

  it('remaining <= 0 bo`lsa 0 qaytaradi', () => {
    const result = resolvePackPerLessonCost({
      remaining: 0,
      course: { price: 450_000, lessonPaymentCount: 12 },
      batch: { amount: -450_000, lessonsCovered: 12, perLessonCost: 37_500 },
    });
    expect(result).toBe(0);
  });
});
