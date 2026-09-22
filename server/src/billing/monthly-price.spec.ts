import {
  applyLessonCredit,
  perLessonCostForMonth,
  proratedMonthlyAmount,
} from './monthly-price';

describe('perLessonCostForMonth', () => {
  it('oy narxini o`sha oydagi dars soniga bo`ladi', () => {
    expect(perLessonCostForMonth(450_000, 13)).toBe(34_615);
    expect(perLessonCostForMonth(740_000, 22)).toBe(33_636);
  });

  it('dars soni yoki narx nol bo`lsa 0 qaytaradi', () => {
    expect(perLessonCostForMonth(450_000, 0)).toBe(0);
    expect(perLessonCostForMonth(0, 13)).toBe(0);
    expect(perLessonCostForMonth(450_000, -3)).toBe(0);
  });
});

describe('proratedMonthlyAmount', () => {
  it('to`liq oyda aynan oy narxini qaytaradi — yaxlitlash siljishi yo`q', () => {
    // 450 000 x 13/13 ni hisoblasak ham 450 000 chiqadi, lekin bu yo'l
    // umuman hisoblamaydi: to'liq oy = e'lon qilingan narx, nuqta.
    expect(proratedMonthlyAmount(450_000, 13, 13)).toBe(450_000);
    expect(proratedMonthlyAmount(740_000, 22, 22)).toBe(740_000);
  });

  it('o`rtada qo`shilganda qolgan darslarga proratsiya qiladi', () => {
    // 17.09 da keldi, sentabrda qolgan 5 dars, oyda jami 13
    expect(proratedMonthlyAmount(450_000, 13, 5)).toBe(173_077);
  });

  it('dars sonidan ortiq qoplamani oy narxi bilan cheklaydi', () => {
    // Jadval kengayib 14-dars o'tsa ham o'quvchi oy narxidan ortiq to'lamaydi.
    expect(proratedMonthlyAmount(450_000, 13, 14)).toBe(450_000);
  });

  it('nol yoki manfiy qoplamada 0 qaytaradi', () => {
    expect(proratedMonthlyAmount(450_000, 13, 0)).toBe(0);
    expect(proratedMonthlyAmount(450_000, 13, -2)).toBe(0);
  });
});

describe('applyLessonCredit', () => {
  it('uzrli darslar ulushini keyingi oy hisobidan chegiradi', () => {
    // Sentabrda 2 ta uzrli -> oktabr: 450 000 - 2 x 34 615 = 380 770
    const r = applyLessonCredit(450_000, 34_615, 2);
    expect(r.creditLessonsUsed).toBe(2);
    expect(r.creditAmount).toBe(69_230);
    expect(r.chargedAmount).toBe(380_770);
    expect(r.carriedCreditLessons).toBe(0);
  });

  it('krediti oy hisobidan katta bo`lsa ortiqchasini keyingi oyga suradi', () => {
    // 20 ta kredit dars, oy hisobi atigi 13 tasiga yetadi.
    const r = applyLessonCredit(450_000, 34_615, 20);
    expect(r.creditLessonsUsed).toBe(13);
    expect(r.creditAmount).toBe(449_995);
    expect(r.chargedAmount).toBe(5);
    expect(r.carriedCreditLessons).toBe(7);
  });

  it('chargedAmount hech qachon manfiy bo`lmaydi', () => {
    const r = applyLessonCredit(100_000, 34_615, 50);
    expect(r.chargedAmount).toBeGreaterThanOrEqual(0);
    expect(r.creditAmount).toBeLessThanOrEqual(100_000);
  });

  it('kredit yo`q bo`lsa hisobga tegmaydi', () => {
    const r = applyLessonCredit(450_000, 34_615, 0);
    expect(r.creditAmount).toBe(0);
    expect(r.chargedAmount).toBe(450_000);
    expect(r.carriedCreditLessons).toBe(0);
  });

  it('dars narxi 0 bo`lsa kreditni sarflamaydi, hammasini suradi', () => {
    const r = applyLessonCredit(450_000, 0, 3);
    expect(r.creditLessonsUsed).toBe(0);
    expect(r.chargedAmount).toBe(450_000);
    expect(r.carriedCreditLessons).toBe(3);
  });
});
