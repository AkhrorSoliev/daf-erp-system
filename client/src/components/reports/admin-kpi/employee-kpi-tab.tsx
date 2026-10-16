"use client";

import { currentMonthKey } from "@/components/payments/salary-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { kpiMonth } from "./kpi-format";
import { KpiUserPanel } from "./kpi-user-panel";

const FILTERS = { kpi_oy: { type: "string" as const, defaultValue: "" } };

/** The employee page's «KPI» tab (spec §7.8). The month is `?kpi_oy=` (a page-level `?tab=` already exists). */
export function EmployeeKpiTab({ userId }: { userId: number }) {
  const { filters, setFilter } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = kpiMonth(filters.kpi_oy, current);
  return (
    <KpiUserPanel
      key={month}
      userId={userId}
      month={month}
      onMonthChange={(m) => setFilter("kpi_oy", m === current ? "" : m)}
    />
  );
}
