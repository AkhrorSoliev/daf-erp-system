"use client";

import { Label } from "@/components/ui/label";
import { MonthPicker } from "@/components/ui/month-picker";
import { MonthStepper } from "@/components/shared/month-stepper";
import { BlockError, BlockSkeleton } from "@/components/payments/overview/block-state";
import { addMonths, currentMonthKey } from "@/components/payments/salary-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useCan } from "@/hooks/use-permissions";
import { KpiAdminTable } from "./kpi-admin-table";
import { KpiAttention } from "./kpi-attention";
import { KpiDailyChart, KpiMonthsChart } from "./kpi-charts";
import {
  COMPARE_FLOOR_MONTH,
  KPI_DEFINITIONS,
  KPI_FIRST_MONTH,
  kpiCompare,
  kpiMonth,
  switchText,
} from "./kpi-format";
import { useKpiOverview } from "./kpi-queries";
import { KpiSummaryCards } from "./kpi-summary-cards";
import { KpiUserDrawer } from "./kpi-user-drawer";

// Defaults are omitted from the URL: the current month, the month before it, nobody open.
const FILTERS = {
  oy: { type: "string" as const, defaultValue: "" },
  bilan: { type: "string" as const, defaultValue: "" },
  xodim: { type: "number" as const, defaultValue: 0 },
};

/** «Xodimlar KPI» (spec §7.7), `kpi.view`: CEO and Branch Director. The server checks it too. */
export function KpiOverviewPage() {
  const canView = useCan("kpi.view");
  // No capability, no request: the layout redirects, this keeps the call from firing meanwhile.
  return canView ? <KpiOverview /> : null;
}

/** Every figure is the server's; the page only formats. */
function KpiOverview() {
  const { filters, setFilter, setFilters } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = kpiMonth(filters.oy, current);
  const compare = kpiCompare(filters.bilan, month);
  const q = useKpiOverview(month, compare);
  const open = (userId: number) => setFilter("xodim", userId);
  const openUser = filters.xodim || null;
  const openName = q.data?.rows.find((r) => r.userId === openUser)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Xodimlar KPI</h2>
        <div className="flex flex-wrap items-center gap-3">
          <MonthStepper
            value={month}
            min={KPI_FIRST_MONTH}
            max={current}
            onChange={(m) => setFilters({ oy: m === current ? "" : m, bilan: "", xodim: 0 })}
          />
          <div className="flex items-center gap-2">
            <Label htmlFor="kpi-compare" className="text-sm text-muted-foreground">
              Taqqoslash
            </Label>
            <MonthPicker
              id="kpi-compare"
              value={compare}
              minMonth={COMPARE_FLOOR_MONTH}
              maxMonth={addMonths(month, -1)}
              onChange={(m) => setFilter("bilan", m === addMonths(month, -1) ? "" : m)}
              className="w-44"
            />
          </div>
        </div>
      </div>

      {q.isPending ? (
        <BlockSkeleton className="h-64" />
      ) : q.isError ? (
        <BlockError title="Xodimlar KPI" onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-sm">
            <span className={q.data.status.enabled ? undefined : "text-destructive"}>{switchText(q.data.status)}</span>
            <span className="text-muted-foreground">Kuzatuv: pul hali berilmaydi</span>
          </div>
          <KpiSummaryCards data={q.data} isCurrent={month === current} />
          <KpiAttention signals={q.data.signals} onOpen={open} />
          <div className="grid gap-4 lg:grid-cols-2">
            <KpiDailyChart
              data={q.data.daily}
              month={q.data.month}
              compare={q.data.compare}
              compareAvailable={q.data.compareAvailable}
            />
            <KpiMonthsChart data={q.data.months} />
          </div>
          <section className="space-y-3">
            <h3 className="font-medium">Administratorlar</h3>
            <KpiAdminTable rows={q.data.rows} compareAvailable={q.data.compareAvailable} onOpen={open} />
            <dl className="space-y-1 text-xs text-muted-foreground">
              {KPI_DEFINITIONS.map((d) => (
                <div key={d.term}>
                  <dt className="inline font-medium text-foreground">{d.term}</dt> — <dd className="inline">{d.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
      <KpiUserDrawer userId={openUser} name={openName} month={month} onClose={() => setFilter("xodim", 0)} />
    </div>
  );
}
