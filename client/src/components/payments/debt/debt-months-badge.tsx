"use client";

import { Layers } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { monthLabel } from "../salary-utils";

export interface DebtMonthSlice {
  monthKey: string;
  amount: number;
}

interface Props {
  studentName: string;
  /** Origin month → still-unpaid amount. Disjoint; sums to `totalDebt`. */
  months: DebtMonthSlice[];
  totalDebt: number;
  /** Renders in bold and labelled, when one month is the reader's context. */
  highlightMonthKey?: string;
  className?: string;
}

/**
 * "This debt is not from one month" — a count, with the split behind it.
 *
 * The marker exists because every screen that shows a debt shows ONE number,
 * and on production 168 of 422 debtors owe across several months. Without it a
 * reader takes the figure in front of them for the whole story: the center
 * top-up list says July, the monthly table says the month that was opened, and
 * the student is actually five months behind.
 *
 * It renders nothing for a single-month debt. A badge that always appears
 * carries no information; one that appears only when the debt is spread means
 * something the moment it is seen.
 */
export function DebtMonthsBadge({
  studentName,
  months,
  totalDebt,
  highlightMonthKey,
  className,
}: Props) {
  if (months.length < 2) return null;

  const sorted = [...months].sort((a, b) =>
    a.monthKey < b.monthKey ? -1 : 1,
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-help items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
              className,
            )}
          >
            <Layers className="size-3" />
            {sorted.length} oy
          </span>
        </TooltipTrigger>
        {/* The base TooltipContent is an `inline-flex` ROW on a DARK surface
            (`bg-foreground text-background`), so stacked blocks land side by
            side and muted tones vanish. `flex-col items-stretch` restores the
            stack; the greys are expressed against the dark background. */}
        <TooltipContent className="w-64 flex-col items-stretch gap-0 p-0">
          <div className="border-b border-background/20 px-3 py-2">
            <p className="text-xs font-semibold">{studentName}</p>
            <p className="text-[11px] text-background/70">
              To&apos;lanmagan qarzi qaysi oyda paydo bo&apos;lgan
            </p>
          </div>
          <div className="px-3 py-2">
            {sorted.map((o) => {
              const isCurrent = o.monthKey === highlightMonthKey;
              return (
                <div
                  key={o.monthKey}
                  className={cn(
                    "flex items-baseline justify-between gap-3 py-0.5 text-xs",
                    isCurrent && "font-semibold",
                  )}
                >
                  <span>
                    {monthLabel(o.monthKey)}
                    {isCurrent && (
                      <span className="ml-1 font-normal text-background/70">
                        (ochilgan oy)
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatPrice(o.amount)}</span>
                </div>
              );
            })}
            <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-background/20 pt-1.5 text-xs font-semibold">
              <span>Jami qarzi</span>
              <span className="tabular-nums">{formatPrice(totalDebt)}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
