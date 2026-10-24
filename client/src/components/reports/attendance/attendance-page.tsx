"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useT } from "@/i18n/context";
import { downloadAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentDayAsLocalDate } from "@/lib/tashkent-time";
import { cn } from "@/lib/utils";
import { AttendanceCard, AttendanceCardSkeleton } from "./attendance-card";
import { AttendanceCredit } from "./attendance-credit";
import { AttendanceCuts } from "./attendance-cuts";
import { AttendanceMissersDialog, type MisserTarget } from "./attendance-missers-dialog";
import { AttendancePeriodBar } from "./attendance-period-bar";
import { useAttendanceOverview } from "./attendance-queries";
import { AttendanceStreak } from "./attendance-streak";
import { AttendanceTrends } from "./attendance-trends";
import {
  ATTENDANCE_SCHEMA, attendanceRange, cleanCut, excelFileName, overviewParams, type AttendanceFilters,
} from "./attendance-url";

/** «Davomat» (spec B7c §4). Every figure is the server's; the page only arranges and formats. No branch picker: it follows the header. */
export function AttendancePage() {
  const t = useT();
  const { filters: raw, setFilters, resetFilters } = useUrlFilters(ATTENDANCE_SCHEMA);
  const filters = raw as unknown as AttendanceFilters;
  // Read on every render, not memoised: when the Tashkent month rolls over «Bu oy» resolves to new days, so the query key changes.
  const today = tashkentDayAsLocalDate(new Date());
  const range = attendanceRange(filters, today);
  const params = overviewParams(filters, today);
  const cut = cleanCut(filters.cut);
  const { data, isPlaceholderData, isError, refetch } = useAttendanceOverview(params);
  const [exporting, setExporting] = useState(false);
  const [target, setTarget] = useState<MisserTarget | null>(null);

  // The server clamps a page past the end (a shorter list in a new period); the URL follows it.
  const serverPage = data && !isPlaceholderData ? data.cut.page : null;
  useEffect(() => {
    if (serverPage !== null && serverPage !== params.page) setFilters({ page: serverPage });
  }, [serverPage, params.page, setFilters]);

  const isDefault = filters.preset === "current_month" && cut === "group" && params.page === 1 && params.pageSize === 10 && !filters.startDate && !filters.endDate;

  async function exportExcel() {
    setExporting(true);
    try {
      const qs = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate }).toString();
      await downloadAuthedFile(`/reports/attendance-stats/excel?${qs}`, excelFileName(range));
    } catch (e) {
      toast.error(getErrorMessage(e, t("Excel yuklab olishda xatolik")));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">{t("Davomat")}</h2>
        <Button type="button" variant="outline" onClick={exportExcel} disabled={exporting}>
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          {t("Excel")}
        </Button>
      </div>

      <AttendancePeriodBar filters={filters} today={today} onChange={(u) => setFilters({ ...u, page: 1 })} />

      {isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>{t("Ma'lumotni yuklab bo'lmadi")}</p>
          {/* A stale link can keep failing; retrying with it would repeat the error, so a non-default URL goes back to the defaults, stale `att_*` keys included (the plain path). */}
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => (isDefault ? refetch() : resetFilters())}>
            {t("Qayta urinish")}
          </Button>
        </div>
      ) : !data ? (
        <AttendanceCardSkeleton />
      ) : (
        // The previous answer stays dimmed and inert until the next one lands.
        <div aria-busy={isPlaceholderData} className={cn("flex flex-col gap-4", isPlaceholderData && "pointer-events-none opacity-60")}>
          <AttendanceCard data={data} preset={filters.preset} />
          <AttendanceTrends months={data.months} weekdays={data.weekdays} />
          <AttendanceCredit credit={data.credit} cancelled={data.card.counts.cancelled} />
          <AttendanceCuts
            selected={cut}
            data={data.cut}
            onCut={(c) => setFilters({ cut: c, page: 1 })}
            onPage={(page) => setFilters({ page })}
            onPageSize={(pageSize) => setFilters({ pageSize, page: 1 })}
            onMissers={(row) => setTarget({ key: row.key, name: row.name, cut: data.cut.key })}
          />
          <AttendanceStreak count={data.streak} />
        </div>
      )}

      <AttendanceMissersDialog key={target ? `${target.cut}:${target.key}` : "none"} target={target} range={range} onClose={() => setTarget(null)} />
    </div>
  );
}
