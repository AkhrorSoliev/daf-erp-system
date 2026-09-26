"use client";

import { MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CorrectablePayment } from "../correct-payment-dialog";
import { ReceiptLink } from "./receipt-link";
import type { AllocationView, ModelAllocation } from "./statement-types";

/**
 * "To'lovlar qayerga ketdi": every payment and credit, and which dues it
 * paid. `models[i]` is the same allocation as `rows[i]`; it carries the
 * numbers the correction dialog needs.
 */
export function StatementAllocations({
  rows,
  models,
  isCorrectable,
  onCorrect,
}: {
  rows: AllocationView[];
  models: ModelAllocation[];
  isCorrectable: (a: ModelAllocation) => boolean;
  onCorrect: (p: CorrectablePayment) => void;
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((r, i) => {
        const m = models[i];
        const correctable = m ? isCorrectable(m) : false;
        return (
          <li
            key={`${r.paymentId ?? "credit"}-${i}`}
            className="flex items-start justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm">
                <span className="text-muted-foreground">{r.date}</span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                <span className="font-medium">{r.what}</span>
                <span className="ml-2 font-mono font-semibold tabular-nums">
                  {r.amount}
                </span>
              </p>
              {r.to && (
                <p className="text-xs text-muted-foreground">→ {r.to}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {r.paymentId && <ReceiptLink paymentId={r.paymentId} />}
              {correctable && m?.paymentId && m.method && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7">
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
          </li>
        );
      })}
    </ul>
  );
}
