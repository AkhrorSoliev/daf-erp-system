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
 * `EnrollmentMonthlyCharge` dan muzlatilgan dars narxlarini yig'adi.
 *
 * Faqat `CHARGED` qatorlar: bekor qilingan hisob (`REVERSED`) hech qanday
 * daromadni tan olmaydi.
 */
export async function loadFrozenMonthlyPerLesson(
  prisma: Pick<Prisma.TransactionClient, 'enrollmentMonthlyCharge'>,
  params: FrozenMonthlyPerLessonParams,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
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
    },
  });

  for (const r of rows) {
    const monthKey = `${r.periodYear}-${String(r.periodMonth).padStart(2, '0')}`;
    out.set(
      monthlyPerLessonKey(r.studentId, r.groupId, monthKey),
      r.perLessonCost,
    );
  }
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
