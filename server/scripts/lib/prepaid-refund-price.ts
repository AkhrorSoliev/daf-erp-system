/**
 * Bitta dars narxi — migratsiya oldindan hisobotidagi prepaid qaytarish
 * uchun (`MigrationRow.packPerLessonCost`).
 *
 * `EnrollmentBillingService.prepaidRefundValue` bilan BIR XIL ustuvorlik
 * zanjiri (`src/billing/enrollment-billing.service.ts`):
 *   1) Eng so'nggi bekor qilinmagan LESSON_DEDUCTION BATCH'ining o'z
 *      summasidan `cycleCostFor` orqali — bu chegirmani VA sikl yaxlitlash
 *      qoldig'ini bir yo'la to'g'ri hisoblaydi (`batchAmount` allaqachon
 *      chegirmali summa, deduction yozilganda hisoblangan).
 *   2) Batch ma'lumoti yo'q yoki mos kelmasa — metadata'dagi
 *      `perLessonCost` (agar bo'lsa) yoki kurs narxi / lessonPaymentCount.
 *      IKKALASI HAM CHEGIRMASIZ — bu haqiqiy `resolvePerLessonCost`
 *      xatti-harakati bilan bir xil: metadata.perLessonCost har doim
 *      to'liq (chegirmasiz) narx sifatida yoziladi
 *      (`lesson-billing.service.ts`dagi izoh: "keeps perLessonCost at the
 *      full, un-discounted rate"), va faqat `amount` chegirmali bo'ladi.
 *
 * MigrationRow bitta "bir dars narxi" maydonini talab qiladi
 * (`prepaidRefund = prepaidLessons * packPerLessonCost`), real refund esa
 * TOTAL summa (`batchAmount - cycleCostFor(...)`) — shuning uchun bu yerda
 * avval TOTAL hisoblanadi, keyin `remaining`ga bo'linib bitta stavkaga
 * aylantiriladi. Bo'linish ba'zida bir necha so'm yaxlitlash farqi
 * qoldiradi (masalan sikl oxirgi darsi qoldirilganda), lekin CHEGIRMANI
 * E'TIBORGA OLMASLIK xatosi (50% chegirmali o'quvchida 2x ortiqcha
 * ko'rsatilgan) butunlay yo'qoladi — bu asosiy tuzatish edi.
 */

import { cycleCostFor } from '../../src/billing/lesson-price';

export interface PrepaidRefundBatch {
  /** Eng so'nggi LESSON_DEDUCTION'ning summasi (ishorasidan qat'i nazar). */
  amount: number;
  /** metadata.lessonsCovered — batch nechta darsni qoplagan. */
  lessonsCovered?: number;
  /** metadata.perLessonCost — ATAYLAB chegirmasiz (yozilgan joyidagi izohga qarang). */
  perLessonCost?: number;
}

export interface PrepaidRefundInput {
  /** Qolgan (hali sarflanmagan) prepaid darslar soni. */
  remaining: number;
  course: { price: number; lessonPaymentCount: number | null };
  /** Eng so'nggi bekor qilinmagan LESSON_DEDUCTION — bo'lmasa `undefined`. */
  batch?: PrepaidRefundBatch | null;
}

/** Bitta dars uchun qaytariladigan summa — pastdagi izohdagi ustuvorlik bilan. */
export function resolvePackPerLessonCost(input: PrepaidRefundInput): number {
  const { remaining, course, batch } = input;
  if (remaining <= 0) return 0;

  const batchLessons = batch?.lessonsCovered ?? 0;
  const batchAmount = batch?.amount ? Math.abs(batch.amount) : 0;

  if (batchLessons > 0 && batchAmount > 0 && remaining <= batchLessons) {
    const consumed = batchLessons - remaining;
    const refund =
      batchAmount - cycleCostFor(batchAmount, batchLessons, consumed);
    return Math.round(refund / remaining);
  }

  if (batch?.perLessonCost && batch.perLessonCost > 0) {
    return batch.perLessonCost;
  }

  const lessonPaymentCount = course.lessonPaymentCount || 12;
  return Math.round(course.price / lessonPaymentCount);
}
