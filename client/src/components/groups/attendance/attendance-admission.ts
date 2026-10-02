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
      label: `Oy to'lovining ${share} i to'lanmagan · darsga qo'yilmaydi`,
      warning: isAdmin
        ? `Bu darsga kirishi uchun kamida ${formatPrice(admission.shortfall)} so'm kerak: oy to'lovining ${share} i to'lanishi shart. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.`
        : `Bu o'quvchi oy to'lovining kamida ${share} ini to'lamagan. Shartnomaga ko'ra 2-darsdan boshlab shu qismi to'lanmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.`,
    };
  }
  if (!admission.admitted) {
    return {
      blocked: true,
      label: "To'lov qilinmagan · darsga qo'yilmaydi",
      warning: isAdmin
        ? `Bu darsga kirishi uchun kamida ${formatPrice(admission.shortfall)} so'm kerak. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.`
        : "Bu o'quvchi oylik to'lovni qilmagan. Shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.",
    };
  }
  if (admission.paidThrough) {
    return {
      blocked: false,
      label: `Qisman to'lagan · ${ddmm(admission.paidThrough)} gacha qatnasha oladi`,
      warning: null,
    };
  }
  return { blocked: false, label: null, warning: null };
}
