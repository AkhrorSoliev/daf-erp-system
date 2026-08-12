"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { DebtFlowTable } from "../debt-history/debt-flow-table";
import { MonthCohortDialog } from "../debt-history/month-cohort-dialog";
import { DebtStatusFilterBar } from "./debt-status-filter-bar";
import type {
  DebtHistoryResponse,
  DebtMonth,
  DebtStatusFilter,
} from "../debt-history/types";
import { useDebtFilters } from "./debt-filters-provider";

/**
 * "Dinamika": how the debt moved month by month.
 *
 * This is the shortened form of `/payments/debt-history`. Two of that page's
 * four blocks are not carried over, because on this page they would be saying
 * something the reader can already see:
 *
 *  - the big "Hozirgi qarz" figure is the "Jami qarz" card one tab to the left,
 *    down to the so'm;
 *  - "Eng uzoq qarzdorlar" is the debtor list sorted by age — it even linked
 *    here. It comes back as a SORT on that list once the debt-age data lands,
 *    and until then the old page still has it.
 *
 * What is genuinely only here is the roll-forward itself: opening balance,
 * what was added, paid, forgiven, closing balance, and the recovery rate. The
 * status tiles survive as a filter bar because they scope that table.
 */
export function DynamicsView() {
  const { filters, setFilters } = useDebtFilters();
  const statusFilter = (filters.holat || "all") as DebtStatusFilter;
  const [target, setTarget] = useState<DebtMonth | null>(null);
  const [exporting, setExporting] = useState(false);

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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Qarz oyma-oy qanday o&apos;zgargan: qancha qo&apos;shilgan, qanchasi
          to&apos;langan va oy oxirida qancha qolgan.{" "}
          <span className="whitespace-nowrap">Butun kompaniya bo&apos;yicha</span>{" "}
          — bu jadval filialga bo&apos;linmaydi.
        </p>
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

      <DebtStatusFilterBar
        data={data}
        isLoading={isLoading}
        value={statusFilter}
        onChange={(next) => setFilters({ holat: next })}
      />

      <DebtFlowTable data={data} isLoading={isLoading} onSelectMonth={setTarget} />

      {/* The dialog inherits the filter so its list can never describe a
          different population than the row that opened it. */}
      <MonthCohortDialog
        target={target}
        statusFilter={statusFilter}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
