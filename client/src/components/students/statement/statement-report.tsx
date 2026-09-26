import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import type { CorrectablePayment } from "../correct-payment-dialog";
import { StatementAllocations } from "./statement-allocations";
import { StatementMonthsTable } from "./statement-months-table";
import { StatementSection } from "./statement-section";
import { Segments } from "./statement-segments";
import { StatementSummary } from "./statement-summary";
import type { LessonDay, StatementResponse } from "./statement-types";
import { canCorrectPayment } from "./statement-utils";

/**
 * The statement itself, drawn from `GET /students/:id/statement`, in three
 * layers: the answer and its numbers, the months (one line each, details on
 * click), then closed sections for everything that explains it further.
 * Every sentence is the server's (`view`, admin voice). No fetching here, so
 * it renders the same in a test; the raw ledger comes in as `ledger`.
 */
export function StatementReport({
  data,
  who,
  now,
  onCorrect,
  ledger,
}: {
  data: StatementResponse;
  who: { isCeo: boolean; canCorrect: boolean };
  now: number;
  onCorrect: (p: CorrectablePayment) => void;
  ledger?: ReactNode;
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

      <StatementSummary answer={view.answer} equation={model.equation} />

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

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Batafsil</h3>
        {view.allocations.length > 0 && (
          <StatementSection
            title="To'lovlar qayerga ketdi"
            count={view.allocations.length}
          >
            <StatementAllocations
              rows={view.allocations}
              models={model.allocations}
              isCorrectable={(a) => canCorrectPayment(a, who, now)}
              onCorrect={onCorrect}
            />
          </StatementSection>
        )}
        {view.modelChanges.length > 0 && (
          <StatementSection title="To'lov turi o'zgarishi">
            <div className="space-y-3">
              {view.modelChanges.map((c) => (
                <div key={c.title} className="space-y-1">
                  <p className="text-sm font-medium">{c.title}</p>
                  {c.lines.map((line, i) => (
                    <p key={i} className="text-sm text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </StatementSection>
        )}
        <StatementSection title="Hisob qanday chiqdi">
          <div className="space-y-2 text-sm">
            <p>
              <Segments segments={view.equation} />
            </p>
            <p className="text-xs text-muted-foreground">{view.footnote}</p>
          </div>
        </StatementSection>
        {ledger}
      </section>
    </div>
  );
}
