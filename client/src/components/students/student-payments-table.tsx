"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  FileText,
  MoreHorizontal,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import {
  BalanceSummaryCard,
  type BalanceSummary,
} from "./balance-summary-card";
import {
  CorrectPaymentDialog,
  type CorrectablePayment,
} from "./correct-payment-dialog";
import { PaymentEffectCard } from "./payment-effect-card";
import {
  PAYMENT_METHOD_LABELS,
  type StudentTransaction,
} from "./student-profile-tabs-utils";

/** Non-CEO operators may correct a payment only within 72h of it landing. */
const CORRECTION_WINDOW_MS = 72 * 60 * 60 * 1000;

interface StudentPaymentsTableProps {
  isLoading: boolean;
  balance: number;
  transactions: StudentTransaction[];
  /** Aggregate "why is the balance like this?" data from the new
   *  /students/:id/balance-summary endpoint. Null while loading. */
  summary: BalanceSummary | null;
  /** Called after a payment is corrected — refresh balance + transactions. */
  onCorrected?: (newBalance: number | null) => void;
}

const fmt = (n: number) => n.toLocaleString("uz-UZ");
const MONTH_NAMES = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];

interface MonthGroup {
  key: string;
  label: string;
  totalIn: number;
  paymentCount: number;
  events: StudentTransaction[];
}

function groupByMonth(transactions: StudentTransaction[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const t of transactions) {
    const d = new Date(t.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const existing = groups.get(key);
    const isIncomingPayment = t.type === "PAYMENT" && t.amount > 0;
    if (existing) {
      existing.events.push(t);
      if (isIncomingPayment) {
        existing.totalIn += t.amount;
        existing.paymentCount += 1;
      }
    } else {
      groups.set(key, {
        key,
        label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
        totalIn: isIncomingPayment ? t.amount : 0,
        paymentCount: isIncomingPayment ? 1 : 0,
        events: [t],
      });
    }
  }
  // Newest month first (transactions arrive DESC already).
  return Array.from(groups.values());
}

export function StudentPaymentsTable({
  isLoading,
  balance,
  transactions,
  summary,
  onCorrected,
}: StudentPaymentsTableProps) {
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const canCorrect =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const [correctTarget, setCorrectTarget] = useState<CorrectablePayment | null>(
    null,
  );

  const months = useMemo(() => groupByMonth(transactions), [transactions]);

  // Rows arrive newest-first, so the first incoming PAYMENT is the latest one.
  // Only that card carries the "Bugun" line — an older card must not imply
  // that its closing balance is the student's balance now.
  const latestPaymentId = useMemo(
    () =>
      transactions.find((t) => t.type === "PAYMENT" && t.amount > 0)?.id ?? null,
    [transactions],
  );

  const isCorrectable = (t: StudentTransaction): boolean => {
    if (t.type !== "PAYMENT" || !t.payment?.id) return false;
    if (t.payment.status !== "COMPLETED" || t.amount <= 0) return false;
    if (!canCorrect) return false;
    if (isCeo) return true;
    return Date.now() - new Date(t.createdAt).getTime() <= CORRECTION_WINDOW_MS;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  // Compose a "live" summary that respects optimistic balance changes from
  // payment corrections. The server-side summary won't include an
  // in-flight correction until the parent refetches, so we override
  // currentBalance from the prop. Other fields lag for a moment, which is
  // acceptable (cents-level lag, not a correctness issue).
  const liveSummary: BalanceSummary | null = summary
    ? { ...summary, currentBalance: balance }
    : null;

  return (
    <div className="space-y-6">
      <BalanceSummaryCard data={liveSummary} />

      {/* Oy-oy feed */}
      {months.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Hali to&apos;lov yoki tranzaksiya mavjud emas
        </p>
      ) : (
        <div className="space-y-6">
          {months.map((m) => (
            <MonthSection
              key={m.key}
              month={m}
              isCorrectable={isCorrectable}
              onCorrect={(p) => setCorrectTarget(p)}
              currentBalance={balance}
              latestPaymentId={latestPaymentId}
              perLessonCost={summary?.perLessonCost ?? null}
            />
          ))}
        </div>
      )}

      <CorrectPaymentDialog
        open={correctTarget !== null}
        onOpenChange={(o) => {
          if (!o) setCorrectTarget(null);
        }}
        payment={correctTarget}
        onCorrected={(newBalance) => {
          onCorrected?.(newBalance);
          setCorrectTarget(null);
        }}
      />
    </div>
  );
}

function MonthSection({
  month,
  isCorrectable,
  onCorrect,
  currentBalance,
  latestPaymentId,
  perLessonCost,
}: {
  month: MonthGroup;
  isCorrectable: (t: StudentTransaction) => boolean;
  onCorrect: (p: CorrectablePayment) => void;
  currentBalance: number;
  latestPaymentId: string | null;
  perLessonCost: number | null;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-baseline justify-between border-b pb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {month.label}
        </h3>
        <p className="text-xs text-muted-foreground">
          {month.paymentCount > 0 && (
            <>
              {month.paymentCount} ta to&apos;lov
              <span className="mx-1">·</span>
              <span className="font-medium text-emerald-600">
                +{fmt(month.totalIn)} so&apos;m tushgan
              </span>
            </>
          )}
        </p>
      </header>

      <div className="space-y-2">
        {month.events.map((t) =>
          t.type === "PAYMENT" && t.amount > 0 ? (
            <PaymentCard
              key={t.id}
              transaction={t}
              isCorrectable={isCorrectable(t)}
              onCorrect={onCorrect}
              currentBalance={currentBalance}
              isLatestPayment={t.id === latestPaymentId}
              perLessonCost={perLessonCost}
            />
          ) : (
            <SimpleEventCard key={t.id} transaction={t} />
          ),
        )}
      </div>
    </section>
  );
}

function PaymentCard({
  transaction: t,
  isCorrectable,
  onCorrect,
  currentBalance,
  isLatestPayment,
  perLessonCost,
}: {
  transaction: StudentTransaction;
  isCorrectable: boolean;
  onCorrect: (p: CorrectablePayment) => void;
  currentBalance: number;
  isLatestPayment: boolean;
  perLessonCost: number | null;
}) {
  const methodLabel = t.payment?.method
    ? (PAYMENT_METHOD_LABELS[t.payment.method] ?? t.payment.method)
    : null;
  const cashier = t.performedBy
    ? `${t.performedBy.firstName} ${t.performedBy.lastName}`
    : null;
  // Gated on the row having balances at all — NOT on the allocation being
  // non-zero. The old `toLessons > 0 || remainderInBalance > 0` test made a
  // payment that went entirely to old debt vanish from the card silently.
  const hasEffect = Number.isFinite(t.balanceBefore);

  return (
    <article className="rounded-lg border bg-card p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            <ArrowDownToLine className="size-4" />
          </span>
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-semibold text-emerald-600">
                +{fmt(t.amount)} so&apos;m
              </span>
              {methodLabel && (
                <Badge variant="secondary" className="text-[10px]">
                  {methodLabel}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(t.createdAt), "dd.MM.yyyy, HH:mm")}
              {cashier && (
                <>
                  <span className="mx-1.5">·</span>
                  Qabul: {cashier}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ReceiptLink transaction={t} />
          {isCorrectable && t.payment && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    onCorrect({
                      id: t.payment!.id,
                      amount: t.amount,
                      method: t.payment!.method,
                    })
                  }
                >
                  <Pencil className="mr-2 size-4" />
                  Summani to&apos;g&apos;rilash
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {hasEffect && (
        <PaymentEffectCard
          transaction={t}
          currentBalance={currentBalance}
          isLatestPayment={isLatestPayment}
          perLessonCost={perLessonCost}
        />
      )}
    </article>
  );
}

/** Build the "qaysi sikl, qaysi sanalar" detail line for a LESSON_DEDUCTION. */
function deductionDetail(t: StudentTransaction): string {
  const cov = t.coverage;
  const capacity = cov?.capacity ?? t.metadata?.lessonsCovered ?? 0;
  const covered = cov?.coveredCount ?? 0;
  if (cov?.firstCoveredDate) {
    const first = format(new Date(cov.firstCoveredDate), "dd.MM");
    const last = cov.lastCoveredDate
      ? format(new Date(cov.lastCoveredDate), "dd.MM")
      : first;
    const range = first === last ? first : `${first} — ${last}`;
    return covered < capacity && capacity > 0
      ? `${range} (${covered}/${capacity} dars)`
      : `${range} (${capacity} dars)`;
  }
  return capacity > 0 ? `${capacity} dars — hali boshlanmagan` : "Sikl";
}

function SimpleEventCard({
  transaction: t,
}: {
  transaction: StudentTransaction;
}) {
  // LESSON_DEDUCTION — sikl darslariga yechilgan summa, SANALAR bilan.
  if (t.type === "LESSON_DEDUCTION") {
    return (
      <article className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
        <div className="flex items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
            <BookOpen className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">Darslar uchun yechildi</p>
            <p className="text-xs text-muted-foreground">
              {deductionDetail(t)}
              <span className="mx-1.5">·</span>
              {format(new Date(t.createdAt), "dd.MM.yyyy")}
            </p>
          </div>
        </div>
        <div className="font-mono text-sm font-medium tabular-nums text-red-600">
          {fmt(t.amount)} so&apos;m
        </div>
      </article>
    );
  }

  const negative = t.amount < 0;
  const isRefund = t.type === "REFUND";
  const isInitial = t.type === "INITIAL_BALANCE";
  const isWithdrawal = t.type === "BALANCE_WITHDRAWAL";
  const isAdjustment = t.type === "ADJUSTMENT";
  const isReversal = t.type === "PAYMENT" && t.amount < 0;

  const label = isRefund
    ? "Pul qaytarildi"
    : isInitial
      ? "Boshlang'ich balans"
      : isWithdrawal
        ? "Balans yechib olindi"
        : isAdjustment
          ? "Tuzatish"
          : isReversal
            ? "To'lov bekor qilindi"
            : t.type;

  const Icon = negative ? ArrowUpFromLine : ArrowDownToLine;
  // ADJUSTMENT rows are balance corrections, never received money. A positive
  // correction (e.g. the over-charge refund) must NOT read as income, so it
  // gets a neutral slate treatment + a RotateCcw icon instead of the
  // emerald/green "money in" styling that a real PAYMENT uses.
  const colorBg = isAdjustment
    ? "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
    : negative
      ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
      : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400";
  const reasonText =
    t.description && t.description !== "To'lov qabul qilindi"
      ? t.description
      : null;

  return (
    <article className="flex items-center justify-between gap-3 rounded-md border bg-card/50 p-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full ${colorBg}`}
        >
          {isReversal || isAdjustment ? (
            <RotateCcw className="size-3.5" />
          ) : (
            <Icon className="size-3.5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm">
            <span className="font-medium">{label}</span>
            {isAdjustment && (
              <Badge
                variant="outline"
                className="ml-1.5 text-[10px] font-normal text-muted-foreground"
              >
                to&apos;lov emas
              </Badge>
            )}
            {reasonText && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                · {reasonText}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(t.createdAt), "dd.MM.yyyy, HH:mm")}
          </p>
        </div>
      </div>
      <div
        className={`font-mono text-sm font-medium tabular-nums ${
          isAdjustment
            ? "text-slate-600 dark:text-slate-300"
            : negative
              ? "text-red-600"
              : "text-emerald-600"
        }`}
      >
        {negative ? "" : "+"}
        {fmt(t.amount)} so&apos;m
      </div>
    </article>
  );
}

function ReceiptLink({ transaction }: { transaction: StudentTransaction }) {
  if (transaction.type !== "PAYMENT" || !transaction.payment?.id) {
    return null;
  }
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  const href = `${apiUrl}/receipts/payment/${transaction.payment.id}.pdf`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      title="PDF chek"
    >
      <FileText className="size-3.5" />
      Chek
    </a>
  );
}

// Empty-state safety: when balance is negative but no debt explanation is
// visible (e.g. all LESSON_DEDUCTION rows are hidden by design), expose a
// generic warning so the admin isn't confused.
export function NegativeBalanceHint({ balance }: { balance: number }) {
  if (balance >= 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="size-4 shrink-0" />
      O&apos;quvchining balansi manfiy — {fmt(Math.abs(balance))} so&apos;m
      qarz.
    </div>
  );
}
