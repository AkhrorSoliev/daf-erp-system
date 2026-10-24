"use client";

import { CalendarX2, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/format-utils";
import { useT } from "@/i18n/context";
import {
  missedLessonDate,
  missedLessonsCount,
  type MissedLessons,
} from "./salary-missed-lessons-text";

/**
 * «Berilmadi»: the month's lessons that ended with no attendance, each with
 * the pay the teacher lost on it. Every figure comes from the server; this
 * only lays them out. Drawn only when there is at least one such lesson.
 */
export function SalaryMissedLessons({ data }: { data: MissedLessons }) {
  const t = useT();
  if (data.lessons.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300">
              <CalendarX2 className="size-4" />
              {t("Berilmadi — davomat olinmagan darslar ({count})", { count: missedLessonsCount(data, t) })}
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              {t(
                "Dars tugaguncha davomat olinmagan. Bu darslar uchun ish haqi yozilmaydi: summa — o'sha kuni to'lagan o'quvchilar bo'yicha ustoz ulushi.",
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-sm font-bold tabular-nums text-red-700 dark:text-red-300">
          −{formatPrice(data.total)} {t("so'm")}
        </span>
      </div>
      <ul className="divide-y divide-red-100 text-sm dark:divide-red-900/30">
        {data.lessons.map((l) => (
          <li
            key={`${l.groupId}-${l.date}`}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5"
          >
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="tabular-nums text-muted-foreground">
                {missedLessonDate(l.date)}
              </span>
              <span className="font-medium">{l.groupName}</span>
              <span className="text-muted-foreground">
                {t("{n} o'quvchi", { n: l.students })}
              </span>
            </span>
            <span className="tabular-nums">{formatPrice(l.amount)} {t("so'm")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
