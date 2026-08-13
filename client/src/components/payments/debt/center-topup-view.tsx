"use client";

import { MonthPicker } from "@/components/ui/month-picker";
import { currentMonthKey } from "../salary-utils";
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
 *
 * The control is the project's `MonthPicker` — year arrows over a grid of all
 * twelve months — rather than a flat list of the months that happen to have
 * data. A list is shorter today and stops being readable the moment the top-up
 * era spans a year. "Butun davr" rides on top of the grid as the picker's
 * clear option.
 */
export function CenterTopUpView() {
  const { filters, setFilters } = useDebtFilters();
  const month = filters.month;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Markaz o&apos;quvchilar to&apos;lamagan darslar uchun ustozlarga pul
          to&apos;lab bergan. Bu yerda o&apos;sha pul kimdan undirilishi
          kerakligi ko&apos;rinadi.{" "}
          <span className="text-foreground">
            Davr tanlovi qaysi oydagi darslar hisobga olinishini belgilaydi —
            o&apos;quvchining qarz summasi o&apos;zgarmaydi.
          </span>
        </p>
        <MonthPicker
          value={month || null}
          placeholder="Butun davr"
          onChange={(v) => setFilters({ month: v, page: 1 })}
          onClear={() => setFilters({ month: "", page: 1 })}
          minMonth={FLOOR_MONTH}
          maxMonth={currentMonthKey()}
          className="w-56 shrink-0"
        />
      </div>

      <CenterTopUpContent month={month || ALL_MONTHS} />
    </div>
  );
}
