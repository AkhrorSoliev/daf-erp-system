"use client";

import { useState } from "react";
import { format } from "date-fns";
import { FileText, MoreHorizontal, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import {
  CorrectPaymentDialog,
  type CorrectablePayment,
} from "./correct-payment-dialog";
import {
  LESSON_DEDUCTION_MODE_LABELS,
  PAYMENT_METHOD_LABELS,
  TRANSACTION_TYPE_INFO,
  type StudentTransaction,
} from "./student-profile-tabs-utils";

/** Non-CEO operators may correct a payment only within 72h of it landing. */
const CORRECTION_WINDOW_MS = 72 * 60 * 60 * 1000;

interface StudentPaymentsTableProps {
  isLoading: boolean;
  balance: number;
  transactions: StudentTransaction[];
  /** Called after a payment is corrected — refresh balance + transactions. */
  onCorrected?: (newBalance: number | null) => void;
}

export function StudentPaymentsTable({
  isLoading,
  balance,
  transactions,
  onCorrected,
}: StudentPaymentsTableProps) {
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  // CEO, Branch Director, Administrator may correct a wrong payment amount.
  const canCorrect =
    user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const [correctTarget, setCorrectTarget] = useState<CorrectablePayment | null>(
    null,
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded" />
        ))}
      </div>
    );
  }

  /**
   * A row is correctable when it is the original, still-active payment
   * (positive amount, COMPLETED status). Reversal entries (negative
   * amount) and already-reversed payments are excluded. Non-CEO callers
   * are additionally bound to the 72h window; the backend enforces both.
   */
  const isCorrectable = (t: StudentTransaction): boolean => {
    if (t.type !== "PAYMENT" || !t.payment?.id) return false;
    if (t.payment.status !== "COMPLETED" || t.amount <= 0) return false;
    if (!canCorrect) return false;
    if (isCeo) return true;
    return Date.now() - new Date(t.createdAt).getTime() <= CORRECTION_WINDOW_MS;
  };

  return (
    <div className="space-y-6">
      {/* Balans */}
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Joriy balans</p>
        <p
          className={`text-2xl font-bold ${
            balance >= 0 ? "text-green-600" : "text-red-600"
          }`}
        >
          {balance.toLocaleString("uz-UZ")} so&apos;m
        </p>
      </div>

      {/* Balans operatsiyalari — unified ledger */}
      {transactions.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium mb-2">Balans operatsiyalari</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Turi</TableHead>
                <TableHead>Tafsilot</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead className="text-right">Balans</TableHead>
                <TableHead>Sana</TableHead>
                <TableHead className="w-24 text-center">Hujjat</TableHead>
                <TableHead className="w-12 text-center">Amal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t, i) => {
                const typeInfo = TRANSACTION_TYPE_INFO[t.type] ?? {
                  label: t.type,
                  variant: "outline" as const,
                };
                const isPayment = t.type === "PAYMENT";
                // Lesson charges are automatic, system-generated rows — they
                // get a muted background so the eye separates them from the
                // manual money flows (payments, refunds, adjustments).
                const isLessonDeduction = t.type === "LESSON_DEDUCTION";
                const methodLabel = t.payment?.method
                  ? (PAYMENT_METHOD_LABELS[t.payment.method] ?? t.payment.method)
                  : null;
                const cashier = t.performedBy
                  ? `${t.performedBy.firstName} ${t.performedBy.lastName}`
                  : null;
                const correctable = isCorrectable(t);

                return (
                  <TableRow
                    key={t.id}
                    className={isLessonDeduction ? "bg-muted/30" : ""}
                  >
                    <TableCell className="border-r text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {isPayment ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {methodLabel && (
                              <Badge variant="secondary">{methodLabel}</Badge>
                            )}
                            {cashier && <span>Qabul: {cashier}</span>}
                            {!methodLabel && !cashier && "—"}
                          </div>
                          {t.destination &&
                            (t.destination.allocations.length > 0 ||
                              t.destination.remainderInBalance > 0) && (
                              <PaymentDestinationLine
                                destination={t.destination}
                              />
                            )}
                        </div>
                      ) : isLessonDeduction ? (
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          {t.coverage && t.metadata?.mode !== "SINGLE_UNCOVERED" && (
                            <Badge variant="outline" className="font-mono">
                              Sikl #{t.coverage.cycleSequenceNumber}
                            </Badge>
                          )}
                          <span className="text-foreground">
                            {t.metadata?.lessonsCovered ?? "?"} dars
                          </span>
                          {t.metadata?.perLessonCost != null && (
                            <span className="text-muted-foreground">
                              · {t.metadata.perLessonCost.toLocaleString("uz-UZ")}{" "}
                              so&apos;m/dars
                            </span>
                          )}
                          {t.coverage && t.coverage.coveredCount > 0 && (
                            <span className="text-muted-foreground">
                              ·{" "}
                              {t.coverage.firstCoveredDate &&
                                format(
                                  new Date(t.coverage.firstCoveredDate),
                                  "dd.MM",
                                )}
                              {t.coverage.firstCoveredDate !==
                                t.coverage.lastCoveredDate &&
                                ` → ${
                                  t.coverage.lastCoveredDate
                                    ? format(
                                        new Date(t.coverage.lastCoveredDate),
                                        "dd.MM",
                                      )
                                    : ""
                                }`}{" "}
                              ({t.coverage.coveredCount}/{t.coverage.capacity})
                            </span>
                          )}
                          {t.metadata?.mode === "SINGLE_UNCOVERED" && (
                            <span className="text-red-700 dark:text-red-400">
                              · Qarz
                            </span>
                          )}
                        </div>
                      ) : (
                        (t.description ?? "—")
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium whitespace-nowrap ${
                        t.amount >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {t.amount >= 0 ? "+" : ""}
                      {t.amount.toLocaleString("uz-UZ")} so&apos;m
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                      {t.balanceAfter.toLocaleString("uz-UZ")} so&apos;m
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(t.createdAt), "dd.MM.yyyy, HH:mm")}
                    </TableCell>
                    <TableCell className="text-center">
                      <ReceiptLink transaction={t} />
                    </TableCell>
                    <TableCell className="text-center">
                      {correctable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                            >
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Amallar</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                setCorrectTarget({
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
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">
          Hali to&apos;lov yoki tranzaksiya mavjud emas
        </p>
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

function ReceiptLink({ transaction }: { transaction: StudentTransaction }) {
  // Only Payment ledger rows have a receipt today. Refunds get one too,
  // but on the refunds page (separate UI). Other ledger types
  // (ADJUSTMENT, INITIAL_BALANCE) aren't customer-facing → no receipt.
  if (transaction.type !== "PAYMENT" || !transaction.payment?.id) {
    return <span className="text-muted-foreground">—</span>;
  }
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  const href = `${apiUrl}/receipts/payment/${transaction.payment.id}.pdf`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      <FileText className="size-3.5" />
      Kvitansiya
    </a>
  );
}

/**
 * One-line summary of where a payment went. Backend computes FIFO across the
 * student's full timeline; here we render a compact "Ketdi: Sikl #1 287 500
 * · Balansga 12 500" string. Adjacent allocations to the same cycle are
 * already merged server-side.
 */
function PaymentDestinationLine({
  destination,
}: {
  destination: NonNullable<StudentTransaction["destination"]>;
}) {
  const fmt = (n: number) => n.toLocaleString("uz-UZ");
  const parts: string[] = [];
  for (const a of destination.allocations) {
    if (a.cycleSequenceNumber > 0) {
      parts.push(
        `Sikl #${a.cycleSequenceNumber}${a.lessonsCovered ? ` (${a.lessonsCovered} dars)` : ""} — ${fmt(a.amount)}`,
      );
    } else {
      // Defensive: deduction without cycle metadata (legacy rows).
      parts.push(`Dars uchun — ${fmt(a.amount)}`);
    }
  }
  if (destination.remainderInBalance > 0) {
    parts.push(`Balansga — ${fmt(destination.remainderInBalance)}`);
  }
  if (parts.length === 0) return null;
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Ketdi:</span>{" "}
      {parts.join(" · ")}
    </div>
  );
}
