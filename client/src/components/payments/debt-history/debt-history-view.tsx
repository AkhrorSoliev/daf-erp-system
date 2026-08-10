"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { DebtCurrentCard } from "./debt-current-card";
import { DebtFlowTable } from "./debt-flow-table";
import { LongestDebtorsTable } from "./longest-debtors-table";
import { MonthCohortDialog } from "./month-cohort-dialog";
import type {
  DebtHistoryResponse,
  DebtMonth,
  DebtStatusFilter,
} from "./types";

/** URL-persisted so a filtered view is shareable and survives a reload. */
const FILTER_SCHEMA = {
  holat: { type: "string" as const, defaultValue: "all" },
};

export function DebtHistoryView() {
  const { filters, setFilter } = useUrlFilters(FILTER_SCHEMA);
  const statusFilter = filters.holat as DebtStatusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ["debt-history", statusFilter],
    queryFn: () =>
      api
        .get<DebtHistoryResponse>("/reports/monthly-debt-recovery/history", {
          params: statusFilter === "all" ? undefined : { status: statusFilter },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const [target, setTarget] = useState<DebtMonth | null>(null);
  const [exporting, setExporting] = useState(false);

  const downloadExcel = async () => {
    setExporting(true);
    try {
      const res = await api.get("/reports/monthly-debt-recovery/excel", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `oylik-qarzdorlik-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Oylik qarzdorlik</h1>
          <p className="text-sm text-muted-foreground">
            Qarz qayerdan paydo bo&apos;lgan, qanchasi to&apos;langan va kimda
            eng uzoq turgan.
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={downloadExcel}
          disabled={exporting || isLoading}
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Excel yuklab olish
        </Button>
      </div>

      <DebtCurrentCard
        data={data}
        isLoading={isLoading}
        statusFilter={statusFilter}
        onStatusFilterChange={(next) => setFilter("holat", next)}
      />

      <DebtFlowTable
        data={data}
        isLoading={isLoading}
        onSelectMonth={setTarget}
      />

      <LongestDebtorsTable
        debtors={data?.longestDebtors}
        isLoading={isLoading}
      />

      {/* The dialog inherits the page's status filter so its list can never
          describe a different population than the row that opened it. */}
      <MonthCohortDialog
        target={target}
        statusFilter={statusFilter}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
