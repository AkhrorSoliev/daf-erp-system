"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCan } from "@/hooks/use-permissions";
import { useT } from "@/i18n/context";
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
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t("{month} foydasi qanday hisoblandi", { month: monthShort(month, t) })}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ProfitBreakdown month={month} composition={composition} />
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Yopish")}
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
  const t = useT();
  const canEditRates = useCan("settings.tax");
  const missing = composition.taxes.missingRates.length;
  return (
    <div className="space-y-2 text-sm">
      {profitLines(composition, t).map((line) => (
        <div key={line.label} className="flex justify-between gap-2">
          <span className="text-muted-foreground">{line.label}</span>
          <span className="tabular-nums">{som(line.amount, t)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-2 border-t pt-2 font-semibold">
        <span>{t("Foyda")}</span>
        <span className="tabular-nums">{som(composition.netProfit, t)}</span>
      </div>
      {missing > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {t("Hisob to'liq emas: {n} ta stavka kiritilmagan", { n: missing })}
          {canEditRates && (
            <>
              {" "}
              <Link href="/settings/tax" className="font-medium underline">
                {t("Stavkalarni kiritish →")}
              </Link>
            </>
          )}
        </p>
      )}
      {month >= FULL_TEACHER_PAY_MONTH && composition.teacherSalaryBasis === "hisoblangan" && (
        <p className="text-xs text-muted-foreground">{t("Ustozlar oyligi — Ish haqi sahifasidagi jami bilan bir xil")}</p>
      )}
    </div>
  );
}
