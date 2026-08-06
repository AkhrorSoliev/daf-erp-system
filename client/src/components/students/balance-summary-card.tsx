"use client";

import { AlertTriangle, Wallet } from "lucide-react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { uz } from "date-fns/locale";
import { formatBalance, formatNumber } from "@/lib/format-utils";

export interface BalanceSummary {
  lessonsAttended: number;
  totalLessonCost: number;
  totalPaid: number;
  paymentCount: number;
  currentBalance: number;
  perLessonCost: number | null;
  lastPaymentDate: string | null;
  /**
   * Start of the CURRENT debt spell — null once the balance recovers. It is
   * NOT "the first time this student ever went negative": that figure only
   * ever grew, so a student who had paid 800 000 so'm since their first dip
   * still read "25 ta dars to'lovsiz" while owing a single lesson.
   */
  debtSinceDate: string | null;
  /** Lessons taken during that spell — the ONE unpaid-lesson count on the tab. */
  unpaidLessonsCount: number;
}

interface Props {
  data: BalanceSummary | null;
}

/**
 * Top-of-tab debt/balance explainer. Admins shouldn't have to walk the
 * feed (or ask Claude) to understand why a student is in debt — the card
 * shows the math at a glance.
 *
 * Two variants:
 *   - balance < 0  → red "QARZ TUSHUNTIRISHI" card
 *   - balance >= 0 → emerald "BALANS HOLATI" card
 *
 * Hidden entirely for fresh students with no payments and no attended
 * lessons — there's nothing to explain.
 */
export function BalanceSummaryCard({ data }: Props) {
  if (!data) return null;
  if (data.lessonsAttended === 0 && data.paymentCount === 0) return null;

  const isDebt = data.currentBalance < 0;
  return isDebt ? <DebtCard data={data} /> : <PositiveCard data={data} />;
}

function DebtCard({ data }: { data: BalanceSummary }) {
  const debt = Math.abs(data.currentBalance);
  const debtInLessons =
    data.perLessonCost && data.perLessonCost > 0
      ? Math.round(debt / data.perLessonCost)
      : null;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/60 p-5 dark:border-red-900/40 dark:bg-red-950/20">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-red-900 dark:text-red-300">
          Qarz tushuntirishi
        </h3>
      </div>

      <dl className="space-y-1.5 text-sm">
        <Row
          label={`${formatNumber(data.lessonsAttended)} ta darsga keldi`}
          value={`${formatBalance(data.totalLessonCost)}`}
        />
        <Row
          label={`${formatNumber(data.paymentCount)} ta to'lov qildi`}
          value={`${formatBalance(data.totalPaid)}`}
        />
        <div className="my-2 border-t border-red-200 dark:border-red-900/40" />
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-semibold text-red-900 dark:text-red-300">
            QARZ:
          </dt>
          <dd className="font-mono text-lg font-bold tabular-nums text-red-700 dark:text-red-400">
            {formatBalance(debt)}
            {debtInLessons !== null && debtInLessons > 0 && (
              <span className="ml-2 text-xs font-normal text-red-700/70 dark:text-red-400/70">
                (≈ {debtInLessons} dars uchun)
              </span>
            )}
          </dd>
        </div>
      </dl>

      {(data.debtSinceDate || data.lastPaymentDate) && (
        <div className="mt-3 space-y-1 border-t border-red-200 pt-3 text-xs text-red-900/80 dark:border-red-900/40 dark:text-red-300/80">
          {data.debtSinceDate && (
            // One sentence, not two. "06.06 dan keyin to'lovsiz: 25 ta dars"
            // sat on its own line and read as a second, contradictory claim.
            <p>
              <span className="font-medium">Qarzda:</span>{" "}
              {format(new Date(data.debtSinceDate), "dd.MM.yyyy")} dan beri
              {data.unpaidLessonsCount > 0 && (
                <> · {data.unpaidLessonsCount} ta dars to&apos;lanmagan</>
              )}
            </p>
          )}
          {data.lastPaymentDate && (
            <p>
              <span className="font-medium">Oxirgi to&apos;lov:</span>{" "}
              {format(new Date(data.lastPaymentDate), "dd.MM.yyyy")}{" "}
              <span className="text-red-900/60 dark:text-red-300/60">
                ({formatDistanceToNowStrict(new Date(data.lastPaymentDate), {
                  locale: uz,
                  addSuffix: false,
                })}{" "}
                avval)
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PositiveCard({ data }: { data: BalanceSummary }) {
  const lessonsLeft =
    data.perLessonCost && data.perLessonCost > 0
      ? Math.floor(data.currentBalance / data.perLessonCost)
      : null;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="size-5 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-300">
          Balans holati
        </h3>
      </div>

      <dl className="space-y-1.5 text-sm">
        <Row
          label={`${formatNumber(data.lessonsAttended)} ta darsga keldi`}
          value={`${formatBalance(data.totalLessonCost)}`}
        />
        <Row
          label={`${formatNumber(data.paymentCount)} ta to'lov qildi`}
          value={`${formatBalance(data.totalPaid)}`}
        />
        <div className="my-2 border-t border-emerald-200 dark:border-emerald-900/40" />
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-semibold text-emerald-900 dark:text-emerald-300">
            Balansda:
          </dt>
          <dd className="font-mono text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatBalance(data.currentBalance)}
            {lessonsLeft !== null && lessonsLeft > 0 && (
              <span className="ml-2 text-xs font-normal text-emerald-700/70 dark:text-emerald-400/70">
                (≈ {lessonsLeft} darsga yetadi)
              </span>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
