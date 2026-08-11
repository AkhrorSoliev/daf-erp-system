"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currentMonthKey, monthLabel, monthsBetween } from "../salary-utils";
import { ALL_MONTHS, CenterTopUpContent } from "./center-topup-content";
import { useDebtFilters } from "./debt-filters-provider";

/** Payroll top-up started here; earlier months have nothing to report. */
const FLOOR_MONTH = "2026-07";

/**
 * "Markaz qoplagani" as a tab: the same list the salary page shows in a dialog,
 * over a chosen month or — by default — every month.
 *
 * The default is deliberately the whole period, not the current month. A
 * student's debt is one debt built up across months, so opening on "this month"
 * both hid every earlier debtor behind a control and, in an August with no
 * settled payroll yet, showed an empty page under a heading promising a list.
 * A plain `<Select>` rather than a `MonthPicker`, because "Butun davr" is one
 * of the choices and a calendar cannot offer it.
 */
export function CenterTopUpView() {
  const { setFilters } = useDebtFilters();
  const { filters } = useDebtFilters();
  const value = filters.month || ALL_MONTHS;
  const months = monthsBetween(FLOOR_MONTH, currentMonthKey()).reverse();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Markaz o&apos;quvchilar to&apos;lamagan darslar uchun ustozlarga pul
          to&apos;lab bergan. Bu yerda o&apos;sha pul kimdan undirilishi
          kerakligi ko&apos;rinadi.
        </p>
        <Select
          value={value}
          onValueChange={(v) =>
            setFilters({ month: v === ALL_MONTHS ? "" : v, page: 1 })
          }
        >
          <SelectTrigger className="w-44" aria-label="Davr">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_MONTHS}>Butun davr</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CenterTopUpContent month={value} />
    </div>
  );
}
