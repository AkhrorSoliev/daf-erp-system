import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import type { CorrectablePayment } from "../correct-payment-dialog";
import { StatementMonthsTable } from "./statement-months-table";
import { StatementPayments } from "./statement-payments";
import { StatementSection } from "./statement-section";
import { Segments } from "./statement-segments";
import { StatementSummary } from "./statement-summary";
import type { LessonDay, StatementResponse } from "./statement-types";
import { canCorrectPayment } from "./statement-utils";

/**
 * The statement itself, drawn from `GET /students/:id/statement`, in the
 * PDF's own order: the answer, the payments, then each month's price, paid
 * and debt; closed sections hold what explains it further. Every sentence is
 * the server's (`view`, admin voice). No fetching here, so it renders the
 * same in a test; the raw ledger comes in as `ledger`.
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
  const payments = model.allocations.filter((a) => a.kind === "payment");

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
        <h3 className="text-sm font-semibold">To&apos;lovlar</h3>
        <StatementPayments
          rows={view.payments}
          total={view.paidTotal}
          models={payments}
          isCorrectable={(a) => canCorrectPayment(a, who, now)}
          onCorrect={onCorrect}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Oylar bo&apos;yicha</h3>
        <StatementMonthsTable
          dues={view.dues}
          total={view.duesTotal}
          surplus={view.surplus}
          lessonDays={lessonDays}
          sharpNote={view.sharpNote}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Batafsil</h3>
        <StatementSection title="Izohlar">
          <div className="space-y-2 text-sm">
            <p>
              <Segments segments={view.equation} />
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {view.notes.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </StatementSection>
        {ledger}
      </section>
    </div>
  );
}
