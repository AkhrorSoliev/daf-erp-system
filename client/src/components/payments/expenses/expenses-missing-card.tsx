"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/i18n/context";
import { emptyBranchTitle, keepsMonthCapital, MISSING_FOOTNOTE, missingText, missingTitle } from "./expenses-format";
import type { MissingRow, MonthSummary } from "./expenses-types";

/** «Bu oy hali yozilmagan» (spec B6 §3.3): the current month only, and only with a row. «Xarajatni yozish» only with `expenses.manage`. */
export function ExpensesMissingCard({ summary, canManage, onWrite }: {
  summary: MonthSummary;
  canManage: boolean;
  onWrite: (row: MissingRow) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  if (!summary.isCurrentMonth || (summary.missing.length === 0 && summary.emptyBranches.length === 0)) return null;
  return (
    <Alert className="border-amber-500/40 bg-amber-500/10">
      <AlertTriangle className="text-amber-600 dark:text-amber-400" />
      <AlertTitle>{t("Bu oy hali yozilmagan")}</AlertTitle>
      <AlertDescription className="space-y-2">
        <ul className="space-y-1.5">
          {summary.missing.map((r) => (
            <li key={`${r.key}-${r.branchId}`} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b>{missingTitle(r, summary.multiBranch, t)}</b> — {missingText(r, summary.month, t, !keepsMonthCapital(locale))}
              </span>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => onWrite(r)}>
                  {t("Xarajatni yozish")}
                </Button>
              )}
            </li>
          ))}
          {summary.emptyBranches.map((b) => (
            <li key={`branch-${b.id}`}>
              <b>{emptyBranchTitle(b.name, t)}</b> — {t("bu oy bitta ham xarajat yozilmagan")}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t(MISSING_FOOTNOTE)}</p>
      </AlertDescription>
    </Alert>
  );
}
