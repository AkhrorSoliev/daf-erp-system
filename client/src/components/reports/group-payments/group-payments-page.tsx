"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { MonthStepper } from "@/components/shared/month-stepper";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { downloadAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { lastPageIfPast } from "@/components/payments/debt/debt-url";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { GroupDrawer } from "./group-drawer";
import { GroupPaymentsFilterBar } from "./group-payments-filter-bar";
import { MULTI_TEACHER_NOTE, QOLDI_NOTE } from "./group-payments-format";
import { useGroupPaymentsRows } from "./group-payments-queries";
import { GroupPaymentsSummary, GroupPaymentsSummarySkeleton } from "./group-payments-summary";
import { GroupPaymentsTable } from "./group-payments-table";
import {
  cleanKesim, excelFileName, excelParams, GP_CLEARED, GP_FIRST_MONTH, GP_PAGE_SIZES, GROUP_PAYMENTS_SCHEMA, hasGpFilter, isFreshAnswer, pageMonth, rowsParams,
  type GroupPaymentsFilters,
} from "./group-payments-url";

/** «Guruhlar bo'yicha to'lov» (spec B5 §3). Every figure is the server's; the page only formats. */
export function GroupPaymentsPage() {
  const t = useT();
  const { filters: raw, setFilters } = useUrlFilters(GROUP_PAYMENTS_SCHEMA);
  const filters = raw as GroupPaymentsFilters;
  const [exporting, setExporting] = useState(false);
  const current = currentMonthKey();
  const month = pageMonth(filters.oy, current);
  const kesim = cleanKesim(filters.kesim);
  const params = rowsParams(filters, current);
  const { data, isPending, isPlaceholderData, isError, refetch } = useGroupPaymentsRows(params);
  // An answer kept from another month is never drawn as this month's (no `oy` sent: the server's own month answers).
  const fresh = data && isFreshAnswer(data.month, month, Boolean(params.oy), isPlaceholderData) ? data : undefined;

  // A page past the last one (a filter narrowed the list, an old link) goes to the last page that has rows.
  const lastPage = fresh && !isPlaceholderData ? lastPageIfPast(Number(params.sahifa), Number(params.soni), fresh.total, fresh.rows.length) : null;
  useEffect(() => {
    if (lastPage !== null) setFilters({ sahifa: lastPage });
  }, [lastPage, setFilters]);
  // A kept answer is not the new one: skeleton, not «Hech narsa topilmadi», until it lands.
  const tableLoading = isPending || !fresh || lastPage !== null || (isPlaceholderData && !fresh.rows.length);

  // Any filter change puts the table back on page 1.
  const onChange = useCallback((u: Partial<GroupPaymentsFilters>) => setFilters({ sahifa: 1, ...u }), [setFilters]);

  async function exportExcel() {
    setExporting(true);
    try {
      const qs = new URLSearchParams(excelParams(filters, current)).toString();
      await downloadAuthedFile(`/reports/group-payments/excel?${qs}`, excelFileName(month));
    } catch (e) {
      toast.error(getErrorMessage(e, t("Excel yuklab olishda xatolik")));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">{t("Guruhlar bo'yicha to'lov")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <MonthStepper value={month} min={GP_FIRST_MONTH} max={current} onChange={(m) => onChange({ oy: m === current ? "" : m, guruh: "" })} />
          <Button variant="outline" onClick={exportExcel} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            {t("Excel")}
          </Button>
        </div>
      </div>

      {!isError && (fresh ? <GroupPaymentsSummary month={fresh.month} summary={fresh.summary} /> : <GroupPaymentsSummarySkeleton />)}

      <GroupPaymentsFilterBar filters={filters} onChange={onChange} />

      {isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>{t("Ma'lumotni yuklab bo'lmadi")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            {t("Qayta urinish")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* The previous answer stays dimmed and inert until the next one lands. */}
          <div aria-busy={isPlaceholderData} className={cn(isPlaceholderData && "pointer-events-none opacity-60")}>
            <GroupPaymentsTable
              kesim={kesim}
              rows={fresh?.rows}
              loading={tableLoading}
              offset={(Number(params.sahifa) - 1) * Number(params.soni)}
              emptyMonth={fresh?.summary.groups === 0}
              onOpen={(guruh) => setFilters({ guruh })}
              onClear={hasGpFilter(filters) ? () => setFilters(GP_CLEARED) : undefined}
            />
          </div>
          {fresh && fresh.total > 0 && !tableLoading && (
            <PaymentsPager
              page={Number(params.sahifa)}
              pageSize={Number(params.soni)}
              total={fresh.total}
              sizes={GP_PAGE_SIZES}
              sizeLabel={t("Sahifadagi qatorlar soni")}
              onPage={(sahifa) => setFilters({ sahifa })}
              onPageSize={(soni) => setFilters({ soni, sahifa: 1 })}
            />
          )}
          {fresh && fresh.rows.length > 0 && !tableLoading && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {fresh.multiTeacherNote && <p>{t(MULTI_TEACHER_NOTE)}</p>}
              <p>{t(QOLDI_NOTE)}</p>
            </div>
          )}
        </div>
      )}

      <GroupDrawer groupId={filters.guruh || null} oy={month === current ? undefined : month} onClose={() => setFilters({ guruh: "" })} />
    </div>
  );
}
