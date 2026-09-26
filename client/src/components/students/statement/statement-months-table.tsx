"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { LessonDay, MonthView, Segment } from "./statement-types";
import { LESSON_STATUS, TONE_TEXT, dayMonth } from "./statement-utils";
import { Segments } from "./statement-segments";

const AMOUNT = "text-right font-mono tabular-nums";

/**
 * "Oylar bo'yicha": one row per month. Clicking a row opens that month's
 * lesson days. `lessonDays[key]` comes from the model, in the same order.
 * The table is a whole-course summary, so it is deliberately not paginated.
 */
export function StatementMonthsTable({
  months,
  lessonDays,
  sharpNote,
}: {
  months: MonthView[];
  lessonDays: Record<string, LessonDay[]>;
  sharpNote: Segment[] | null;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">Oy</TableHead>
            <TableHead>Darslar</TableHead>
            <TableHead className="text-right">Darslar narxi</TableHead>
            <TableHead className="text-right">To&apos;langan</TableHead>
            <TableHead className="text-right">Oy oxirida</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {months.map((m) => {
            const days = lessonDays[m.key] ?? [];
            const canOpen = days.length > 0;
            const isOpen = open === m.key;
            const groups = new Set(days.map((d) => d.group));
            const toggle = () => setOpen(isOpen ? null : m.key);
            return (
              <Fragment key={m.key}>
                <TableRow
                  data-month={m.key}
                  className={cn(
                    m.highlight &&
                      "bg-yellow-50 hover:bg-yellow-100/70 dark:bg-yellow-950/20 dark:hover:bg-yellow-950/30",
                    canOpen && "cursor-pointer",
                  )}
                  onClick={canOpen ? toggle : undefined}
                  onKeyDown={
                    canOpen
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle();
                          }
                        }
                      : undefined
                  }
                  tabIndex={canOpen ? 0 : undefined}
                  aria-expanded={canOpen ? isOpen : undefined}
                >
                  <TableCell className="align-top">
                    <div className="flex items-start gap-1.5">
                      <ChevronRight
                        className={cn(
                          "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-90",
                          !canOpen && "invisible",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="font-medium">{m.label}</p>
                        {m.details.map((d, i) => (
                          <p
                            key={i}
                            className="text-xs whitespace-normal text-muted-foreground"
                          >
                            {d}
                          </p>
                        ))}
                        {m.highlight && m.isLast && sharpNote && (
                          <p className="mt-1 text-xs whitespace-normal text-yellow-900 dark:text-yellow-300">
                            <Segments segments={sharpNote} />
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap">
                    {m.lessons}
                    {m.absent && (
                      <span className="text-red-600 dark:text-red-400">
                        {" · "}
                        {m.absent}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cn(AMOUNT, "align-top")}>
                    {m.cost ?? (
                      <span className="font-sans text-xs text-muted-foreground">
                        {m.costNote}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cn(AMOUNT, "align-top")}>
                    {m.money}
                  </TableCell>
                  <TableCell
                    className={cn(
                      AMOUNT,
                      "align-top font-semibold",
                      TONE_TEXT[m.runningTone],
                    )}
                  >
                    {m.running}
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="bg-muted/30">
                      <LessonDayChips days={days} showGroup={groups.size > 1} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function LessonDayChips({
  days,
  showGroup,
}: {
  days: LessonDay[];
  showGroup: boolean;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5 whitespace-normal">
      {days.map((d) => {
        const s = LESSON_STATUS[d.status];
        return (
          <li
            key={`${d.group}-${d.day}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
              s.className,
            )}
          >
            <span className="font-mono tabular-nums">{dayMonth(d.day)}</span>
            {showGroup && <span className="opacity-70">{d.group}</span>}
            <span>· {s.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
