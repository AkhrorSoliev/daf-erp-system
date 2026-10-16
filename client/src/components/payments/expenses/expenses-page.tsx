"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useCan } from "@/hooks/use-permissions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { lastPageIfPast } from "@/components/payments/debt/debt-url";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { ExpenseFormDialog } from "./expense-form-dialog";
import { ExpensesFilterBar } from "./expenses-filter-bar";
import { presetFor, toggleTurkum } from "./expenses-format";
import { ExpensesHeader } from "./expenses-header";
import { ExpensesMissingCard } from "./expenses-missing-card";
import { ExpensesMonthCard, ExpensesMonthCardSkeleton } from "./expenses-month-card";
import { invalidateExpenses, useExpensesList, useExpensesMonthSummary } from "./expenses-queries";
import { ExpensesTable } from "./expenses-table";
import type { ExpensePreset, ExpenseRow } from "./expenses-types";
import {
  EXPENSES_CLEARED, EXPENSES_PAGE_SIZES, EXPENSES_SCHEMA, hasExpenseFilter, listParams, pageMonth, pdfFileName, pdfParams, summaryParams,
  type ExpensesFilters,
} from "./expenses-url";

type FormState = { expense: ExpenseRow | null; preset: ExpensePreset | null } | null;

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
      <p>Ma&apos;lumotni yuklab bo&apos;lmadi</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Qayta urinish</Button>
    </div>
  );
}

/** «Xarajatlar» (spec B6 §3). Every figure is the server's; the page only formats. */
export function ExpensesPage() {
  const { filters: raw, setFilters } = useUrlFilters(EXPENSES_SCHEMA);
  const filters = raw as ExpensesFilters;
  const qc = useQueryClient();
  const canManage = useCan("expenses.manage");
  // Wait for the branch to hydrate: the first request must carry the header's branch.
  const { selectedBranch, loaded } = useBranchSwitcher();
  const branchId = selectedBranch?.id;
  const current = currentMonthKey();
  const month = pageMonth(filters.oy, current);
  const summary = useExpensesMonthSummary(summaryParams(filters, current, branchId), loaded);
  const params = listParams(filters, current, branchId);
  const list = useExpensesList(params, loaded);
  const [form, setForm] = useState<FormState>(null);
  const [historyFor, setHistoryFor] = useState<ExpenseRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const data = list.data;
  // A page past the last one (a filter narrowed the list, an old link) goes to the last page that has rows.
  const lastPage = data && !list.isPlaceholderData ? lastPageIfPast(Number(params.page), Number(params.pageSize), data.total, data.data.length) : null;
  useEffect(() => {
    if (lastPage !== null) setFilters({ sahifa: lastPage });
  }, [lastPage, setFilters]);
  // An unanswered or kept-and-empty answer is a skeleton, never «xarajat yo'q».
  const tableLoading = !data || lastPage !== null || (list.isPlaceholderData && data.data.length === 0);

  // Any filter change puts the table back on page 1.
  const onChange = useCallback((u: Partial<ExpensesFilters>) => setFilters({ sahifa: 1, ...u }), [setFilters]);
  const refresh = () => invalidateExpenses(qc);

  async function exportPdf() {
    setExporting(true);
    try {
      const qs = new URLSearchParams(Object.entries(pdfParams(filters, current, branchId)).map(([k, v]) => [k, String(v)])).toString();
      await downloadAuthedFile(`/expenses/pdf?${qs}`, pdfFileName(month));
    } catch (e) {
      toast.error(getErrorMessage(e, "PDF yuklab olishda xatolik"));
    } finally {
      setExporting(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/expenses/${confirmDelete.id}`);
      toast.success("Xarajat o'chirildi");
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "O'chirishda xatolik"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <ExpensesHeader month={month} current={current} canManage={canManage} exporting={exporting} pdfDisabled={!data || list.isPlaceholderData || !data.total}
        onMonth={(m) => onChange({ oy: m === current ? "" : m })} onPdf={exportPdf} onAdd={() => setForm({ expense: null, preset: null })} />

      {/* One request feeds the warning and the card (spec §5.2): a failed request draws no warning, and the card shows the error. */}
      {summary.data && !summary.isError && (
        <ExpensesMissingCard summary={summary.data} canManage={canManage}
          onWrite={(row) => setForm({ expense: null, preset: presetFor(row, month) })} />
      )}
      {summary.isError ? (
        <LoadError onRetry={() => summary.refetch()} />
      ) : summary.data ? (
        <ExpensesMonthCard summary={summary.data} selected={filters.turkum} onToggle={(c) => onChange({ turkum: toggleTurkum(filters.turkum, c) })} />
      ) : (
        <ExpensesMonthCardSkeleton />
      )}

      <ExpensesFilterBar filters={filters} creators={summary.data?.creators ?? []}
        selection={data && !list.isPlaceholderData ? { count: data.total, amount: data.summary.totalAmount } : null} onChange={onChange} />

      {list.isError ? (
        <LoadError onRetry={() => list.refetch()} />
      ) : (
        <div className="space-y-3">
          {/* While the next answer loads, the previous one stays dimmed and inert (`stale`). */}
          <ExpensesTable rows={data?.data} loading={tableLoading} stale={list.isPlaceholderData} offset={(Number(params.page) - 1) * Number(params.pageSize)}
            emptyMonth={!hasExpenseFilter(filters)} canManage={canManage}
            onEdit={(e) => setForm({ expense: e, preset: null })} onHistory={setHistoryFor} onDelete={setConfirmDelete}
            onClear={hasExpenseFilter(filters) ? () => onChange(EXPENSES_CLEARED) : undefined} />
          {data && data.total > 0 && !tableLoading && (
            <PaymentsPager page={Number(params.page)} pageSize={Number(params.pageSize)} total={data.total} sizes={EXPENSES_PAGE_SIZES}
              sizeLabel="Sahifadagi qatorlar soni" onPage={(sahifa) => setFilters({ sahifa })} onPageSize={(soni) => setFilters({ soni, sahifa: 1 })} />
          )}
        </div>
      )}

      <ExpenseFormDialog open={form !== null} onOpenChange={(v) => { if (!v) setForm(null); }}
        expense={form?.expense} preset={form?.preset} branchId={branchId} onSaved={refresh} />

      <Dialog open={!!historyFor} onOpenChange={(v) => { if (!v) setHistoryFor(null); }}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Xarajat tarixi</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {historyFor && <EntityHistoryTable entityType="Expense" entityId={historyFor.id} />}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v && !deleting) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xarajatni o&apos;chirasizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu xarajat o&apos;chiriladi va unga bog&apos;liq moliyaviy yozuv teskari yoziladi. Bu amalni qaytarib bo&apos;lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={(ev) => { ev.preventDefault(); void remove(); }}>
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              O&apos;chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
