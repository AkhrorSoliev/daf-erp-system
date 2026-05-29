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
  Wallet,
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
}: {
  month: MonthGroup;
  isCorrectable: (t: StudentTransaction) => boolean;
  onCorrect: (p: CorrectablePayment) => void;
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
}: {
  transaction: StudentTransaction;
  isCorrectable: boolean;
  onCorrect: (p: CorrectablePayment) => void;
}) {
  const methodLabel = t.payment?.method
    ? (PAYMENT_METHOD_LABELS[t.payment.method] ?? t.payment.method)
    : null;
  const cashier = t.performedBy
    ? `${t.performedBy.firstName} ${t.performedBy.lastName}`
    : null;
  const dest = t.destination;
  const hasDestination =
    !!dest && (dest.toLessons > 0 || dest.remainderInBalance > 0);

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

      {/* Ketdi: 2-3 qatorlik aniq summary */}
      {hasDestination && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Bu pul ketdi:
          </p>
          <ul className="space-y-1.5 text-sm">
            {dest!.toLessons > 0 && (
              <li className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-foreground">
                  <BookOpen className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    Darslarga
                    {dest!.firstLessonDate && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({format(new Date(dest!.firstLessonDate), "dd.MM")}
                        {dest!.lastLessonDate &&
                          dest!.firstLessonDate !== dest!.lastLessonDate &&
                          ` — ${format(new Date(dest!.lastLessonDate), "dd.MM")}`}
                        )
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 font-mono tabular-nums">
                  {fmt(dest!.toLessons)} so&apos;m
                </span>
              </li>
            )}
            {dest!.remainderInBalance > 0 && (
              <li className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-foreground">
                  <Wallet className="size-4 shrink-0 text-slate-500" />
                  <span>Balansga qoldi</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums">
                  {fmt(dest!.remainderInBalance)} so&apos;m
                </span>
              </li>
            )}
          </ul>
        </div>
      )}
    </article>
  );
}

function SimpleEventCard({
  transaction: t,
}: {
  transaction: StudentTransaction;
}) {
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
  const colorBg = negative
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
          {isReversal ? (
            <RotateCcw className="size-3.5" />
          ) : (
            <Icon className="size-3.5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm">
            <span className="font-medium">{label}</span>
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
          negative ? "text-red-600" : "text-emerald-600"
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
