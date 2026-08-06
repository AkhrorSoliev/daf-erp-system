"use client";

import { format } from "date-fns";
import { BookOpen } from "lucide-react";
import { formatNumber } from "@/lib/format-utils";
import type { StudentTransaction } from "./student-profile-tabs-utils";

/**
 * A run of consecutive lesson deductions, collapsed to what actually varies.
 *
 * A student billed one lesson at a time produces a dozen rows a month that are
 * identical except for the date — the SAME "−33 333" printed eight times. As
 * full cards that was a wall nobody scans; even as a dense list, the repeated
 * amount carried no information. So identical single-lesson charges merge into
 * one line that states the unit price once ("7 dars × 33 333") and shows the
 * dates as chips underneath. Nothing is hidden — the dates are still all there.
 *
 * Two things do NOT merge, because they mean something different:
 *   - a multi-lesson cycle batch (its own line, with the covered range)
 *   - a reversal (money coming back)
 *
 * Only CONSECUTIVE deductions group at all (see `segmentEvents`), and within a
 * run only ADJACENT rows with the same signature merge — so the feed stays
 * strictly chronological and a price change mid-month splits into two lines
 * rather than being averaged away.
 */

/** Rows carry no "so'm" suffix — the group header states the unit once. */
const money = (n: number) => formatNumber(n);
const dayOf = (iso: string) => format(new Date(iso), "dd.MM");

export type FeedSegment =
  | { kind: "lessons"; rows: StudentTransaction[] }
  | { kind: "event"; row: StudentTransaction };

/**
 * Split a month's feed into deduction runs and standalone events.
 *
 * Grouping every deduction in the month would reorder the story around the
 * payments that explain it, so only ADJACENT deductions merge.
 */
export function segmentEvents(events: StudentTransaction[]): FeedSegment[] {
  const segments: FeedSegment[] = [];
  for (const t of events) {
    if (t.type !== "LESSON_DEDUCTION") {
      segments.push({ kind: "event", row: t });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last && last.kind === "lessons") last.rows.push(t);
    else segments.push({ kind: "lessons", rows: [t] });
  }
  return segments;
}

const capacityOf = (t: StudentTransaction) =>
  t.coverage?.capacity ?? t.metadata?.lessonsCovered ?? 0;

/** The lesson this row paid for — falls back to the booking date. */
const lessonDateOf = (t: StudentTransaction) =>
  t.coverage?.firstCoveredDate ?? t.createdAt;

type Chunk =
  | {
      kind: "lessons";
      /** Per-lesson price — identical across `rows` by construction. */
      unit: number;
      pending: boolean;
      rows: StudentTransaction[];
    }
  | { kind: "batch"; row: StudentTransaction }
  | { kind: "back"; rows: StudentTransaction[] };

/**
 * Merge signature. Rows only collapse together when every visible fact about
 * them would be identical, so merging can never hide a difference.
 */
function signatureOf(t: StudentTransaction): string {
  // A positive LESSON_DEDUCTION is a reversal's counter-row — money coming
  // BACK. It used to render red and unsigned, reading as another charge.
  if (t.amount > 0) return `back:${t.amount}`;
  if (capacityOf(t) > 1) return `batch:${t.id}`; // never merges
  return `lessons:${t.amount}:${!t.coverage?.firstCoveredDate}`;
}

function chunkRun(rows: StudentTransaction[]): Chunk[] {
  const chunks: Chunk[] = [];
  let lastSignature: string | null = null;

  for (const t of rows) {
    const signature = signatureOf(t);
    const previous = chunks[chunks.length - 1];

    if (signature === lastSignature && previous) {
      if (previous.kind === "lessons") previous.rows.push(t);
      else if (previous.kind === "back") previous.rows.push(t);
      continue;
    }
    lastSignature = signature;

    if (t.amount > 0) chunks.push({ kind: "back", rows: [t] });
    else if (capacityOf(t) > 1) chunks.push({ kind: "batch", row: t });
    else
      chunks.push({
        kind: "lessons",
        unit: Math.abs(t.amount),
        pending: !t.coverage?.firstCoveredDate,
        rows: [t],
      });
  }
  return chunks;
}

/** Dates read oldest → newest, the order the lessons actually happened in. */
function DateChips({ rows }: { rows: StudentTransaction[] }) {
  const days = rows
    .map((t) => new Date(lessonDateOf(t)))
    .sort((a, b) => a.getTime() - b.getTime())
    .map((d) => format(d, "dd.MM"));

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {days.map((day, i) => (
        <span
          key={`${day}-${i}`}
          className="rounded border bg-background px-1.5 py-px font-mono text-[11px] tabular-nums text-muted-foreground"
        >
          {day}
        </span>
      ))}
    </div>
  );
}

function Line({
  label,
  amount,
  positive,
  children,
}: {
  label: React.ReactNode;
  amount: number;
  positive?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm">{label}</span>
        <span
          className={`shrink-0 font-mono text-sm tabular-nums ${
            positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"
          }`}
        >
          {positive ? "+" : "−"}
          {money(Math.abs(amount))}
        </span>
      </div>
      {children}
    </li>
  );
}

export function LessonDeductionGroup({
  rows,
}: {
  rows: StudentTransaction[];
}) {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const chunks = chunkRun(rows);

  return (
    <section className="overflow-hidden rounded-md border bg-muted/30">
      <header className="flex items-baseline justify-between gap-3 border-b bg-muted/50 px-3 py-1.5">
        <span className="flex items-center gap-2 text-xs font-medium">
          <BookOpen className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
          Darslar uchun yechildi
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {total < 0 ? "−" : "+"}
          {money(Math.abs(total))} so&apos;m
        </span>
      </header>

      <ul className="divide-y divide-border/40">
        {chunks.map((chunk, i) => {
          if (chunk.kind === "back") {
            const sum = chunk.rows.reduce((s, r) => s + r.amount, 0);
            return (
              <Line
                key={chunk.rows[0].id}
                positive
                amount={sum}
                label={
                  <>
                    {chunk.rows.length > 1 && `${chunk.rows.length} ta · `}
                    Bekor qilindi
                  </>
                }
              >
                <DateChips rows={chunk.rows} />
              </Line>
            );
          }

          if (chunk.kind === "batch") {
            const t = chunk.row;
            const capacity = capacityOf(t);
            const covered = t.coverage?.coveredCount ?? 0;
            const first = t.coverage?.firstCoveredDate;
            const last = t.coverage?.lastCoveredDate;
            const range =
              first && last && dayOf(first) !== dayOf(last)
                ? `${dayOf(first)} — ${dayOf(last)}`
                : first
                  ? dayOf(first)
                  : null;
            return (
              <Line
                key={t.id}
                amount={t.amount}
                label={
                  <>
                    Sikl · {capacity} dars
                    {covered < capacity && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({covered} tasi o&apos;tilgan)
                      </span>
                    )}
                    {range && (
                      <span className="text-muted-foreground"> · {range}</span>
                    )}
                  </>
                }
              />
            );
          }

          // Identical single-lesson charges — the unit price is stated once.
          const count = chunk.rows.length;
          const sum = chunk.rows.reduce((s, r) => s + r.amount, 0);
          return (
            <Line
              key={`${chunk.rows[0].id}-${i}`}
              amount={sum}
              label={
                chunk.pending ? (
                  <>
                    {count} dars — hali o&apos;tilmagan
                    <span className="text-muted-foreground">
                      {" "}
                      · {money(chunk.unit)} so&apos;mdan
                    </span>
                  </>
                ) : count === 1 ? (
                  // One lesson — the date IS the whole story; "1 dars × …"
                  // would just restate the amount on the right.
                  <span className="font-mono text-xs tabular-nums">
                    {dayOf(lessonDateOf(chunk.rows[0]))}
                  </span>
                ) : (
                  <>
                    {count} dars
                    <span className="text-muted-foreground">
                      {" "}
                      × {money(chunk.unit)}
                    </span>
                  </>
                )
              }
            >
              {count > 1 && <DateChips rows={chunk.rows} />}
            </Line>
          );
        })}
      </ul>
    </section>
  );
}
