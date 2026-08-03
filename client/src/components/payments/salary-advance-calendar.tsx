"use client";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format-utils";
import type { AdvanceDay } from "./salary-advances-tab";

const WEEKDAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

/**
 * To'rt pog'onali amber shkala — katakning oydagi eng katta kunga nisbati.
 * Rang YAGONA signal emas: summa har doim raqam bilan ham yozilgan.
 */
const TONES = [
  "bg-amber-50 dark:bg-amber-950/30",
  "bg-amber-100 dark:bg-amber-900/40",
  "bg-amber-200 dark:bg-amber-800/50",
  "bg-amber-300 dark:bg-amber-700/60",
];

function toneFor(total: number, max: number): string {
  if (max <= 0) return TONES[0];
  const ratio = total / max;
  if (ratio > 0.75) return TONES[3];
  if (ratio > 0.5) return TONES[2];
  if (ratio > 0.25) return TONES[1];
  return TONES[0];
}

/** Millionni qisqartirib yozadi: 2 200 000 → "2.2M", 800 000 → "800K". */
function compact(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return formatPrice(amount);
}

/**
 * Oy setkasi: har bir kun katagida o'sha kunning jami avansi.
 * Sof ko'rsatish komponenti — o'zi ma'lumot olmaydi, holat tutmaydi.
 */
export function SalaryAdvanceCalendar({
  month,
  days,
  selectedDate,
  onSelect,
}: {
  month: string;
  days: AdvanceDay[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  const [year, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  // getUTCDay: Yakshanba=0. Dushanbadan boshlanadigan setkaga o'tkazamiz.
  const firstWeekday = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;

  const byDate = new Map(days.map((d) => [d.date, d]));
  const max = days.reduce((acc, d) => Math.max(acc, d.total), 0);

  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (date === null) return <div key={`pad-${i}`} />;
          const day = byDate.get(date);
          const dayNum = Number(date.slice(-2));
          const selected = selectedDate === date;

          return (
            <button
              key={date}
              type="button"
              disabled={!day}
              onClick={() => onSelect(date)}
              aria-label={
                day
                  ? `${dayNum}-kun, ${formatPrice(day.total)} so'm avans`
                  : `${dayNum}-kun, avans yo'q`
              }
              aria-pressed={selected}
              className={cn(
                "flex min-h-[56px] flex-col items-start rounded-md border p-1.5 text-left transition-colors",
                day
                  ? cn(
                      toneFor(day.total, max),
                      "cursor-pointer hover:brightness-95",
                    )
                  : "cursor-not-allowed border-dashed opacity-60",
                selected && "ring-2 ring-primary ring-offset-1",
              )}
            >
              <span className="text-xs tabular-nums text-muted-foreground">
                {dayNum}
              </span>
              {day && (
                <span className="mt-auto text-xs font-semibold tabular-nums">
                  {compact(day.total)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
