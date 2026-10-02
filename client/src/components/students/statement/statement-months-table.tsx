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
import type {
  DuesTotalView,
  DueView,
  LessonDay,
  Segment,
} from "./statement-types";
import { LESSON_STATUS, TONE_TEXT, dayMonth } from "./statement-utils";
import { Segments } from "./statement-segments";

const AMOUNT = "text-right font-mono tabular-nums";

/**
 * "Oylar bo'yicha": one row per month (and per charge that is not a lesson)
 * with its price, what the payments covered of it and what is still owed;
 * the total row is the debt the answer states. Clicking a month opens its
 * lesson days. The table is a whole-course summary, so it is not paginated.
 */
export function StatementMonthsTable({
  dues,
  total,
  surplus,
  lessonDays,
  sharpNote,
}: {
  dues: DueView[];
  total: DuesTotalView | null;
  surplus: { label: string; amount: string } | null;
  lessonDays: Record<string, LessonDay[]>;
  sharpNote: Segment[] | null;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">Oy</TableHead>
            <TableHead>Darslar</TableHead>
            <TableHead className="text-right">Narxi</TableHead>
            <TableHead className="text-right">To&apos;langan</TableHead>
            <TableHead className="text-right">Qarz</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dues.map((d, i) => {
            const days = d.key ? (lessonDays[d.key] ?? []) : [];
            const note = d.highlight && d.bold ? sharpNote : null;
            const canOpen = days.length > 0 || note !== null;
            const rowKey = d.key ?? `due-${i}`;
            const isOpen = open === rowKey;
            const groups = new Set(days.map((x) => x.group));
            const toggle = () => setOpen(isOpen ? null : rowKey);
            return (
              <Fragment key={rowKey}>
                <TableRow
                  data-month={d.key ?? undefined}
                  className={cn(
                    d.highlight &&
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
                  <TableCell colSpan={d.wide ? 2 : 1} className="align-top">
                    <div className="flex items-center gap-1.5">
                      <ChevronRight
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-90",
                          !canOpen && "invisible",
                        )}
                      />
                      <span className={d.bold ? "font-semibold" : "font-medium"}>
                        {d.label}
                      </span>
                    </div>
                  </TableCell>
                  {!d.wide && (
                    <TableCell className="whitespace-normal align-top">
                      {d.lessons}
                      {d.lessonsNote && (
                        <span className="text-xs text-muted-foreground">
                          {" · "}
                          {d.lessonsNote}
                        </span>
                      )}
                      {d.details.map((line, n) => (
                        <p key={n} className="text-xs text-muted-foreground">
                          {line}
                        </p>
                      ))}
                    </TableCell>
                  )}
                  <TableCell className={cn(AMOUNT, "align-top")}>
                    {d.cost ?? (
                      <span className="font-sans text-xs text-muted-foreground">
                        {d.costNote}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cn(AMOUNT, "align-top")}>
                    {d.paid}
                  </TableCell>
                  <TableCell
                    className={cn(
                      AMOUNT,
                      "align-top font-semibold",
                      TONE_TEXT[d.leftTone],
                    )}
                  >
                    {d.left}
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="bg-muted/30">
                      <MonthDetails
                        note={note}
                        days={days}
                        showGroup={groups.size > 1}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {total && (
            <TableRow className="border-t-2 font-semibold hover:bg-transparent">
              <TableCell colSpan={2}>
                Jami
                {total.details.map((line, n) => (
                  <p
                    key={n}
                    className="text-xs font-normal text-muted-foreground"
                  >
                    {line}
                  </p>
                ))}
              </TableCell>
              <TableCell className={cn(AMOUNT, "align-top")}>
                {total.cost}
              </TableCell>
              <TableCell className={cn(AMOUNT, "align-top")}>
                {total.paid}
              </TableCell>
              <TableCell
                className={cn(AMOUNT, "align-top", TONE_TEXT[total.leftTone])}
              >
                {total.left}
              </TableCell>
            </TableRow>
          )}
          {surplus && (
            <TableRow className="font-semibold hover:bg-transparent">
              <TableCell colSpan={4}>{surplus.label}</TableCell>
              <TableCell className={cn(AMOUNT, TONE_TEXT.green)}>
                {surplus.amount}
              </TableCell>
            </TableRow>
          )}
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

/** What a month row opens: why it differs sharply, then its lesson days. */
export function MonthDetails({
  note,
  days,
  showGroup,
}: {
  note: Segment[] | null;
  days: LessonDay[];
  showGroup: boolean;
}) {
  return (
    <div className="sticky left-0 max-w-[calc(100vw-5rem)] space-y-2 whitespace-normal sm:max-w-none">
      {note && (
        <p className="text-sm text-yellow-900 dark:text-yellow-300">
          <Segments segments={note} />
        </p>
      )}
      {days.length > 0 && <LessonDayChips days={days} showGroup={showGroup} />}
    </div>
  );
}
