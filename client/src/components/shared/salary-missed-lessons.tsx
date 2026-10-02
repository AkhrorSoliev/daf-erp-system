import { CalendarX2, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/format-utils";
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
  if (data.lessons.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300">
              <CalendarX2 className="size-4" />
              Berilmadi — davomat olinmagan darslar ({missedLessonsCount(data)})
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Dars tugaguncha davomat olinmagan. Bu darslar uchun ish haqi
              yozilmaydi: summa — o&apos;sha kuni to&apos;lagan o&apos;quvchilar
              bo&apos;yicha ustoz ulushi.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-sm font-bold tabular-nums text-red-700 dark:text-red-300">
          −{formatPrice(data.total)} so&apos;m
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
                {l.students} o&apos;quvchi
              </span>
            </span>
            <span className="tabular-nums">{formatPrice(l.amount)} so&apos;m</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
