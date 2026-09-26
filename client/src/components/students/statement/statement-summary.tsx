import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format-utils";
import type { StatementModel, StatementView } from "./statement-types";

const ANSWER_TONE = {
  debt: "border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200",
  credit:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
  zero: "border-border bg-muted/40",
} as const;

const signed = (n: number) => (n > 0 ? `+${formatNumber(n)}` : formatNumber(n));

/**
 * The first glance: the answer in one line, then the equation as tiles —
 * paid, lessons, anything else, and what is left. The tiles add up:
 * paid + other − lessons = balance (`other` is every non-payment item less
 * lessons paid ahead, so it only shows when there is one).
 */
export function StatementSummary({
  answer,
  equation,
}: {
  answer: StatementView["answer"];
  equation: StatementModel["equation"];
}) {
  const other =
    equation.items.reduce((sum, i) => sum + i.amount, 0) -
    equation.prepaidAhead;
  const tiles = [
    { label: "To'lagan", value: formatNumber(equation.paid) },
    { label: "Darslar narxi", value: formatNumber(equation.lessons) },
    ...(other !== 0 ? [{ label: "Boshqa", value: signed(other) }] : []),
  ];
  const balanceTone =
    equation.balance < 0
      ? "text-red-600 dark:text-red-400"
      : equation.balance > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "";

  return (
    <section className="space-y-3">
      <div className={cn("rounded-lg border p-4", ANSWER_TONE[answer.tone])}>
        <p className="text-xl font-semibold">{answer.title}</p>
        {answer.subtitle && (
          <p className="mt-1 text-sm opacity-90">{answer.subtitle}</p>
        )}
      </div>
      <dl
        className={cn(
          "grid grid-cols-2 gap-2",
          tiles.length === 3 ? "sm:grid-cols-4" : "sm:grid-cols-3",
        )}
      >
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{t.label}</dt>
            <dd className="font-mono text-base font-semibold tabular-nums">
              {t.value}
            </dd>
          </div>
        ))}
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Qoldiq</dt>
          <dd
            className={cn(
              "font-mono text-base font-semibold tabular-nums",
              balanceTone,
            )}
          >
            {equation.balance === 0 ? "0" : signed(equation.balance)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
