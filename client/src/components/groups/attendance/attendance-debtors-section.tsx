"use client";

import { useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { formatBalance, formatPrice } from "@/lib/format-utils";
import type { DebtorCurrentCycle, DebtorStudent } from "./attendance-form-utils";

/** "YYYY-MM-DD" → "dd.MM" (Tashkent kunini siljitmasdan). */
function shortDate(date: string): string {
  return format(new Date(date + "T00:00:00"), "dd.MM");
}

function currentCycleText(cycle: DebtorCurrentCycle | null | undefined): string {
  if (!cycle) return "Sikl boshlanmagan";
  if (cycle.firstCoveredDate) {
    const range =
      cycle.lastCoveredDate && cycle.lastCoveredDate !== cycle.firstCoveredDate
        ? `${shortDate(cycle.firstCoveredDate)} — ${shortDate(cycle.lastCoveredDate)}`
        : shortDate(cycle.firstCoveredDate);
    return `${range} (${cycle.coveredCount}/${cycle.capacity})`;
  }
  return `${cycle.capacity} dars — boshlanmagan`;
}

interface AttendanceDebtorsSectionProps {
  debtors: DebtorStudent[];
  /**
   * Suggested payment amount — typically the group's full course price so
   * one click pre-fills the dialog with the right amount. Falls back to
   * the per-student debt amount when 0/missing.
   */
  suggestedAmount: number;
  /**
   * Called after a successful payment so the parent can re-fetch the
   * attendance roster — the paying student should immediately move from
   * the debtors panel up to the active list.
   */
  onPaymentSuccess: () => void;
}

/**
 * Admin-only panel rendered below the attendance form. Surfaces students
 * whose balance has gone negative (real debt accumulated from previously
 * attended lessons), with a one-click "to'lov qabul qilish" button that
 * pre-selects them in the standard payment dialog. Closes the loop
 * between "this student keeps attending without paying" and "collect
 * their payment" without forcing the admin to navigate elsewhere.
 */
export function AttendanceDebtorsSection({
  debtors,
  suggestedAmount,
  onPaymentSuccess,
}: AttendanceDebtorsSectionProps) {
  const [paymentTarget, setPaymentTarget] = useState<DebtorStudent | null>(
    null,
  );

  if (debtors.length === 0) return null;

  return (
    <>
      <Card className="mt-6 border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-300">
            <AlertTriangle className="size-5" />
            Qarzdorlar — {debtors.length} ta
          </CardTitle>
          <CardDescription className="text-amber-700/80 dark:text-amber-400/80">
            Bu o&apos;quvchilarning balansi manfiyga tushgan. Davomat
            olinishi davom etadi va har bir dars bahosi balansdan
            ushlanmoqda — to&apos;lov qabul qilingach, ustozning oyligiga
            ham hisoblanadi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>O&apos;quvchi</TableHead>
                  <TableHead>Joriy sikl</TableHead>
                  <TableHead className="text-right">Balans</TableHead>
                  <TableHead className="text-right">Yetmaydi</TableHead>
                  <TableHead className="text-right">Tavsiya</TableHead>
                  <TableHead className="w-44" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {debtors.map((d, i) => (
                  <TableRow key={d.studentId}>
                    <TableCell className="border-r text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {d.firstName} {d.lastName}
                      <span className="ml-2 text-xs text-muted-foreground">
                        #{d.studentId}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {currentCycleText(d.currentCycle)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-destructive">
                      {formatBalance(d.balance)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                      {formatPrice(d.debtAmount)} so&apos;m
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-semibold">
                      {formatPrice(suggestedAmount || d.debtAmount)} so&apos;m
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPaymentTarget(d)}
                        className="w-full"
                      >
                        <CreditCard className="mr-1.5 size-3.5" />
                        To&apos;lov qabul qilish
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {paymentTarget && (
        <RecordPaymentDialog
          open
          onOpenChange={(o) => {
            if (!o) setPaymentTarget(null);
          }}
          preSelectedStudent={{
            id: paymentTarget.studentId,
            firstName: paymentTarget.firstName,
            lastName: paymentTarget.lastName,
            balance: paymentTarget.balance,
          }}
          suggestedAmount={suggestedAmount || paymentTarget.debtAmount}
          onSuccess={() => {
            setPaymentTarget(null);
            onPaymentSuccess();
          }}
        />
      )}
    </>
  );
}
