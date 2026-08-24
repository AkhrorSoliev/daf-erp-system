"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

interface DiscountPreview {
  currentDiscountPercent: number;
  newDiscountPercent: number;
  adjustmentAmount: number;
  lessonCount: number;
  oldestLessonDate: string | null;
}

/**
 * Says what saving this discount will actually do, before it is saved.
 *
 * The field used to carry the sentence "O'zgarish keyingi darslarga ta'sir
 * qiladi — eski darslar qayta hisoblanmaydi", which is the OPPOSITE of the
 * behaviour: `applyRetroactiveDiscountAdjustment` recomputes every past lesson
 * charge on the student and books one signed `DISCOUNT_ADJUSTMENT`. In
 * production that has moved 1 473 807 so'm across 7 students — one of them
 * 449 995 so'm reaching back 41 lessons — while the person clicking Save was
 * being told the past would not move.
 *
 * The amount alone is not the surprising part; the REACH is. So the count of
 * lessons and the oldest one are shown next to it.
 *
 * The number comes from the server's own `computeDiscountAdjustment`, the same
 * function the write path calls, so the preview cannot disagree with what
 * happens. A failed preview says nothing rather than guessing — a wrong figure
 * here would be worse than the sentence it replaced.
 */
export function DiscountChangePreview({
  studentId,
  value,
  currentDiscount,
}: {
  studentId: number;
  value: number | undefined;
  currentDiscount: number;
}) {
  const debounced = useDebouncedValue(value, 400);
  const valid =
    typeof debounced === "number" &&
    Number.isFinite(debounced) &&
    debounced >= 0 &&
    debounced <= 100;
  const changed = valid && debounced !== currentDiscount;

  const { data, isFetching, isError } = useQuery<DiscountPreview>({
    queryKey: ["discount-preview", studentId, debounced],
    enabled: changed,
    queryFn: async () => {
      const { data } = await api.get<DiscountPreview>(
        `/students/${studentId}/discount-preview`,
        { params: { discountPercent: debounced } },
      );
      return data;
    },
  });

  if (!changed) {
    return (
      <p className="text-xs text-muted-foreground">
        Chegirma har bir darsda balansdan ushlanadigan summaga qo&apos;llanadi.
      </p>
    );
  }

  if (isFetching) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Ta&apos;siri hisoblanmoqda…
      </p>
    );
  }

  // Silent on failure: the old copy was wrong, and a guess would be worse.
  if (isError || !data) return null;

  if (data.adjustmentAmount === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        O&apos;tgan {data.lessonCount} ta dars uchun hisob o&apos;zgarmaydi.
      </p>
    );
  }

  const credit = data.adjustmentAmount > 0;
  const amount = formatPrice(Math.abs(data.adjustmentAmount));
  const since = data.oldestLessonDate
    ? new Date(data.oldestLessonDate).toLocaleDateString("uz-UZ")
    : null;

  return (
    <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-900 dark:bg-amber-950/40">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
      <div className="space-y-1">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          Bu o&apos;zgarish o&apos;tgan darslarni ham qayta hisoblaydi
        </p>
        <p className="text-amber-800 dark:text-amber-300">
          {data.lessonCount} ta o&apos;tgan dars
          {since ? ` (${since} dan beri)` : ""} qayta hisoblanadi va
          o&apos;quvchi balansidan{" "}
          <span className="font-semibold">
            {amount} {credit ? "qaytariladi" : "yechiladi"}
          </span>
          .
        </p>
      </div>
    </div>
  );
}
