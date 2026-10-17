"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Settings } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-permissions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { downloadAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentDayAsLocalDate } from "@/lib/tashkent-time";
import { cn } from "@/lib/utils";
import { lastPageIfPast } from "@/components/payments/debt/debt-url";
import { DepartedCards } from "./departed-cards";
import { DepartedCuts } from "./departed-cuts";
import { DepartedFilterBar } from "./departed-filter-bar";
import { previousLabel, rangeLabel } from "./departed-format";
import { DepartedList } from "./departed-list";
import { DepartedMonths } from "./departed-months";
import { DepartedPending } from "./departed-pending";
import { useDepartedList, useDepartedOverview } from "./departed-queries";
import { DepartedReasons } from "./departed-reasons";
import { DepartureReasonsDialog } from "./departure-reasons-dialog";
import { TeacherChangeRetentionCards } from "./teacher-change-retention-cards";
import {
  DEPARTED_SCHEMA, cleanCut, departedExcelFileName, departedExcelParams, departedParams, listParams, resolveDepartedRange,
  type DepartedFilters,
} from "./departed-url";

/** «Ketgan o'quvchilar» (spec B7a §4). Every figure is the server's; the page only arranges and formats. */
export function DepartedStudentsPage() {
  const { filters: raw, setFilters } = useUrlFilters(DEPARTED_SCHEMA);
  const filters = raw as unknown as DepartedFilters;
  const canManageReasons = useCan("settings.reference");
  const [exporting, setExporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // The Tashkent day, fixed for the visit: the period must not move under the user.
  const today = useMemo(() => tashkentDayAsLocalDate(new Date()), []);

  const range = resolveDepartedRange(filters.preset, filters.startDate, filters.endDate, today);
  const overview = useDepartedOverview(departedParams(filters, today));
  const params = listParams(filters, today);
  const list = useDepartedList(params);
  const stale = overview.isPlaceholderData;
  const data = overview.data;

  // A page past the last one (a filter narrowed the list, an old link) goes to the last page that has rows.
  const listData = list.data;
  const lastPage = listData && !list.isPlaceholderData ? lastPageIfPast(Number(params.page), Number(params.pageSize), listData.total, listData.data.length) : null;
  useEffect(() => {
    if (lastPage !== null) setFilters({ page: lastPage });
  }, [lastPage, setFilters]);

  // Any filter change puts the list back on page 1 — here and nowhere else.
  const onChange = useCallback((u: Partial<DepartedFilters>) => setFilters({ page: 1, ...u }), [setFilters]);

  // «Boshqa sabab» comments are read in the list: filter it to that reason and bring it into view.
  const readComments = (reasonId: string | null) => {
    onChange({ reason: reasonId ?? "none" });
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function exportExcel() {
    setExporting(true);
    try {
      const qs = new URLSearchParams(Object.entries(departedExcelParams(filters, today)).map(([k, v]) => [k, String(v)])).toString();
      await downloadAuthedFile(`/reports/departed-students/excel?${qs}`, departedExcelFileName(range));
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    } finally {
      setExporting(false);
    }
  }

  const base = departedParams(filters, today);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Ketgan o&apos;quvchilar</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={exportExcel} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            Excel
          </Button>
          {canManageReasons && (
            <Button type="button" variant="outline" size="icon" aria-label="Ketish sabablarini boshqarish" title="Ketish sabablarini boshqarish" onClick={() => setSettingsOpen(true)}>
              <Settings />
            </Button>
          )}
        </div>
      </div>

      <DepartedFilterBar filters={filters} today={today} onChange={onChange} />

      {overview.isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Ma&apos;lumotni yuklab bo&apos;lmadi</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => overview.refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : (
        // The previous answer stays dimmed until the next one lands.
        <div aria-busy={stale} className={cn("flex flex-col gap-4", stale && "opacity-60")}>
          <DepartedCards data={data} previousLabel={data ? previousLabel(filters.preset, data.previous) : ""} isLoading={!data} />
          {data && <DepartedPending count={data.pendingToday} graceDays={data.graceDays} />}
          <div className="grid gap-4 lg:grid-cols-2">
            <DepartedMonths months={data?.months} isLoading={!data} />
            <DepartedReasons reasons={data?.reasons} isLoading={!data} onReadComments={readComments} />
          </div>
          <DepartedCuts
            cuts={data?.cuts}
            uniqueDeparted={data?.uniqueDeparted ?? 0}
            cut={cleanCut(filters.cut)}
            onCutChange={(cut) => setFilters({ cut })}
            isLoading={!data}
          />
        </div>
      )}

      <div ref={listRef} className="scroll-mt-4">
        {list.isError && !listData ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
            <p>Ro&apos;yxatni yuklab bo&apos;lmadi</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => list.refetch()}>
              Qayta urinish
            </Button>
          </div>
        ) : (
          <DepartedList
            list={listData}
            loading={list.isPending || !listData || lastPage !== null || (list.isPlaceholderData && !listData.data.length)}
            stale={list.isPlaceholderData}
            reasons={data?.reasons}
            filters={filters}
            page={Number(params.page)}
            pageSize={Number(params.pageSize)}
            onFilter={onChange}
            onPage={(page) => setFilters({ page })}
            onPageSize={(pageSize) => setFilters({ pageSize, page: 1 })}
          />
        )}
      </div>

      {!overview.isError && (
        <div aria-busy={stale} className={cn(stale && "opacity-60")}>
          <TeacherChangeRetentionCards
            data={data?.teacherChange}
            isLoading={!data}
            queryParams={{ startDate: base.startDate, endDate: base.endDate, courseId: base.courseId, teacherIds: base.teacherIds }}
            periodLabel={data ? rangeLabel(data.range) : undefined}
          />
        </div>
      )}

      {canManageReasons && <DepartureReasonsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />}
    </div>
  );
}
