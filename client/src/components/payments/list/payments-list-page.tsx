"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { useCan } from "@/hooks/use-permissions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { downloadAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentNow } from "@/lib/tashkent-time";
import { PaymentsFilterBar } from "./payments-filter-bar";
import { PaymentsPeriodBar } from "./payments-period-bar";
import { invalidatePaymentsList, usePaymentsFilterOptions, usePaymentsSummary } from "./payments-queries";
import { PaymentsSummaryCard, PaymentsSummaryCardSkeleton } from "./payments-summary-card";
import { cleanPeriodId, listParams, PAYMENTS_LIST_SCHEMA, periodParams, type PaymentFilters } from "./payments-url";

const CLEARED: Partial<PaymentFilters> = {
  q: "", usul: "", nimaga: "", guruh: "", ustoz: "", kurs: "", qabul: "", manba: "", holat: "otgan", sahifa: 1,
};

/**
 * «To'lovlar» (spec B4 §3): header, period, filters and — for `reports.finance`
 * holders only — the summary card. The totals line, table and pager are Task 11's.
 */
export function PaymentsListPage() {
  const { filters: raw, setFilters } = useUrlFilters(PAYMENTS_LIST_SCHEMA);
  const filters = raw as PaymentFilters;
  const qc = useQueryClient();
  const canRecord = useCan("payments.create");
  const canSeeMoney = useCan("reports.finance");
  const [recording, setRecording] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Tashkent days, never the browser's.
  const todayStr = tashkentNow().dateStr;
  const davr = cleanPeriodId(filters.davr);
  const period = periodParams(filters, todayStr);
  // `null` = an unusable «Oraliq»: nothing is asked and nothing old is shown.
  const params = listParams(filters, todayStr);

  const options = usePaymentsFilterOptions();
  const summary = usePaymentsSummary(period, canSeeMoney);

  // Any filter or period change puts the list back on page 1; the period keeps the filters.
  const onChange = useCallback((u: Partial<PaymentFilters>) => setFilters({ sahifa: 1, ...u }), [setFilters]);

  async function exportExcel() {
    if (!params) return;
    const rest = { ...params };
    delete rest.page;
    delete rest.pageSize;
    const qs = new URLSearchParams(Object.entries(rest).map(([k, v]) => [k, String(v)])).toString();
    setExporting(true);
    try {
      await downloadAuthedFile(`/payments/list/excel?${qs}`, `tolovlar-${params.startDate}-${params.endDate}.xlsx`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link href="/payments/overview" className="text-sm text-muted-foreground hover:text-foreground">
          ← Umumiy ma&apos;lumotlar
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-heading text-lg font-semibold tracking-tight">To&apos;lovlar</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportExcel} disabled={!params || exporting}>
              {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
              Excel
            </Button>
            {canRecord && (
              <Button onClick={() => setRecording(true)}>
                <Plus className="mr-2 size-4" />
                To&apos;lov qayd qilish
              </Button>
            )}
          </div>
        </div>
      </div>

      {canSeeMoney && period && !summary.isError && (
        summary.data ? (
          <PaymentsSummaryCard
            davr={davr}
            period={summary.data.period}
            summary={summary.data}
            activePart={filters.nimaga}
            onPart={(nimaga) => onChange({ nimaga })}
          />
        ) : (
          <PaymentsSummaryCardSkeleton />
        )
      )}

      <PaymentsPeriodBar filters={filters} onChange={onChange} />
      <PaymentsFilterBar filters={filters} options={options.data} onChange={onChange} onClear={() => setFilters(CLEARED)} />

      {params === null ? (
        <p className="text-sm text-muted-foreground">Oraliqning boshi va oxirini tanlang</p>
      ) : null /* Task 11: the totals line, the table and the pager go here. */}

      <RecordPaymentDialog open={recording} onOpenChange={setRecording} onSuccess={() => invalidatePaymentsList(qc)} />
    </div>
  );
}
