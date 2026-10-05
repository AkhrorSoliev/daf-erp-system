import { formatPrice } from "@/lib/format-utils";
import type { LessonAdmission } from "./attendance-form-utils";

const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/**
 * The students a register can ask a mark for. Contract 3.2 keeps a blocked
 * student out of the lesson (only «Sababli» can be recorded), so «Barchasiga —
 * Keldi» skips them and they never count as unmarked. Without an `admission`
 * (an older server) a student is admitted.
 */
export function markableStudents<S extends { admission?: LessonAdmission }>(
  students: S[],
): S[] {
  return students.filter((s) => s.admission?.admitted !== false);
}

/**
 * What the payment dialog suggests for a blocked student: the least that
 * admits them, rounded up to a whole 1 000 so'm (never below 1 000).
 */
export function suggestedPaymentAmount(
  admission: LessonAdmission | undefined,
): number | undefined {
  if (!admission) return undefined;
  return Math.max(1000, Math.ceil(admission.shortfall / 1000) * 1000);
}

/**
 * The row's label for a blocked student: by what he has paid of the month,
 * not by which rule keeps him out — from 01.11 a student who paid nothing is
 * kept out by the least share, and late in the month one who paid 40% by the
 * lessons held. Without `reach` (an older server) the reason decides.
 */
function blockedLabel(admission: LessonAdmission): string {
  const reach = admission.reach;
  if (!reach) {
    return admission.reason === "BELOW_MIN_SHARE"
      ? `Oy to'lovining ${admission.minPaidPercent}% i to'lanmagan · darsga qo'yilmaydi`
      : "To'lov qilinmagan · darsga qo'yilmaydi";
  }
  if (reach.monthPaid <= 0) return "To'lov qilinmagan · darsga qo'yilmaydi";
  if (admission.reason === "BELOW_MIN_SHARE") {
    // Rounded down, so 49.6% never reads as the 50% asked for.
    const paid = Math.max(
      1,
      Math.floor((reach.monthPaid * 100) / reach.monthCharged),
    );
    return `Oyning ${paid}% i to'langan · kamida ${admission.minPaidPercent}% kerak · darsga qo'yilmaydi`;
  }
  return reach.lastPaid
    ? `Qisman to'lagan · puli ${ddmm(reach.lastPaid)} gacha yetdi · darsga qo'yilmaydi`
    : "Qisman to'lagan · darsga qo'yilmaydi";
}

/** The row's label for an admitted student; null when nothing is owed this month. */
function admittedLabel(
  admission: LessonAdmission,
  isAdmin: boolean,
): string | null {
  const reach = admission.reach;
  if (!reach) {
    return admission.paidThrough
      ? `Qisman to'lagan · ${ddmm(admission.paidThrough)} gacha qatnasha oladi`
      : null;
  }
  // The month is paid; a debt on the balance is a later month's.
  if (reach.paidLessons >= reach.lessons) return null;
  if (admission.paidThrough) {
    return `Qisman to'lagan · ${reach.lessons} darsdan ${reach.paidLessons} tasi · ${ddmm(admission.paidThrough)} gacha`;
  }
  // The month's free first lesson, and the money does not reach the next.
  if (admission.reason === "FIRST_LESSON" && reach.next) {
    return isAdmin
      ? `1-dars to'lovsiz · keyingi dars (${ddmm(reach.next.date)}) uchun kamida ${formatPrice(reach.next.needed)} so'm kerak`
      : "1-dars to'lovsiz · keyingi darsdan to'lov kerak";
  }
  return null;
}

/** What a roster row says about contract 3.2 admission (ADR-0047). */
export function admissionCopy(
  admission: LessonAdmission | undefined,
  isAdmin: boolean,
): { blocked: boolean; label: string | null; warning: string | null } {
  if (!admission) return { blocked: false, label: null, warning: null };
  // After the lesson: no payment lets him into it, so no payment prompt.
  if (admission.reason === "LEFT_OUT") {
    return {
      blocked: true,
      label: "Dars vaqtida davomatga kiritilmagan",
      warning: null,
    };
  }
  if (admission.reason === "BELOW_MIN_SHARE") {
    const share = `${admission.minPaidPercent}%`;
    return {
      blocked: true,
      label: blockedLabel(admission),
      warning: isAdmin
        ? `Bu darsga kirishi uchun kamida ${formatPrice(admission.shortfall)} so'm kerak: oy to'lovining ${share} i to'lanishi shart. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.`
        : `Bu o'quvchi oy to'lovining kamida ${share} ini to'lamagan. Shartnomaga ko'ra 2-darsdan boshlab shu qismi to'lanmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.`,
    };
  }
  if (!admission.admitted) {
    return {
      blocked: true,
      label: blockedLabel(admission),
      warning: isAdmin
        ? `Bu darsga kirishi uchun kamida ${formatPrice(admission.shortfall)} so'm kerak. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.`
        : "Bu o'quvchi oylik to'lovni qilmagan. Shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.",
    };
  }
  return {
    blocked: false,
    label: admittedLabel(admission, isAdmin),
    warning: null,
  };
}
