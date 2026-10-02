"use client";

import { MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CorrectablePayment } from "../correct-payment-dialog";
import { ReceiptLink } from "./receipt-link";
import type { ModelAllocation, PaymentView } from "./statement-types";

const AMOUNT = "text-right font-mono tabular-nums";

/**
 * "To'lovlar": every payment, oldest first, with the months it went to and
 * the total. `models[i]` is the same payment as `rows[i]`; it carries the
 * numbers the correction dialog needs.
 */
export function StatementPayments({
  rows,
  total,
  models,
  isCorrectable,
  onCorrect,
}: {
  rows: PaymentView[];
  total: string | null;
  models: ModelAllocation[];
  isCorrectable: (a: ModelAllocation) => boolean;
  onCorrect: (p: CorrectablePayment) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
        Hali to&apos;lov qilinmagan.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sana</TableHead>
            <TableHead>Usul</TableHead>
            <TableHead className="text-right">Summa</TableHead>
            <TableHead>Qaysi oyga yozildi</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const m = models[i];
            const correctable = m ? isCorrectable(m) : false;
            return (
              <TableRow key={`${r.paymentId ?? "payment"}-${i}`}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {r.date}
                </TableCell>
                <TableCell>{r.what}</TableCell>
                <TableCell className={`${AMOUNT} font-semibold`}>
                  {r.amount}
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {r.to}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {r.paymentId && <ReceiptLink paymentId={r.paymentId} />}
                    {correctable && m?.paymentId && m.method && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                          >
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Amallar</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              onCorrect({
                                id: m.paymentId!,
                                amount: m.amount,
                                method: m.method!,
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
                </TableCell>
              </TableRow>
            );
          })}
          {total && (
            <TableRow className="border-t-2 font-semibold hover:bg-transparent">
              <TableCell colSpan={2}>Jami to&apos;langan</TableCell>
              <TableCell className={AMOUNT}>{total}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
