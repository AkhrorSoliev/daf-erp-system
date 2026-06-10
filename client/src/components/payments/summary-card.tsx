import * as React from "react";

export type SummaryCardTone =
  | "red"
  | "slate"
  | "amber"
  | "violet"
  | "green"
  | "blue";

/**
 * Compact KPI card used across the finance pages (debtors, expenses).
 * Icon chip + uppercase label + a single tabular-nums value.
 */
export function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: SummaryCardTone;
}) {
  const toneClass: Record<SummaryCardTone, string> = {
    red: "bg-red-100 dark:bg-red-900/40",
    slate: "bg-slate-100 dark:bg-slate-800/60",
    amber: "bg-amber-100 dark:bg-amber-900/40",
    violet: "bg-violet-100 dark:bg-violet-900/40",
    green: "bg-green-100 dark:bg-green-900/40",
    blue: "bg-blue-100 dark:bg-blue-900/40",
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <div className={`rounded-md p-2 ${toneClass[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-heading text-xl font-semibold tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}
