import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CorrectablePayment } from "../correct-payment-dialog";
import { StatementAllocations } from "./statement-allocations";
import { StatementMonthsTable } from "./statement-months-table";
import { Segments } from "./statement-segments";
import type { LessonDay, StatementResponse } from "./statement-types";
import { canCorrectPayment } from "./statement-utils";

const ANSWER_TONE = {
  debt: "border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200",
  credit:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
  zero: "border-border bg-muted/40",
} as const;

/**
 * The statement itself, drawn from `GET /students/:id/statement`. Every
 * sentence is the server's (`view`, admin voice); this component only lays it
 * out. No fetching here, so it renders the same in a test.
 */
export function StatementReport({
  data,
  who,
  now,
  onCorrect,
}: {
  data: StatementResponse;
  who: { isCeo: boolean; canCorrect: boolean };
  now: number;
  onCorrect: (p: CorrectablePayment) => void;
}) {
  const { view, model } = data;
  const lessonDays: Record<string, LessonDay[]> = {};
  for (const m of model.months) lessonDays[m.key] = m.lessonDays;

  return (
    <div className="space-y-6">
      {view.warning && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {view.warning}
        </div>
      )}

      <p className="text-sm text-muted-foreground">{view.studentLine}</p>

      <section className={cn("rounded-lg border p-4", ANSWER_TONE[view.answer.tone])}>
        <p className="text-lg font-semibold">{view.answer.title}</p>
        {view.answer.subtitle && (
          <p className="mt-1 text-sm opacity-90">{view.answer.subtitle}</p>
        )}
      </section>

      <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">
        <Segments segments={view.equation} />
      </p>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Oylar bo&apos;yicha</h3>
        {view.packHint && (
          <p className="text-xs text-muted-foreground">{view.packHint}</p>
        )}
        <StatementMonthsTable
          months={view.months}
          lessonDays={lessonDays}
          sharpNote={view.sharpNote}
        />
      </section>

      {view.modelChanges.map((c) => (
        <section key={c.title} className="space-y-1 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">{c.title}</h3>
          {c.lines.map((line, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              {line}
            </p>
          ))}
        </section>
      ))}

      {view.allocations.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">To&apos;lovlar qayerga ketdi</h3>
          <StatementAllocations
            rows={view.allocations}
            models={model.allocations}
            isCorrectable={(a) => canCorrectPayment(a, who, now)}
            onCorrect={onCorrect}
          />
        </section>
      )}

      <p className="text-xs text-muted-foreground">{view.footnote}</p>
    </div>
  );
}
