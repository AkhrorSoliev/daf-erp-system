"use client";

import { format } from "date-fns";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PAYMENT_METHOD_LABELS,
  TRANSACTION_TYPE_INFO,
  type StudentTransaction,
} from "./student-profile-tabs-utils";

interface StudentPaymentsTableProps {
  isLoading: boolean;
  balance: number;
  transactions: StudentTransaction[];
}

export function StudentPaymentsTable({
  isLoading,
  balance,
  transactions,
}: StudentPaymentsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded" />
        ))}
      </div>
    );
  }

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t, i) => {
                const typeInfo = TRANSACTION_TYPE_INFO[t.type] ?? {
                  label: t.type,
                  variant: "outline" as const,
                };
                const isPayment = t.type === "PAYMENT";
                const methodLabel = t.payment?.method
                  ? (PAYMENT_METHOD_LABELS[t.payment.method] ?? t.payment.method)
                  : null;
                const cashier = t.performedBy
                  ? `${t.performedBy.firstName} ${t.performedBy.lastName}`
                  : null;

                return (
                  <TableRow key={t.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {isPayment ? (
                        <span className="flex flex-wrap items-center gap-2">
                          {methodLabel && (
                            <Badge variant="secondary">{methodLabel}</Badge>
                          )}
                          {cashier && <span>Qabul qildi: {cashier}</span>}
                          {!methodLabel && !cashier && "—"}
                        </span>
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
