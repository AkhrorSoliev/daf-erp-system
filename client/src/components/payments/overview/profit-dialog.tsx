"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { monthShort } from "@/components/payments/salary-utils";
import { FULL_TEACHER_PAY_MONTH, profitLines, som } from "./overview-math";
import type { ProfitComposition } from "./types";

/** «Qanday hisoblandi» (spec B1 §2.4): only the lines that make up the profit, as one equation. */
export function ProfitDialog({
  open,
  onOpenChange,
  month,
  composition,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  composition: ProfitComposition;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{monthShort(month)} foydasi qanday hisoblandi</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ProfitBreakdown month={month} composition={composition} />
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The lines, signed, then «Foyda». From 2026-07 teacher pay is the full
 * deserved figure, so only from then — and only when the server computed it
 * rather than falling back to cash paid — is it the Ish haqi page's total.
 */
export function ProfitBreakdown({ month, composition }: { month: string; composition: ProfitComposition }) {
  return (
    <div className="space-y-2 text-sm">
      {profitLines(composition).map((line) => (
        <div key={line.label} className="flex justify-between gap-2">
          <span className="text-muted-foreground">{line.label}</span>
          <span className="tabular-nums">{som(line.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-2 border-t pt-2 font-semibold">
        <span>Foyda</span>
        <span className="tabular-nums">{som(composition.netProfit)}</span>
      </div>
      {month >= FULL_TEACHER_PAY_MONTH && composition.teacherSalaryBasis === "hisoblangan" && (
        <p className="text-xs text-muted-foreground">Ustozlar oyligi — Ish haqi sahifasidagi jami bilan bir xil</p>
      )}
    </div>
  );
}
