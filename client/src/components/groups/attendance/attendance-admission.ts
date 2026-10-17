import { interpolate, type Params } from "@/i18n/translate";
import { formatPrice } from "@/lib/format-utils";
import type { LessonAdmission } from "./attendance-form-utils";

/** The page's `t` from `useT()`; without it the Uzbek source is read as written. */
type Translate = (source: string, params?: Params) => string;

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
function blockedLabel(admission: LessonAdmission, t: Translate): string {
  const reach = admission.reach;
  if (!reach) {
    return admission.reason === "BELOW_MIN_SHARE"
      ? t("Oy to'lovining {percent}% i to'lanmagan · darsga qo'yilmaydi", {
          percent: String(admission.minPaidPercent),
        })
      : t("To'lov qilinmagan · darsga qo'yilmaydi");
  }
  if (reach.monthPaid <= 0) return t("To'lov qilinmagan · darsga qo'yilmaydi");
  if (admission.reason === "BELOW_MIN_SHARE") {
    // Rounded down, so 49.6% never reads as the 50% asked for.
    const paid = Math.max(
      1,
      Math.floor((reach.monthPaid * 100) / reach.monthCharged),
    );
    return t(
      "Oyning {paid}% i to'langan · kamida {percent}% kerak · darsga qo'yilmaydi",
      { paid, percent: String(admission.minPaidPercent) },
    );
  }
  return reach.lastPaid
    ? t("Qisman to'lagan · puli {date} gacha yetdi · darsga qo'yilmaydi", {
        date: ddmm(reach.lastPaid),
      })
    : t("Qisman to'lagan · darsga qo'yilmaydi");
}

/** The row's label for an admitted student; null when nothing is owed this month. */
function admittedLabel(
  admission: LessonAdmission,
  isAdmin: boolean,
  t: Translate,
): string | null {
  const reach = admission.reach;
  if (!reach) {
    return admission.paidThrough
      ? t("Qisman to'lagan · {date} gacha qatnasha oladi", {
          date: ddmm(admission.paidThrough),
        })
      : null;
  }
  // The month is paid; a debt on the balance is a later month's.
  if (reach.paidLessons >= reach.lessons) return null;
  if (admission.paidThrough) {
    return t("Qisman to'lagan · {lessons} darsdan {paid} tasi · {date} gacha", {
      lessons: reach.lessons,
      paid: reach.paidLessons,
      date: ddmm(admission.paidThrough),
    });
  }
  // The month's free first lesson, and the money does not reach the next.
  if (admission.reason === "FIRST_LESSON" && reach.next) {
    return isAdmin
      ? t(
          "1-dars to'lovsiz · keyingi dars ({date}) uchun kamida {amount} so'm kerak",
          { date: ddmm(reach.next.date), amount: formatPrice(reach.next.needed) },
        )
      : t("1-dars to'lovsiz · keyingi darsdan to'lov kerak");
  }
  return null;
}

/**
 * What a roster row says about contract 3.2 admission (ADR-0047). `t` is the
 * page's `useT()`; without it the Uzbek source is read as written.
 */
export function admissionCopy(
  admission: LessonAdmission | undefined,
  isAdmin: boolean,
  t: Translate = interpolate,
): { blocked: boolean; label: string | null; warning: string | null } {
  if (!admission) return { blocked: false, label: null, warning: null };
  // After the lesson: no payment lets him into it, so no payment prompt.
  if (admission.reason === "LEFT_OUT") {
    return {
      blocked: true,
      label: t("Dars vaqtida davomatga kiritilmagan"),
      warning: null,
    };
  }
  if (admission.reason === "BELOW_MIN_SHARE") {
    const amount = formatPrice(admission.shortfall);
    const percent = String(admission.minPaidPercent);
    return {
      blocked: true,
      label: blockedLabel(admission, t),
      warning: isAdmin
        ? t(
            "Bu darsga kirishi uchun kamida {amount} so'm kerak: oy to'lovining {percent}% i to'lanishi shart. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.",
            { amount, percent },
          )
        : t(
            "Bu o'quvchi oy to'lovining kamida {percent}% ini to'lamagan. Shartnomaga ko'ra 2-darsdan boshlab shu qismi to'lanmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.",
            { percent },
          ),
    };
  }
  if (!admission.admitted) {
    return {
      blocked: true,
      label: blockedLabel(admission, t),
      warning: isAdmin
        ? t(
            "Bu darsga kirishi uchun kamida {amount} so'm kerak. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.",
            { amount: formatPrice(admission.shortfall) },
          )
        : t(
            "Bu o'quvchi oylik to'lovni qilmagan. Shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.",
          ),
    };
  }
  return {
    blocked: false,
    label: admittedLabel(admission, isAdmin, t),
    warning: null,
  };
}
