import { MonthlyChargeStatus, Prisma } from '@prisma/client';
import { tashkentDateStr } from '../../attendance/shared/date-utils';

/**
 * Oylik modelda bir darsning MUZLATILGAN qiymati — hisobot yuzalari uchun
 * yagona manba.
 *
 * Nima uchun kerak: 12 talik (LESSON_PACK) yo'lda har bir o'tilgan dars
 * o'zining `LESSON_CONSUMPTION` qatorini yozadi va hisobotlar dars qiymatini
 * o'sha qatorning `metadata.perLessonCost` idan oladi. OYLIK yo'l bunday
 * qator YOZMAYDI: pul oy boshida bitta `LESSON_DEDUCTION`
 * (`metadata.mode = 'MONTHLY_PERIOD'`) bilan yechiladi va unda `attendanceId`
 * ham yo'q. Shu sababli `LESSON_CONSUMPTION` ga tayangan har bir yuza oylik
 * o'quvchining darsini NOLGA hisoblardi — o'qituvchi haqi esa hisoblanaverardi,
 * ya'ni «Sof foyda» va Foyda kartasi 01.09 dan boshlab soxta ZARAR
 * ko'rsatardi.
 *
 * Javob `EnrollmentMonthlyCharge.perLessonCost` dan olinadi. U ATAYLAB
 * chegirmasiz — bu `LESSON_CONSUMPTION.metadata.perLessonCost` bilan bir xil
 * ma'no: ikkalasi ham "nima hisoblangan"ni tiklaydi, "bugun qancha olinardi"ni
 * emas (`per-lesson-price.ts` dagi izohga qarang).
 *
 * Bitta funksiya, ikki chaqiruvchi (`reports-financial` va
 * `reports-expectation`) — ular bir xil oyga bir xil raqamni berishi SHART.
 */

/** `${studentId}::${groupId}::${YYYY-MM}` — xarita kaliti. */
export function monthlyPerLessonKey(
  studentId: number,
  groupId: string,
  monthKey: string,
): string {
  return `${studentId}::${groupId}::${monthKey}`;
}

/**
 * Dars sanasidan xarita kaliti.
 *
 * Oy `tashkentDateStr` dan chiqariladi — bu kod bazasida "Toshkent oyi"
 * ning yagona kanonik hisobi (`reports/debt-history.util.ts` dagi
 * `tashkentMonthKey` ham xuddi shuni beradi; bu yerda yangi eksport
 * yasamaymiz).
 */
export function monthlyPerLessonKeyForLesson(
  studentId: number,
  groupId: string,
  lessonDate: Date,
): string {
  return monthlyPerLessonKey(
    studentId,
    groupId,
    tashkentDateStr(lessonDate).slice(0, 7),
  );
}

export interface FrozenMonthlyPerLessonParams {
  companyId: number;
  studentIds: number[];
  groupIds: string[];
  /** Qamrab olinadigan davrlar — odatda so'ralgan oyning o'zi. */
  periods: { year: number; month: number }[];
}

/**
 * Bitta (yozilish, davr) uchun muzlatilgan ikki qiymat.
 *
 * `perLessonCost` — bir darsning qiymati (chegirmasiz).
 * `plannedLessons` — guruhning o'sha oydagi rejalashtirilgan dars soni; ayni
 * shu son `perLessonCost` ning bo'luvchisi bo'lgan, shuning uchun oylik
 * modelda "sikl uzunligi" ma'nosini u tashiydi (12 talik modeldagi
 * `Course.lessonPaymentCount` ning qarshi tomoni).
 */
export interface FrozenMonthlyCharge {
  perLessonCost: number;
  plannedLessons: number;
  /**
   * Dates ('YYYY-MM-DD') the charge billed, frozen when it was written. Empty
   * on rows written before the column existed. Optional so callers that only
   * need the price can build this shape without it.
   */
  coveredDates?: string[];
  /** Subset of `coveredDates` taken back out by a freeze or departure. */
  frozenOutDates?: string[];
}

/**
 * Did this monthly charge bill the lesson held on `dateStr` ('YYYY-MM-DD')?
 *
 * A row with no `coveredDates` predates the column and is treated as billing
 * its whole month — the same reading `reverseChargeForDeparture` gives it.
 */
export function monthlyChargeBilledDate(
  charge: Pick<FrozenMonthlyCharge, 'coveredDates' | 'frozenOutDates'>,
  dateStr: string,
): boolean {
  const covered = charge.coveredDates ?? [];
  if (covered.length === 0) return true;
  return (
    covered.includes(dateStr) &&
    !(charge.frozenOutDates ?? []).includes(dateStr)
  );
}

/**
 * The value one HELD lesson recognises in the reports, or `undefined` when
 * nothing billed it. Shared by `getRecognizedRevenue` and the month-end
 * expectation so the two can never price the same lesson differently.
 *
 * Precedence:
 *  1. A monthly charge that billed this very date — the student is paying the
 *     monthly price for it.
 *  2. A live `LESSON_CONSUMPTION` row — the 12-lesson pack that paid for it.
 *     `null` means the row carries no `perLessonCost` (legacy), so the bare
 *     course price stands in.
 *  3. A monthly charge for the month that does not list this date.
 *
 * Why 1 beats 2: the September 2026 switch to monthly billing re-billed every
 * migrated student's September on the monthly price but left that month's
 * zero-amount `LESSON_CONSUMPTION` markers in place. Reading the marker first
 * valued ~3 700 lessons at the old pack price while the teacher's pay for the
 * same lessons had been re-accrued at the monthly price.
 */
export function resolveHeldLessonPrice(args: {
  charge: FrozenMonthlyCharge | undefined;
  dateStr: string;
  /** undefined = no consumption row; null = row without a stored price. */
  consumed: number | null | undefined;
  legacyPrice: number;
}): number | undefined {
  const { charge, dateStr, consumed, legacyPrice } = args;
  if (charge && monthlyChargeBilledDate(charge, dateStr)) {
    return charge.perLessonCost;
  }
  if (consumed !== undefined) return consumed ?? legacyPrice;
  return charge?.perLessonCost;
}

/**
 * `EnrollmentMonthlyCharge` dan muzlatilgan qiymatlarni yig'adi.
 *
 * Faqat `CHARGED` qatorlar: bekor qilingan hisob (`REVERSED`) hech qanday
 * daromadni tan olmaydi.
 *
 * `loadFrozenMonthlyPerLesson` shu funksiyaning ustidagi yupqa proyeksiya —
 * so'rov ham, kalit sxemasi ham BITTA joyda qoladi.
 */
export async function loadFrozenMonthlyCharges(
  prisma: Pick<Prisma.TransactionClient, 'enrollmentMonthlyCharge'>,
  params: FrozenMonthlyPerLessonParams,
): Promise<Map<string, FrozenMonthlyCharge>> {
  const out = new Map<string, FrozenMonthlyCharge>();
  if (
    params.studentIds.length === 0 ||
    params.groupIds.length === 0 ||
    params.periods.length === 0
  ) {
    return out;
  }

  const rows = await prisma.enrollmentMonthlyCharge.findMany({
    where: {
      companyId: params.companyId,
      status: MonthlyChargeStatus.CHARGED,
      studentId: { in: [...new Set(params.studentIds)] },
      groupId: { in: [...new Set(params.groupIds)] },
      OR: params.periods.map((p) => ({
        periodYear: p.year,
        periodMonth: p.month,
      })),
    },
    select: {
      studentId: true,
      groupId: true,
      periodYear: true,
      periodMonth: true,
      perLessonCost: true,
      plannedLessons: true,
      coveredDates: true,
      frozenOutDates: true,
    },
  });

  for (const r of rows) {
    const monthKey = `${r.periodYear}-${String(r.periodMonth).padStart(2, '0')}`;
    out.set(monthlyPerLessonKey(r.studentId, r.groupId, monthKey), {
      perLessonCost: r.perLessonCost,
      plannedLessons: r.plannedLessons,
      coveredDates: r.coveredDates ?? [],
      frozenOutDates: r.frozenOutDates ?? [],
    });
  }
  return out;
}

/**
 * Muzlatilgan dars narxlari xaritasi (hisobot yuzalari uchun).
 *
 * `loadFrozenMonthlyCharges` ning proyeksiyasi — ikkinchi so'rov EMAS.
 */
export async function loadFrozenMonthlyPerLesson(
  prisma: Pick<Prisma.TransactionClient, 'enrollmentMonthlyCharge'>,
  params: FrozenMonthlyPerLessonParams,
): Promise<Map<string, number>> {
  const charges = await loadFrozenMonthlyCharges(prisma, params);
  const out = new Map<string, number>();
  for (const [key, c] of charges) out.set(key, c.perLessonCost);
  return out;
}

/**
 * `[start, end)` oralig'ini qamrab oladigan davrlar ro'yxati (Toshkent).
 *
 * `end` YARIM OCHIQ: aynan oy chegarasiga tushgan `end` keyingi oyni
 * qo'shmasligi kerak.
 */
export function periodsInRange(
  start: Date,
  end: Date,
): { year: number; month: number }[] {
  const first = tashkentDateStr(start).slice(0, 7);
  const last = tashkentDateStr(new Date(end.getTime() - 1)).slice(0, 7);
  const out: { year: number; month: number }[] = [];
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  for (let guard = 0; guard < 120; guard += 1) {
    out.push({ year: y, month: m });
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key >= last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
