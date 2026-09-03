import { PaymentModel } from '@prisma/client';
import {
  resolveLessonPricing,
  sweepGapLessons,
  type GapCourse,
  type GapSweepInput,
} from './gap-sweep';
import { monthlyPerLessonKey } from '../../common/finance/monthly-per-lesson';
import type { RateVersion } from './deserved-math';
import { NEW_STUDENT_TOPUP_MIN_LESSONS } from './topup';

/**
 * `gap-sweep` narxlash qismi — markaz qoplaydigan darsning qiymati.
 *
 * Nima uchun aynan shu yerda: `sweepGapLessons` uchta yuzani boqadi va
 * ulardan biri (payroll cron'ining 0-fazasi) PUL YOZADI. Oylik modelda
 * `Course.price` bir OYning narxi, shuning uchun uni 12 ga bo'lish 13
 * darslik oyda ~8% ortiqcha, 8 darslik oyda ~33% kam to'lardi.
 *
 * `LESSON_PACK` yo'li productionda har bir o'quvchi uchun jonli — shuning
 * uchun uning raqamlari BAYT-BA-BAYT eski xatti-harakat bilan pinlangan.
 */

const TEACHER = 501;
const STUDENT = 10001;
const GROUP = 'g1';
const COMPANY_MONTH = '2026-09';

const PERCENTAGE: RateVersion = {
  salaryType: 'PERCENTAGE',
  value: 30,
  effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
  effectiveTo: null,
};
const FIXED_PER_STUDENT: RateVersion = {
  salaryType: 'FIXED_PER_STUDENT',
  value: 120_000,
  effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
  effectiveTo: null,
};
const FIXED_MONTHLY: RateVersion = {
  salaryType: 'FIXED_MONTHLY',
  value: 5_000_000,
  effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
  effectiveTo: null,
};

const MONTHLY_COURSE: GapCourse = {
  price: 400_000,
  // ATAYLAB eskirgan: oylik kursda bu maydon ma'nosiz va narxga TEGMASLIGI
  // kerak. Agar u yana bo'luvchi bo'lib qolsa, quyidagi testlar yiqiladi.
  lessonPaymentCount: 12,
  paymentModel: PaymentModel.MONTHLY,
};
const PACK_COURSE: GapCourse = {
  price: 400_000,
  lessonPaymentCount: 12,
  paymentModel: PaymentModel.LESSON_PACK,
};

/** `@db.Date` qiymati — UTC yarim tuni. */
function lessonDate(day: number): Date {
  return new Date(`2026-09-${String(day).padStart(2, '0')}T00:00:00.000Z`);
}

function frozen(perLessonCost: number, plannedLessons: number) {
  return new Map([
    [
      monthlyPerLessonKey(STUDENT, GROUP, COMPANY_MONTH),
      { perLessonCost, plannedLessons },
    ],
  ]);
}

function buildInput(
  course: GapCourse,
  rate: RateVersion | null,
  overrides: Partial<GapSweepInput> = {},
): GapSweepInput {
  return {
    attendances: [
      { id: 'a1', studentId: STUDENT, groupId: GROUP, date: lessonDate(10) },
    ],
    groupMap: new Map([[GROUP, { course }]]),
    resolveTeachers: () => [TEACHER],
    resolveRate: () => rate,
    inScope: () => true,
    isCovered: () => false,
    isFixedMonthly: () => false,
    heldByStudentGroup: new Map([
      [`${STUDENT}::${GROUP}`, NEW_STUDENT_TOPUP_MIN_LESSONS],
    ]),
    inactiveSince: new Map(),
    dateStr: (d) => d.toISOString().slice(0, 10),
    ...overrides,
  };
}

describe('sweepGapLessons — MONTHLY kurs narxi', () => {
  it("13 darslik oyda muzlatilgan narxdan hisoblaydi (12 ga BO'LMAYDI)", () => {
    // 400 000 / 13 = 30 769 (muzlatilgan). Xato yo'l 400 000 / 12 = 33 333
    // berardi — o'qituvchiga ~8% ortiqcha.
    const res = sweepGapLessons(
      buildInput(MONTHLY_COURSE, PERCENTAGE, {
        monthlyFrozen: frozen(30_769, 13),
      }),
    );

    expect(res.lessons).toHaveLength(1);
    expect(res.lessons[0].perLessonCost).toBe(30_769);
    expect(res.lessons[0].amount).toBe(Math.round((30_769 * 30) / 100)); // 9 231
    // Eski (xato) yo'lning raqami qaytib kelmasligi kerak.
    expect(res.lessons[0].amount).not.toBe(10_000);
    expect(res.noChargeUnits.size).toBe(0);
  });

  it('8 darslik oyda ham muzlatilgan narxdan hisoblaydi', () => {
    // 400 000 / 8 = 50 000. Xato yo'l 33 333 berardi — ~33% kam.
    const res = sweepGapLessons(
      buildInput(MONTHLY_COURSE, PERCENTAGE, {
        monthlyFrozen: frozen(50_000, 8),
      }),
    );

    expect(res.lessons[0].perLessonCost).toBe(50_000);
    expect(res.lessons[0].amount).toBe(15_000);
  });

  it("FIXED_PER_STUDENT bo'luvchisi — oyning REJALASHTIRILGAN dars soni", () => {
    // Stavka qiymati bir siklda bir o'quvchidan; oylik modelda sikl = oy.
    // 120 000 / 13 = 9 231, 12 ga bo'lish 10 000 berardi.
    const thirteen = sweepGapLessons(
      buildInput(MONTHLY_COURSE, FIXED_PER_STUDENT, {
        monthlyFrozen: frozen(30_769, 13),
      }),
    );
    expect(thirteen.lessons[0].amount).toBe(Math.round(120_000 / 13));

    const eight = sweepGapLessons(
      buildInput(MONTHLY_COURSE, FIXED_PER_STUDENT, {
        monthlyFrozen: frozen(50_000, 8),
      }),
    );
    expect(eight.lessons[0].amount).toBe(15_000);
  });

  it("muzlatilgan hisob yo'q bo'lsa — narxlamaydi, SANAYDI", () => {
    const res = sweepGapLessons(
      buildInput(MONTHLY_COURSE, PERCENTAGE, { monthlyFrozen: new Map() }),
    );

    expect(res.lessons).toHaveLength(0);
    expect(res.noChargeUnits.get(TEACHER)).toBe(1);
    // Stavka bor edi — bu "konfiguratsiya yo'q" holati EMAS.
    expect(res.noConfigUnits.size).toBe(0);
  });

  it('xarita umuman berilmasa ham narx taxmin qilinmaydi', () => {
    const res = sweepGapLessons(buildInput(MONTHLY_COURSE, PERCENTAGE));

    expect(res.lessons).toHaveLength(0);
    expect(res.noChargeUnits.get(TEACHER)).toBe(1);
  });

  it("FIXED_MONTHLY o'qituvchi baribir chetlab o'tiladi", () => {
    const res = sweepGapLessons(
      buildInput(MONTHLY_COURSE, FIXED_MONTHLY, {
        monthlyFrozen: frozen(30_769, 13),
        isFixedMonthly: () => true,
      }),
    );

    expect(res.lessons).toHaveLength(0);
    expect(res.noChargeUnits.size).toBe(0);
  });
});

describe("sweepGapLessons — LESSON_PACK o'zgarmaydi", () => {
  it("PERCENTAGE: price / lessonPaymentCount, muzlatilgan xarita e'tiborsiz", () => {
    const res = sweepGapLessons(
      buildInput(PACK_COURSE, PERCENTAGE, {
        // Oylik xarita berilgan bo'lsa ham 12 talik yo'l unga QARAMAYDI.
        monthlyFrozen: frozen(50_000, 8),
      }),
    );

    expect(res.lessons[0].perLessonCost).toBe(Math.round(400_000 / 12));
    expect(res.lessons[0].amount).toBe(10_000);
  });

  it('FIXED_PER_STUDENT: value / lessonPaymentCount', () => {
    const res = sweepGapLessons(buildInput(PACK_COURSE, FIXED_PER_STUDENT));

    expect(res.lessons[0].amount).toBe(10_000); // 120 000 / 12
  });

  it("lessonPaymentCount = 0 bo'lsa 12 ga tushadi (eski zaxira)", () => {
    const res = sweepGapLessons(
      buildInput({ ...PACK_COURSE, lessonPaymentCount: 0 }, PERCENTAGE),
    );

    expect(res.lessons[0].perLessonCost).toBe(Math.round(400_000 / 12));
  });

  it("FIXED_MONTHLY chetlab o'tiladi", () => {
    const res = sweepGapLessons(
      buildInput(PACK_COURSE, FIXED_MONTHLY, { isFixedMonthly: () => true }),
    );

    expect(res.lessons).toHaveLength(0);
  });

  it("stavka topilmasa noConfigUnits'ga tushadi", () => {
    const res = sweepGapLessons(buildInput(PACK_COURSE, null));

    expect(res.lessons).toHaveLength(0);
    expect(res.noConfigUnits.get(TEACHER)).toBe(1);
    expect(res.noChargeUnits.size).toBe(0);
  });
});

describe('resolveLessonPricing', () => {
  it('LESSON_PACK: sikl = lessonPaymentCount', () => {
    expect(
      resolveLessonPricing(PACK_COURSE, STUDENT, GROUP, lessonDate(10)),
    ).toEqual({ perLessonCost: 33_333, divisor: 12 });
  });

  it('MONTHLY: sikl = oyning rejalashtirilgan dars soni', () => {
    expect(
      resolveLessonPricing(
        MONTHLY_COURSE,
        STUDENT,
        GROUP,
        lessonDate(10),
        frozen(30_769, 13),
      ),
    ).toEqual({ perLessonCost: 30_769, divisor: 13 });
  });

  it('MONTHLY: boshqa oyning hisobi ishlatilmaydi', () => {
    const augustKey = new Map([
      [
        monthlyPerLessonKey(STUDENT, GROUP, '2026-08'),
        { perLessonCost: 50_000, plannedLessons: 8 },
      ],
    ]);

    expect(
      resolveLessonPricing(
        MONTHLY_COURSE,
        STUDENT,
        GROUP,
        lessonDate(10),
        augustKey,
      ),
    ).toBeNull();
  });

  it('MONTHLY: buzilgan hisob (0 dars yoki 0 narx) qabul qilinmaydi', () => {
    expect(
      resolveLessonPricing(
        MONTHLY_COURSE,
        STUDENT,
        GROUP,
        lessonDate(10),
        frozen(30_769, 0),
      ),
    ).toBeNull();
    expect(
      resolveLessonPricing(
        MONTHLY_COURSE,
        STUDENT,
        GROUP,
        lessonDate(10),
        frozen(0, 13),
      ),
    ).toBeNull();
  });
});
