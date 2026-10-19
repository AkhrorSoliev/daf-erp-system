import { interpolate, type Params } from "@/i18n/translate";
import { formatNumber } from "@/lib/format-utils";
import type { PaymentModel } from "@/lib/payment-model";

/** `GET /courses/:id` → `schedule`: what the course's running groups add up to. */
export interface CourseSchedule {
  weeklyLessons: number[];
  monthLessons: { min: number; max: number } | null;
}

export interface CourseTermRow {
  label: string;
  value: string;
}

/** Translates a text; the default fills placeholders and keeps the Uzbek source. */
type Translate = (source: string, params?: Params) => string;

/** The price means a month or a cycle; say which. Null: not known yet. */
export function coursePriceLabel(model: PaymentModel | null, t: Translate = interpolate): string {
  if (model === "MONTHLY") return t("Oylik narx");
  if (model === "LESSON_PACK") return t("Sikl narxi");
  return t("Narxi");
}

const money = (n: number) => formatNumber(Math.round(n));

function weekly(counts: number[], t: Translate): string {
  if (counts.length === 0) return t("Guruhlarda dars jadvali yo'q");
  if (counts.length === 1) return t("{n} dars", { n: counts[0] });
  return t("{list} yoki {n} dars", {
    list: counts.slice(0, -1).join(", "),
    n: counts[counts.length - 1],
  });
}

/**
 * The course's money terms, as the payment model reads them. A monthly
 * price is split over the lessons a group has in the month, so lessons a
 * week and a month come from the groups (`schedule`), and the cycle size
 * is left out — monthly billing does not read it.
 */
export function courseTermRows(
  course: {
    paymentModel: PaymentModel;
    price: number;
    lessonPaymentCount: number | null;
  },
  schedule: CourseSchedule | null,
  t: Translate = interpolate,
): CourseTermRow[] {
  const som = (n: number) => t("{amount} so'm", { amount: money(n) });
  const perWeek = {
    label: t("Haftasiga"),
    value: weekly(schedule?.weeklyLessons ?? [], t),
  };

  if (course.paymentModel === "MONTHLY") {
    const out: CourseTermRow[] = [
      { label: coursePriceLabel("MONTHLY", t), value: som(course.price) },
      perWeek,
    ];
    const m = schedule?.monthLessons;
    if (m && m.min > 0) {
      out.push({
        label: t("Oyiga"),
        value:
          m.min === m.max
            ? t("{n} dars", { n: m.min })
            : t("{min}–{max} dars", { min: m.min, max: m.max }),
      });
      out.push({
        label: t("1 dars"),
        value:
          m.min === m.max
            ? som(course.price / m.min)
            : t("≈ {min} – {max} so'm", {
                min: money(course.price / m.max),
                max: money(course.price / m.min),
              }),
      });
    }
    return out;
  }

  const size = course.lessonPaymentCount ?? 0;
  return [
    { label: coursePriceLabel("LESSON_PACK", t), value: som(course.price) },
    { label: t("Sikl darslari"), value: size > 0 ? t("{n} ta", { n: size }) : "—" },
    ...(size > 0 ? [{ label: t("1 dars"), value: som(course.price / size) }] : []),
    perWeek,
  ];
}
