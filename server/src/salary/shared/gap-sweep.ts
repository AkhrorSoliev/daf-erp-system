import { PaymentModel } from '@prisma/client';
import {
  monthlyPerLessonKeyForLesson,
  type FrozenMonthlyCharge,
} from '../../common/finance/monthly-per-lesson';
import { lessonKey } from '../../unmarked-lessons/forfeited-lessons';
import { perLessonAccrual, type RateVersion } from './deserved-math';
import { NEW_STUDENT_TOPUP_MIN_LESSONS } from './topup';

/**
 * Lessons the center will have to front, one row per (lesson × teacher).
 *
 * A held lesson earns the teacher whether or not the student paid. When the
 * student has NOT paid, no accrual exists yet and the payroll cron writes a
 * center-funded one at month end. Until then the exposure is a forecast — real
 * money the center is about to spend, visible before it is spent.
 *
 * This is the one implementation of which lessons qualify. `getMonthly` sums it
 * by TEACHER (the payroll column) and the center top-up drill-down sums it by
 * STUDENT (who to collect from). Two copies of these four exclusions would
 * drift, and the drift would be a payroll figure disagreeing with the list of
 * people it is owed by.
 */
export interface GapLesson {
  attendanceId: string;
  studentId: number;
  groupId: string;
  teacherId: number;
  lessonDate: Date;
  /** What the teacher earns for it — the center's cost. */
  amount: number;
  /** Full lesson price, frozen from the course at sweep time. */
  perLessonCost: number;
  /**
   * `FIXED_PER_STUDENT` bo'luvchisi — 12 talik kursda `lessonPaymentCount`,
   * oylik kursda o'sha oyning muzlatilgan `plannedLessons`i
   * (`resolveLessonPricing().divisor` bilan bir xil). Chaqiruvchi buni
   * `createAccrual`ga `lessonDivisor` sifatida ELTISHI SHART — aks holda
   * cron oylik kursni yana 12 ga bo'lib yozadi (bu vazifa yo'qotmoqchi
   * bo'lgan xato jonli davomat yo'lida tuzatilgan, lekin markaz
   * qo'shimchasini YOZADIGAN shu yo'lda unutilgan edi).
   */
  divisor: number;
}

export interface GapSweepInput {
  attendances: Array<{
    id: string;
    studentId: number;
    groupId: string;
    date: Date;
  }>;
  /** groupId → course pricing. Missing group ⇒ the lesson is skipped. */
  groupMap: Map<string, { course: GapCourse }>;
  /**
   * Oylik (`MONTHLY`) kurslar uchun MUZLATILGAN qiymatlar; kalit
   * `monthlyPerLessonKeyForLesson(studentId, groupId, lessonDate)`.
   *
   * `LESSON_PACK` uchun umuman o'qilmaydi. Oylik kursda esa bu YAGONA narx
   * manbai: `Course.price` bir OYning narxi, shuning uchun uni 12 ga bo'lish
   * mumkin emas (pastdagi `resolveLessonPricing` izohiga qara).
   */
  monthlyFrozen?: Map<string, FrozenMonthlyCharge>;
  /**
   * attendanceId → the pack price the lesson was billed at (its live
   * `LESSON_CONSUMPTION` marker; `loadPackLessonPrices`). Read only for a
   * monthly-course lesson with no frozen charge — see `resolveLessonPricing`.
   * Load it for `packPriceCandidates(...)`.
   */
  packPrices?: Map<string, number | null>;
  /** Teachers credited for a lesson, honouring substitute overrides. */
  resolveTeachers: (groupId: string, dateStr: string) => number[];
  /** Active rate for that teacher, group and date; null ⇒ no rate to apply. */
  resolveRate: (
    teacherId: number,
    groupId: string,
    at: Date,
  ) => RateVersion | null;
  /** Teacher ids in scope. Anyone else is outside the branch/search page. */
  inScope: (teacherId: number) => boolean;
  /** Attendance ids that already carry an accrual for that teacher. */
  isCovered: (teacherId: number, attendanceId: string) => boolean;
  /** Flat-salary teachers earn no per-lesson gap. */
  isFixedMonthly: (teacherId: number) => boolean;
  /** `studentId::groupId` → attended lessons so far (BR-09 gate). */
  heldByStudentGroup: Map<string, number>;
  /** studentId → Tashkent date they went inactive, if they did. */
  inactiveSince: Map<number, string>;
  /** "YYYY-MM-DD" of a `@db.Date`, shared with the caller so both agree. */
  dateStr: (d: Date) => string;
  /**
   * Drop lessons whose accrual would price at zero.
   *
   * The payroll cron wants this: it is about to WRITE an accrual, and a
   * zero-amount one is noise. The read surfaces do not — `getMonthly` counts
   * such a lesson in `gapUnits` so the teacher's row shows the lesson was
   * held even when the rate prices it at nothing.
   *
   * The difference is deliberate. It is a parameter rather than a second copy
   * of this function because that second copy is exactly what drifted: the
   * cron carried its own sweep for months, and the only thing keeping the
   * paid figure and the shown figure in step was that nobody edited one
   * without the other.
   */
  skipZeroAmount?: boolean;
  /**
   * `lessonKey(groupId, date)` of lessons whose teacher pay is forfeited
   * (ADR-0054): nobody marked them before they ended. Required so no caller
   * can forget it — without it the salary page would show the centre owing
   * the teacher a lesson that `createAccrual` then refuses to pay.
   */
  forfeitedLessons: ReadonlySet<string>;
}

export interface GapSweepResult {
  lessons: GapLesson[];
  /**
   * Lessons skipped because no rate version covered them. Counted, never
   * priced: fabricating a rate is the May 2026 signature, where configs only
   * became effective in June and every earlier lesson would have been invented.
   */
  noConfigUnits: Map<number, number>;
  /**
   * Oylik kursdagi darslar — muzlatilgan hisob topilmagani uchun NARXLANMAGAN
   * (o'qituvchi boshiga son).
   *
   * `noConfigUnits` bilan bir xil siyosat: sanaladi, hech qachon taxmin
   * qilinmaydi. Oylik kursda `Course.price` bir oyning narxi va uni darsga
   * bo'ladigan son (`plannedLessons`) faqat `EnrollmentMonthlyCharge` da
   * muzlatilgan; jonli kalendardan qayta hisoblash aynan muzlatish
   * to'sadigan narsa — oy o'rtasidagi jadval o'zgarishi o'qituvchining
   * haqini orqaga surib yuborardi.
   */
  noChargeUnits: Map<number, number>;
}

/** `resolveLessonPricing` uchun kerak bo'lgan kurs maydonlari. */
export interface GapCourse {
  price: number;
  lessonPaymentCount: number;
  paymentModel: PaymentModel;
}

/** Bitta dars uchun narx va `FIXED_PER_STUDENT` bo'luvchisi. */
export interface LessonPricing {
  /** To'liq dars narxi. */
  perLessonCost: number;
  /**
   * `FIXED_PER_STUDENT` bo'luvchisi — stavka qiymati BIR SIKLDA bir
   * o'quvchidan tushadigan haq, shuning uchun bir darsga to'g'ri keladigani
   * `value / divisor`. 12 talik modelda sikl = `lessonPaymentCount`,
   * oylik modelda sikl = o'sha oyning rejalashtirilgan dars soni.
   */
  divisor: number;
}

/**
 * Dars narxini to'lov modeliga qarab topadi — sweep ham, cron'ning BR-09b
 * qo'shimcha tsikli ham SHU funksiyadan o'tadi.
 *
 * `LESSON_PACK`: `Course.price` — `lessonPaymentCount` ta darsning narxi,
 * ya'ni sikl. Hisob-kitob 2026-09 dan oldingi kod bilan bir xil qoladi.
 *
 * `MONTHLY`: `Course.price` — BIR OYning narxi va `lessonPaymentCount`
 * ma'nosiz. Uni 12 ga bo'lish 13 darslik oyda o'qituvchiga ~8% ortiqcha,
 * 8 darslik oyda ~33% kam to'lardi. Yagona haqiqiy manba —
 * `EnrollmentMonthlyCharge` dagi muzlatilgan juftlik.
 *
 * Muzlatilgan qator topilmasa, dars 12 talik paket bilan hisobdan chiqarilgan
 * bo'lishi mumkin: kurs yoki o'quvchi oylik to'lovga o'tishidan OLDIN guruhdan
 * ketgan o'quvchining darsi faqat paket belgisini (`LESSON_CONSUMPTION`)
 * olib qolgan, oylik hisobi esa hech qachon yozilmagan. Bunday dars NIMA
 * BILAN hisoblangan bo'lsa, o'sha bilan narxlanadi — paket narxi va paket
 * bo'luvchisi (`lessonPaymentCount`); foyda hisobidagi
 * `resolveHeldLessonPrice` ham xuddi shu qoidani qo'llaydi (ADR-0051).
 * Sentabr 2026: 97 o'quvchi, 306 dars — usiz ustoz bu darslar uchun hech
 * narsa olmasdi, tushumda esa ular hisoblangan edi.
 *
 * Ikkalasi ham yo'q bo'lsa `null`: dars narxlanmaydi va chaqiruvchi uni
 * `noChargeUnits` da SANAB qo'yadi. Taxminiy narx yozish (masalan jonli
 * kalendardan qayta hisoblash) muzlatish invariantini buzardi va bu — pul
 * yozadigan yo'l.
 */
export function resolveLessonPricing(
  course: GapCourse,
  studentId: number,
  groupId: string,
  lessonDate: Date,
  monthlyFrozen?: Map<string, FrozenMonthlyCharge>,
  /** The lesson's pack marker price (`packPrices.get(attendanceId)`). */
  packPrice?: number | null,
): LessonPricing | null {
  if (course.paymentModel === PaymentModel.MONTHLY) {
    const frozen = monthlyFrozen?.get(
      monthlyPerLessonKeyForLesson(studentId, groupId, lessonDate),
    );
    if (frozen && frozen.perLessonCost > 0 && frozen.plannedLessons > 0) {
      return {
        perLessonCost: frozen.perLessonCost,
        divisor: frozen.plannedLessons,
      };
    }
    if (packPrice && packPrice > 0) {
      return {
        perLessonCost: packPrice,
        divisor: course.lessonPaymentCount || 12,
      };
    }
    return null;
  }

  const lpc = course.lessonPaymentCount || 12;
  return { perLessonCost: Math.round(course.price / lpc), divisor: lpc };
}

/**
 * The attendances whose price may have to come from a pack marker: a
 * monthly-course lesson with no frozen charge for its month. Only these need
 * `loadPackLessonPrices`, so a month of monthly-billed lessons costs no query.
 */
export function packPriceCandidates(
  attendances: Array<{
    id: string;
    studentId: number;
    groupId: string;
    date: Date;
  }>,
  groupMap: Map<string, { course: GapCourse }>,
  monthlyFrozen: Map<string, FrozenMonthlyCharge>,
): string[] {
  return attendances
    .filter(
      (a) =>
        groupMap.get(a.groupId)?.course.paymentModel === PaymentModel.MONTHLY &&
        !monthlyFrozen.has(
          monthlyPerLessonKeyForLesson(a.studentId, a.groupId, a.date),
        ),
    )
    .map((a) => a.id);
}

export function sweepGapLessons(input: GapSweepInput): GapSweepResult {
  const lessons: GapLesson[] = [];
  const noConfigUnits = new Map<number, number>();
  const noChargeUnits = new Map<number, number>();

  for (const att of input.attendances) {
    const g = input.groupMap.get(att.groupId);
    if (!g) continue;
    if (input.forfeitedLessons.has(lessonKey(att.groupId, att.date))) continue;

    // BR-09: withhold the new-student top-up until they have attended enough
    // lessons in this group — mirrors the cron, so the shown gap equals what
    // will actually be paid.
    const held =
      input.heldByStudentGroup.get(`${att.studentId}::${att.groupId}`) ?? 0;
    if (held < NEW_STUDENT_TOPUP_MIN_LESSONS) continue;

    // No top-up for a lesson held after the student went inactive.
    const inactiveDay = input.inactiveSince.get(att.studentId);
    const dStr = input.dateStr(att.date);
    if (inactiveDay !== undefined && dStr > inactiveDay) continue;

    const pricing = resolveLessonPricing(
      g.course,
      att.studentId,
      att.groupId,
      att.date,
      input.monthlyFrozen,
      input.packPrices?.get(att.id),
    );

    for (const teacherId of input.resolveTeachers(att.groupId, dStr)) {
      if (!input.inScope(teacherId)) continue;
      if (input.isCovered(teacherId, att.id)) continue;
      if (input.isFixedMonthly(teacherId)) continue;

      const v = input.resolveRate(teacherId, att.groupId, att.date);
      if (!v) {
        noConfigUnits.set(teacherId, (noConfigUnits.get(teacherId) ?? 0) + 1);
        continue;
      }
      // Stavka bor, lekin oylik kursning muzlatilgan narxi yo'q: dars
      // sanaladi, narxlanmaydi (yuqoridagi izoh).
      if (!pricing) {
        noChargeUnits.set(teacherId, (noChargeUnits.get(teacherId) ?? 0) + 1);
        continue;
      }
      const { perLessonCost, divisor } = pricing;
      const amount = perLessonAccrual(v, perLessonCost, divisor);
      if (input.skipZeroAmount && amount <= 0) continue;
      lessons.push({
        attendanceId: att.id,
        studentId: att.studentId,
        groupId: att.groupId,
        teacherId,
        lessonDate: att.date,
        amount,
        perLessonCost,
        divisor,
      });
    }
  }

  return { lessons, noConfigUnits, noChargeUnits };
}
