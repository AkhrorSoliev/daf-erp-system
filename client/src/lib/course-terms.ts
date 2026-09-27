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

/** The price means a month or a cycle; say which. Null: not known yet. */
export function coursePriceLabel(model: PaymentModel | null): string {
  if (model === "MONTHLY") return "Oylik narx";
  if (model === "LESSON_PACK") return "Sikl narxi";
  return "Narxi";
}

const som = (n: number) => `${formatNumber(Math.round(n))} so'm`;

function weekly(counts: number[]): string {
  if (counts.length === 0) return "Guruhlarda dars jadvali yo'q";
  if (counts.length === 1) return `${counts[0]} dars`;
  return `${counts.slice(0, -1).join(", ")} yoki ${counts[counts.length - 1]} dars`;
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
): CourseTermRow[] {
  const perWeek = {
    label: "Haftasiga",
    value: weekly(schedule?.weeklyLessons ?? []),
  };

  if (course.paymentModel === "MONTHLY") {
    const out: CourseTermRow[] = [
      { label: coursePriceLabel("MONTHLY"), value: som(course.price) },
      perWeek,
    ];
    const m = schedule?.monthLessons;
    if (m && m.min > 0) {
      out.push({
        label: "Oyiga",
        value: m.min === m.max ? `${m.min} dars` : `${m.min}–${m.max} dars`,
      });
      out.push({
        label: "1 dars",
        value:
          m.min === m.max
            ? som(course.price / m.min)
            : `≈ ${formatNumber(Math.round(course.price / m.max))} – ${som(course.price / m.min)}`,
      });
    }
    return out;
  }

  const size = course.lessonPaymentCount ?? 0;
  return [
    { label: coursePriceLabel("LESSON_PACK"), value: som(course.price) },
    { label: "Sikl darslari", value: size > 0 ? `${size} ta` : "—" },
    ...(size > 0 ? [{ label: "1 dars", value: som(course.price / size) }] : []),
    perWeek,
  ];
}
