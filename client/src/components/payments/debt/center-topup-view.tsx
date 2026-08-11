"use client";

import { MonthPicker } from "@/components/ui/month-picker";
import { currentMonthKey } from "../salary-utils";
import { CenterTopUpContent } from "./center-topup-content";
import { useDebtFilters, useSelectedMonth } from "./debt-filters-provider";

/** Payroll top-up started here; earlier months have nothing to report. */
const FLOOR_MONTH = "2026-07";

/**
 * "Markaz qo'shimchasi" as a tab: the same list the salary page shows in a
 * dialog, with a month picker in front of it.
 *
 * The picker lives here rather than inside the content, so the dialog — which
 * already knows its month — does not have to switch one off.
 */
export function CenterTopUpView() {
  const { setFilters } = useDebtFilters();
  const month = useSelectedMonth();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Markaz o&apos;quvchilar to&apos;lamagan darslar uchun ustozlarga pul
          to&apos;lab bergan. Bu yerda o&apos;sha pul kimdan undirilishi
          kerakligi ko&apos;rinadi.
        </p>
        <MonthPicker
          value={month}
          onChange={(v) => setFilters({ month: v })}
          minMonth={FLOOR_MONTH}
          maxMonth={currentMonthKey()}
        />
      </div>

      <CenterTopUpContent month={month} />
    </div>
  );
}
