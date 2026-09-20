"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import api from "@/lib/api";
import { formatNumber } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LeadFunnelBars } from "./lead-funnel-bars";
import {
  LeadFunnelBreakdownCard,
  type BreakdownRow,
} from "./lead-funnel-breakdown-card";
import { LeadFunnelKpiRow } from "./lead-funnel-kpi-row";
import {
  biggestLossStage,
  buildFunnelRows,
  collapseSources,
  displayDate,
  isPeopleStage,
  rangeIncludesToday,
  resolvePeriodFilter,
  type PeriodPreset,
} from "./lead-funnel-math";
import { LeadFunnelPeopleDialog } from "./lead-funnel-people-dialog";
import { LeadFunnelPeriodControl } from "./lead-funnel-period-control";
import type {
  FunnelStage,
  LeadFunnelResponse,
  UnpaidStatusBucket,
} from "./lead-funnel-types";
import { LeadFunnelUnpaidTiles } from "./lead-funnel-unpaid-tiles";

const FILTER_SCHEMA = {
  period: { type: "string" as const, defaultValue: "" },
  startDate: { type: "string" as const, defaultValue: "" },
  endDate: { type: "string" as const, defaultValue: "" },
  people: { type: "string" as const, defaultValue: "" },
  source: { type: "string" as const, defaultValue: "" },
  status: { type: "string" as const, defaultValue: "" },
};

const HOW_TO_READ =
  "Davrda kelgan lidlar olinadi va keyingi qadamlari davrdan keyin bo'lsa ham kuzatiladi. Bir odamning bir nechta lidi bitta hisoblanadi.\n\nVoronka 10.09.2026 dan sanaydi: shu kundan har bir yangi o'quvchi lid yozuvi qoldiradi. Undan oldingi sanani tanlab bo'lmaydi.";

const STILL_RUNNING =
  "Davr hali tugamagan: yaqinda kelganlar keyingi bosqichlarga ulgurmagan, shuning uchun foizlar keyinroq oshadi.";

export function LeadFunnelClient() {
  const { filters, setFilters } = useUrlFilters(FILTER_SCHEMA);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);

  const period = useMemo(
    () =>
      resolvePeriodFilter({
        period: filters.period,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    [filters.period, filters.startDate, filters.endDate],
  );
  const range = { startDate: period.startDate, endDate: period.endDate };

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["reports", "lead-funnel", selectedBranch?.id ?? "all", range.startDate, range.endDate],
    queryFn: () =>
      api
        .get<LeadFunnelResponse>("/reports/lead-funnel", { params: range })
        .then((r) => r.data),
    enabled: branchLoaded,
  });

  const rows = useMemo(() => (data ? buildFunnelRows(data.stages) : []), [data]);
  const biggestLoss = useMemo(() => biggestLossStage(rows), [rows]);
  const sourceRows = useMemo(() => collapseSources(data?.bySource ?? []), [data]);
  const byBranch = data?.byBranch ?? [];

  const setPreset = useCallback(
    (preset: Exclude<PeriodPreset, "oraliq">) =>
      setFilters({ period: preset === "shu-oy" ? "" : preset, startDate: "", endDate: "" }),
    [setFilters],
  );
  const setCustomRange = useCallback(
    (next: { startDate: string; endDate: string }) =>
      setFilters({ period: "oraliq", ...next }),
    [setFilters],
  );

  // Ochiq ro'yxat URL'da yashaydi (drawer/dialog qoidasi); yopilganda uchalasi o'chadi.
  const openPeople = useCallback(
    (stage: string, extra: { source?: string; status?: string } = {}) =>
      setFilters({ people: stage, source: extra.source ?? "", status: extra.status ?? "" }),
    [setFilters],
  );
  const closePeople = useCallback(
    () => setFilters({ people: "", source: "", status: "" }),
    [setFilters],
  );
  const openStage = isPeopleStage(filters.people) ? filters.people : null;
  const sourceName =
    data?.bySource.find((s) => (s.id ?? "none") === filters.source)?.name ?? null;

  const branchRows: BreakdownRow[] = byBranch.map((b) => ({
    key: b.id === null ? "none" : String(b.id),
    name: b.name ?? "Belgilanmagan",
    lead: b.lead,
    paid: b.paid,
    clickable: false,
  }));
  const sourceList: BreakdownRow[] = sourceRows.map((s) => ({
    key: s.key,
    name: s.isRest ? (s.name ?? "") : (s.name ?? "Manbasiz"),
    lead: s.lead,
    paid: s.paid,
    clickable: !s.isRest,
  }));
  const showBranches = byBranch.length >= 2;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight">Lidlar hisoboti</h2>
          <p className="text-sm text-muted-foreground">
            Markazga kelgan odam to&apos;lovgacha qaysi bosqichda tushib qolmoqda
          </p>
        </div>
        <LeadFunnelPeriodControl
          preset={period.preset}
          startDate={period.startDate}
          endDate={period.endDate}
          onPreset={setPreset}
          onCustomRange={setCustomRange}
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground tabular-nums">
        <span>
          {displayDate(data?.period.startDate ?? range.startDate)} –{" "}
          {displayDate(data?.period.endDate ?? range.endDate)}
        </span>
        {rangeIncludesToday(range) && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">davom etmoqda</span>
        )}
        <span>· {selectedBranch?.name ?? "Barcha filiallar"}</span>
        {data && <span>· {formatNumber(data.stages.lead)} kishi kuzatildi</span>}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Qanday o'qiladi"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm whitespace-pre-line">
            {rangeIncludesToday(range) ? `${STILL_RUNNING}\n\n${HOW_TO_READ}` : HOW_TO_READ}
          </TooltipContent>
        </Tooltip>
      </p>

      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">Hisobotni yuklab bo&apos;lmadi.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : isPending || !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="space-y-2 rounded-xl border bg-card p-5">
            {[1, 0.4, 0.32, 0.09].map((w) => (
              <Skeleton key={w} className="h-7" style={{ width: `${w * 100}%` }} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <LeadFunnelKpiRow
            data={data}
            onOpenUnpaidActive={() => openPeople("unpaid", { status: "active" })}
          />

          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <h3 className="mb-3 font-semibold">Lid voronkasi</h3>
            {data.stages.lead === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Tanlangan davrda lid yo&apos;q: davrni kengaytirib ko&apos;ring.
              </p>
            ) : (
              <LeadFunnelBars
                rows={rows}
                leadSplit={data.leadSplit}
                biggestLoss={biggestLoss}
                onStageClick={(stage: FunnelStage) => openPeople(stage)}
                onLossClick={(stage) => openPeople(stage, { status: "stuck" })}
              />
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Bosqichni bosing: o&apos;sha bosqichdagi odamlar ro&apos;yxati ochiladi.
            </p>
          </section>

          <div className={showBranches ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
            <LeadFunnelBreakdownCard
              title="Manba bo'yicha"
              tooltip="Har manbadan kelganlarning necha foizi to'lov qildi. Qatorni bosing: o'sha manbadan kelganlar ro'yxati."
              rows={sourceList}
              emptyMessage="Bu davrda lid yo'q"
              onRowClick={(key) => openPeople("lead", { source: key })}
            />
            {showBranches && (
              <LeadFunnelBreakdownCard
                title="Filial bo'yicha"
                tooltip="Lid qaysi filialga tegishli bo'lsa, o'sha yerda sanaladi. «Belgilanmagan»: hali filialga biriktirilmagan lidlar."
                rows={branchRows}
                emptyMessage="Bu davrda lid yo'q"
              />
            )}
          </div>

          <LeadFunnelUnpaidTiles
            unpaid={data.unpaid}
            onOpen={(status: UnpaidStatusBucket) => openPeople("unpaid", { status })}
            onOpenAll={() => openPeople("unpaid", { status: "" })}
          />
        </>
      )}

      <LeadFunnelPeopleDialog
        stage={openStage}
        sourceId={filters.source}
        sourceName={sourceName}
        status={filters.status}
        initialMode={filters.status === "stuck" ? "stuck" : "all"}
        range={range}
        onOpenChange={(open) => !open && closePeople()}
      />
    </div>
  );
}
