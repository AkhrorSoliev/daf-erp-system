"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { MonthStepper } from "@/components/shared/month-stepper";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { downloadAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { CenterActivityCards, CenterActivityCardsSkeleton } from "./center-activity-cards";
import { CenterActivityGroups } from "./center-activity-groups";
import { CenterActivityHeat } from "./center-activity-heat";
import { CenterActivityMonths } from "./center-activity-months";
import { useCenterOverview } from "./center-activity-queries";
import { CenterActivityRooms } from "./center-activity-rooms";
import {
  CA_FIRST_MONTH, CENTER_ACTIVITY_SCHEMA, excelFileName, excelParams, overviewParams, pageMonth,
  type CenterActivityFilters,
} from "./center-activity-url";

/** «Markaz faoliyati» (spec B7b §4). Every figure is the server's; the page only formats. */
export function CenterActivityPage() {
  const { filters: raw, setFilters } = useUrlFilters(CENTER_ACTIVITY_SCHEMA);
  const filters = raw as CenterActivityFilters;
  const [exporting, setExporting] = useState(false);
  const current = currentMonthKey();
  const month = pageMonth(filters.oy, current);
  const params = overviewParams(filters, current);
  const { data, isPlaceholderData, isError, refetch } = useCenterOverview(params);
  // An answer kept from another month is never drawn as this month's; one kept from another branch stays (dimmed) until the new heat lands.
  const fresh = data?.month === month ? data : undefined;
  const onlyBranch = fresh?.branches.length === 1 ? fresh.branches[0] : undefined;

  async function exportExcel() {
    setExporting(true);
    try {
      const qs = new URLSearchParams(
        Object.entries(excelParams(filters, current)).map(([k, v]) => [k, String(v)]),
      ).toString();
      await downloadAuthedFile(`/reports/center-activity/excel?${qs}`, excelFileName(month));
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-heading text-lg font-semibold tracking-tight">Markaz faoliyati</h2>
          {onlyBranch && (
            <p className="text-sm text-muted-foreground">
              {onlyBranch.name} filiali · {onlyBranch.rooms} xona
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthStepper
            value={month}
            min={CA_FIRST_MONTH}
            max={current}
            onChange={(m) => setFilters({ oy: m === current ? "" : m, filial: 0 })}
          />
          <Button variant="outline" onClick={exportExcel} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            Excel
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Ma&apos;lumotni yuklab bo&apos;lmadi</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : fresh && fresh.rooms.length === 0 ? (
        <>
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
            Bu oyda xonasi bor ochiq guruh yo&apos;q — oyni o&apos;zgartirib ko&apos;ring
          </div>
          <CenterActivityMonths months={fresh.months} selected={month} />
        </>
      ) : (
        // The previous answer stays dimmed and inert until the next one lands.
        <div aria-busy={isPlaceholderData} className={cn("flex flex-col gap-4", isPlaceholderData && "pointer-events-none opacity-60")}>
          {fresh ? <CenterActivityCards cards={fresh.cards} /> : <CenterActivityCardsSkeleton />}
          {fresh?.heat && (
            <CenterActivityHeat data={fresh.heat} branches={fresh.branches} onBranch={(id) => setFilters({ filial: id })} />
          )}
          {fresh && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <CenterActivityRooms rooms={fresh.rooms} showBranch={fresh.branches.length > 1} />
                <CenterActivityGroups groups={fresh.groups} />
              </div>
              <CenterActivityMonths months={fresh.months} selected={month} />
              {(fresh.notes.deletedLater > 0 || fresh.notes.unplaced > 0) && (
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {fresh.notes.deletedLater > 0 && <p>shundan {fresh.notes.deletedLater} ta guruh keyin o&apos;chirilgan</p>}
                  {fresh.notes.unplaced > 0 && <p>{fresh.notes.unplaced} ta guruhga xona yoki o&apos;rin soni belgilanmagan</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
