"use client";

import {
  AlertTriangle,
  Info,
  Lock,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CONTRACT_NOTE,
  DEFAULT_DEPARTURE_POLICY,
  DEPARTURE_POLICIES,
  LOCKED_POLICY_NOTE,
  POLICY_TITLES,
  departureConsequence,
  factsLine,
  lessonChips,
  monthlyRows,
  policyHint,
  type Consequence,
  type DeparturePolicy,
  type DeparturePreview,
  type MonthlyRow,
} from "./departure-money";

interface DepartureMoneyBlockProps {
  preview: DeparturePreview | undefined;
  isLoading: boolean;
  isError: boolean;
  policy: DeparturePolicy;
  onPolicyChange: (policy: DeparturePolicy) => void;
  /** An expulsion closes every group the student is in: name each one. */
  showGroupNames?: boolean;
  disabled?: boolean;
}

/**
 * «Pul (shartnoma bo'yicha)»: what leaving now does to the month's charge
 * (contract 6.2, ADR-0043). Drawn only when a monthly course has a charge
 * this month. A CEO or branch director picks the policy; everyone else sees
 * the student's own decision, locked.
 */
export function DepartureMoneyBlock({
  preview,
  isLoading,
  isError,
  policy,
  onPolicyChange,
  showGroupNames = false,
  disabled = false,
}: DepartureMoneyBlockProps) {
  if (isLoading) return <BlockSkeleton />;
  if (isError) {
    return (
      <section className="flex flex-col gap-1 border-t pt-3">
        <p className="text-sm font-medium">Pul (shartnoma bo&apos;yicha)</p>
        <p className="text-xs text-muted-foreground">
          Pul hisobini yuklab bo&apos;lmadi. Oy to&apos;lovi shartnoma qoidasi
          bo&apos;yicha hisoblanadi.
        </p>
      </section>
    );
  }

  const rows = monthlyRows(preview);
  if (!preview || rows.length === 0) return null;
  const shown = preview.mayChoosePolicy ? policy : DEFAULT_DEPARTURE_POLICY;
  const consequence = departureConsequence(preview, shown);
  const first = rows[0].month;

  return (
    <section className="flex flex-col gap-3 border-t pt-3">
      <p className="text-sm font-medium">Pul (shartnoma bo&apos;yicha)</p>
      {rows.map((row) => (
        <MonthFacts
          key={row.enrollmentId}
          row={row}
          showGroupName={showGroupNames || rows.length > 1}
        />
      ))}

      {preview.mayChoosePolicy ? (
        <div
          role="radiogroup"
          aria-label="Pulni qaytarish tartibi"
          className="flex flex-col gap-1.5"
        >
          {DEPARTURE_POLICIES.map((p) => (
            <label
              key={p}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors",
                p === shown
                  ? "border-primary/50 bg-primary/5"
                  : "hover:bg-muted/40",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="departure-policy"
                value={p}
                checked={p === shown}
                onChange={() => onPolicyChange(p)}
                disabled={disabled}
                className="mt-1"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{POLICY_TITLES[p]}</span>
                <span className="text-xs text-muted-foreground">
                  {policyHint(p, first)}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-md border border-primary/30 bg-primary/5 p-2.5">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="flex flex-col">
            <span className="text-sm font-medium">
              {POLICY_TITLES[DEFAULT_DEPARTURE_POLICY]}
            </span>
            <span className="text-xs text-muted-foreground">
              {LOCKED_POLICY_NOTE}
            </span>
          </span>
        </div>
      )}

      {consequence && <ConsequenceBox consequence={consequence} />}
      <p className="text-[11px] text-muted-foreground">{CONTRACT_NOTE}</p>
    </section>
  );
}

function MonthFacts({
  row,
  showGroupName,
}: {
  row: MonthlyRow;
  showGroupName: boolean;
}) {
  const facts = factsLine(row.month);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {showGroupName && (
          <span className="font-medium text-foreground">
            {row.groupName} ·{" "}
          </span>
        )}
        {facts.lead}{" "}
        <span className="font-medium text-foreground">{facts.held}</span>
      </p>
      <div className="flex flex-wrap gap-1">
        {lessonChips(row.month).map((chip) => (
          <span
            key={chip.date}
            title={chip.held ? "O'tgan dars" : "Hali o'tmagan dars"}
            className={cn(
              "flex h-6 w-7 items-center justify-center rounded-md border text-[11px] tabular-nums",
              chip.held
                ? "border-primary/40 bg-primary/10 font-medium text-primary"
                : "text-muted-foreground",
            )}
          >
            {chip.day}
          </span>
        ))}
      </div>
    </div>
  );
}

// `yellow`, not `amber`: amber's 50–700 steps resolve only inside the student
// portal's `.lumio` scope and render colourless here.
const TONES: Record<Consequence["tone"], { box: string; icon: LucideIcon }> = {
  warning: {
    box: "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-900/60 dark:bg-yellow-950/30 dark:text-yellow-200",
    icon: AlertTriangle,
  },
  success: {
    box: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
    icon: Undo2,
  },
  neutral: { box: "bg-muted/50 text-foreground", icon: Info },
};

function ConsequenceBox({ consequence }: { consequence: Consequence }) {
  const tone = TONES[consequence.tone];
  const Icon = tone.icon;
  return (
    <div
      role="status"
      className={cn("flex items-start gap-2 rounded-md border p-3", tone.box)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{consequence.head}</p>
        <p className="text-xs leading-relaxed">{consequence.line}</p>
      </div>
    </div>
  );
}

function BlockSkeleton() {
  return (
    <section className="flex flex-col gap-2 border-t pt-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3.5 w-3/4" />
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 13 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-7" />
        ))}
      </div>
      <Skeleton className="h-14 w-full" />
    </section>
  );
}
