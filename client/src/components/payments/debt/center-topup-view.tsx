"use client";

import { MonthPicker } from "@/components/ui/month-picker";
import { useT } from "@/i18n/context";
import { currentMonthKey } from "../salary-utils";
import { ALL_MONTHS, CenterTopUpContent } from "./center-topup-content";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { SalaryCenterRecoveryCard } from "../salary/salary-center-recovery-card";

/** Payroll top-up started here; earlier months have nothing to report. */
const FLOOR_MONTH = "2026-07";

/** Only the month: the tab lives on the salary page now (ADR-0072). Empty = the whole period. */
const CENTER_TOPUP_SCHEMA = { month: { type: "string", defaultValue: "" } } as const;

/**
 * "Markaz qoplagani" — a tab of the salary page (ADR-0072),
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
  const t = useT();
  const { filters, setFilters } = useUrlFilters(CENTER_TOPUP_SCHEMA);
  const month = filters.month;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("Markaz o'quvchilar to'lamagan darslar uchun ustozlarga pul to'lab bergan. Bu yerda o'sha pul kimdan undirilishi kerakligi ko'rinadi.")}{" "}
          <span className="text-foreground">
            {t("Davr tanlovi qaysi oydagi darslar hisobga olinishini belgilaydi — o'quvchining qarz summasi o'zgarmaydi.")}
          </span>
        </p>
        <MonthPicker
          value={month || null}
          placeholder={t("Butun davr")}
          onChange={(v) => setFilters({ month: v })}
          onClear={() => setFilters({ month: "" })}
          minMonth={FLOOR_MONTH}
          maxMonth={currentMonthKey()}
          className="w-56 shrink-0"
        />
      </div>

      {/* The month's recovery lifecycle, moved here from «Oyliklar» (spec §2.4). */}
      {month && <SalaryCenterRecoveryCard month={month} />}

      <CenterTopUpContent month={month || ALL_MONTHS} />
    </div>
  );
}
