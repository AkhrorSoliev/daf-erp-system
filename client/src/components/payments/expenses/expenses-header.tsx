"use client";

import { FileText, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { MonthStepper } from "@/components/shared/month-stepper";
import { EXPENSES_FIRST_MONTH } from "./expenses-url";

/** «Xarajatlar», «‹ Oy ›», «PDF» and «Xarajat qo'shish» (spec B6 §3.2). The write button only with `expenses.manage`. */
export function ExpensesHeader({ month, current, canManage, exporting, pdfDisabled, onMonth, onPdf, onAdd }: {
  month: string;
  current: string;
  canManage: boolean;
  exporting: boolean;
  /** The list is empty. */
  pdfDisabled: boolean;
  onMonth: (month: string) => void;
  onPdf: () => void;
  onAdd: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="font-heading text-lg font-semibold tracking-tight">{t("Xarajatlar")}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <MonthStepper value={month} min={EXPENSES_FIRST_MONTH} max={current} onChange={onMonth} />
        <Button variant="outline" onClick={onPdf} disabled={exporting || pdfDisabled}>
          {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}
          PDF
        </Button>
        {canManage && (
          <Button onClick={onAdd}>
            <Plus className="mr-2 size-4" />
            {t("Xarajat qo'shish")}
          </Button>
        )}
      </div>
    </div>
  );
}
