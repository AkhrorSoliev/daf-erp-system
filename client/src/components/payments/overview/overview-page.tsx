"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthStepper } from "@/components/shared/month-stepper";
import { ExportOptionsPopover } from "@/components/payments/export-options-popover";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { useCan, usePermissionsReady } from "@/hooks/use-permissions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { CashCard } from "./cash-card";
import { DebtCards } from "./debt-cards";
import { MonthChargesCard } from "./month-charges-card";
import { MonthsTable } from "./months-table";
import { REPORT_FLOOR_MONTH, clampMonth, monthRange } from "./overview-math";
import { ProfitCard } from "./profit-card";
import { OVERVIEW_QUERY_KEYS } from "./queries";
import { RecentPayments } from "./recent-payments";
import { SalaryCard } from "./salary-card";

const FILTERS = { month: { type: "string" as const, defaultValue: "" } };

/**
 * «Umumiy ma'lumotlar» (spec B1 §2). CEO and Branch Director get the month
 * picker and the money blocks; Administrator and Cashier get the title,
 * «To'lov qayd qilish» and the recent payments, and the page never asks the
 * money endpoint for them — it is CEO/BD on the server (ADR-0067).
 */
export function OverviewPage() {
  const canSeeMoney = useCan("reports.finance");
  // The "recent payments only" layout is the answer for a viewer WITHOUT the
  // capability, so it waits for the list: until then it is not known who that is.
  const minimalLayout = usePermissionsReady() && !canSeeMoney;
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);
  const { filters, setFilter } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = clampMonth(filters.month || current, REPORT_FLOOR_MONTH, current);
  const isCurrent = month === current;
  const range = monthRange(month);

  // A payment changes every block: refresh them all.
  const refreshAll = () => {
    for (const key of OVERVIEW_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Umumiy ma&apos;lumotlar</h2>
        <div className="flex flex-wrap items-center gap-2">
          {canSeeMoney && (
            <>
              <MonthStepper
                value={month}
                min={REPORT_FLOOR_MONTH}
                max={current}
                onChange={(m) => setFilter("month", m === current ? "" : m)}
              />
              <ExportOptionsPopover startStr={range.startDate} endStr={range.endDate} />
            </>
          )}
          <Button data-tour="payment-record" onClick={() => setRecording(true)}>
            <Plus className="mr-2 size-4" />
            To&apos;lov qayd qilish
          </Button>
        </div>
      </div>

      {canSeeMoney && (
        <>
          <MonthChargesCard month={month} isCurrent={isCurrent} />
          {isCurrent && <DebtCards month={month} />}
          <div className="grid gap-3 lg:grid-cols-3">
            <CashCard month={month} isCurrent={isCurrent} />
            <SalaryCard month={month} isCurrent={isCurrent} />
            <ProfitCard month={month} isCurrent={isCurrent} />
          </div>
          <MonthsTable month={month} current={current} />
        </>
      )}

      {(isCurrent || minimalLayout) && (
        <section className="space-y-3">
          <h3 className="font-heading text-base font-semibold">Oxirgi to&apos;lovlar</h3>
          <RecentPayments />
        </section>
      )}

      <RecordPaymentDialog open={recording} onOpenChange={setRecording} onSuccess={refreshAll} />
    </div>
  );
}
