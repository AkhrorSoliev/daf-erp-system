"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Clock, Download, MousePointerClick } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePagination } from "@/components/outreach/table-pagination";
import { ChangeStatusDialog } from "@/components/shared/change-status-dialog";
import { EnrollToGroupDialog } from "@/components/students/enroll-to-group-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { downloadAuthedFile } from "@/lib/download-file";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { hasAnyRole, REFUND_CANCEL_ROLES, REFUND_HAND_OVER_ROLES, REFUND_REQUEST_ROLES } from "@/lib/role-access";
import { tashkentNow } from "@/lib/tashkent-time";
import { cn } from "@/lib/utils";
import { RefundDialog } from "../refund-dialog";
import { WithdrawalDialog } from "../withdrawal-dialog";
import { dayMonth } from "../debt/debt-format";
import { UrlSearchBox } from "../debt/debt-filter-bar";
import { lastPageIfPast } from "../debt/debt-url";
import { CancelRefundDialog, HandOverDialog } from "./pending-dialogs";
import { RefundableDrawer, type DrawerAction } from "./refundable-drawer";
import { AGE_LABEL, PENDING_RULE, pendingEmptyText, pendingSumLine, summaryLine, TAB_LABEL, TAB_RULE, tabSubline } from "./refunds-format";
import { invalidateRefunds, useRefundableList } from "./refunds-queries";
import { PendingTable, RefundableTable } from "./refunds-tables";
import { cleanRefundsFilters, REFUNDS_SCHEMA, refundsTab, type RefundsFilters } from "./refunds-url";
import { AGE_BUCKETS, REFUNDABLE_TABS, type AgeBucket, type DrawerStudent, type PendingRefundRow, type RefundableListResponse, type RefundableTab } from "./refunds-types";

const TAB_DOT: Record<RefundableTab, string> = { muzlatilgan: "bg-amber-500", guruhsiz: "bg-muted-foreground", ketgan: "bg-red-500" };
const AGE_CHIPS: ("" | AgeBucket)[] = ["", ...AGE_BUCKETS];

/**
 * «Qaytariladigan pul» (spec B2b §3, ADR-0076): the money of students who are not
 * studying, in three tabs, and the open refund requests. Every figure is the
 * server's; the summary is the one place the three tabs are added (money held).
 */
export function RefundsPage() {
  const qc = useQueryClient();
  const { filters: raw, setFilters } = useUrlFilters(REFUNDS_SCHEMA);
  // A value the server would refuse (an old bookmark) is read as its default.
  const filters = cleanRefundsFilters(raw as RefundsFilters);
  const tab = refundsTab(filters);
  const { data, isPending, isPlaceholderData, isError, refetch } = useRefundableList(filters);
  const roles = useAuth((s) => s.user?.roles);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [action, setAction] = useState<{ kind: DrawerAction; student: DrawerStudent } | null>(null);
  const [handOver, setHandOver] = useState<PendingRefundRow | null>(null);
  const [cancel, setCancel] = useState<PendingRefundRow | null>(null);
  const today = tashkentNow().dateStr;

  // A page past the last one (its last request was just handed over) goes to the last page that has rows.
  const fresh = data && !isPlaceholderData ? data : null;
  const lastRows = fresh ? lastPageIfPast(filters.page, filters.pageSize, fresh.rows.total, fresh.rows.data.length) : null;
  const lastPending = fresh ? lastPageIfPast(filters.pendingPage, filters.pendingPageSize, fresh.pending.total, fresh.pending.data.length) : null;
  useEffect(() => {
    if (lastRows !== null || lastPending !== null) setFilters({ page: lastRows ?? filters.page, pendingPage: lastPending ?? filters.pendingPage });
  }, [lastRows, lastPending, filters.page, filters.pendingPage, setFilters]);
  // A kept empty answer is not the new one: skeleton, not «yo'q», until it lands.
  const rowsLoading = isPending || lastRows !== null || (isPlaceholderData && !data?.rows.data.length);
  const onSearch = useCallback((search: string) => setFilters({ search, page: 1 }), [setFilters]);
  // A request another desk closed meanwhile is gone from the fresh list: its dialog goes with it.
  const stillPending = (row: PendingRefundRow) => !fresh || fresh.pending.data.some((r) => r.id === row.id);

  const exportExcel = async () => {
    // The server applies only the search to the Excel (every tab, every page).
    const qs = filters.search ? `?${new URLSearchParams({ search: filters.search })}` : "";
    try {
      await downloadAuthedFile(`/refundable/excel${qs}`, `qaytariladigan-pul-${today}.xlsx`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-heading text-lg font-semibold tracking-tight">Qaytariladigan pul</h1>
        <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm text-muted-foreground">
          <Clock className="size-3.5" />Bugungi holat · {dayMonth(today)}
        </span>
        <Button variant="outline" onClick={exportExcel}><Download className="mr-2 size-4" />Excel</Button>
      </div>

      <div className="rounded-xl border p-4">
        <p className="text-sm text-muted-foreground">O'qimayotganlarning markazda turgan puli</p>
        <p className="text-2xl font-bold tabular-nums">{data ? formatBalance(data.summary.total) : "—"}</p>
        {data && <p className="text-sm text-muted-foreground">{summaryLine(data.summary.count)}</p>}
        <p className="mt-1.5 text-xs text-muted-foreground">O'qiyotganlarning oldindan to'lagani bu yerga kirmaydi — u keyingi oy hisobiga o'tadi.</p>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">Kutilayotgan qaytarishlar</p>
          {data && (
            <Link href="/payments/refunds/history" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Tarix · {formatNumber(data.pending.historyCount)} ta<ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
        {data && data.pending.total > 0 && <p className="text-lg font-bold tabular-nums">{pendingSumLine(data.pending.sum, data.pending.total)}</p>}
        <p className="text-sm text-muted-foreground">{PENDING_RULE}</p>
        {!data ? (
          <Skeleton className="h-24 rounded" />
        ) : data.pending.total === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{pendingEmptyText(data.pending.lastHandedOverAt)}</p>
        ) : (
          <div aria-busy={isPlaceholderData} className={cn("space-y-3", isPlaceholderData && "pointer-events-none opacity-60")}>
            <PendingTable rows={data.pending.data} offset={(filters.pendingPage - 1) * filters.pendingPageSize}
              canHandOver={hasAnyRole(roles, REFUND_HAND_OVER_ROLES)} canCancel={hasAnyRole(roles, REFUND_CANCEL_ROLES)}
              onHandOver={setHandOver} onCancel={setCancel} />
            <TablePagination total={data.pending.total} page={filters.pendingPage} pageSize={filters.pendingPageSize}
              onPageChange={(p) => setFilters({ pendingPage: p })} onPageSizeChange={(s) => setFilters({ pendingPageSize: s, pendingPage: 1 })} />
          </div>
        )}
      </div>

      <TabButtons data={data} active={tab} onSelect={(t) => setFilters({ tab: t, age: "", page: 1 })} />
      <p className="text-sm text-muted-foreground">{TAB_RULE[tab]}</p>

      {tab === "muzlatilgan" && (
        <div role="group" aria-label="Muzlatilganiga necha kun bo'lgan" className="flex w-max max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
          {AGE_CHIPS.map((a) => {
            const count = data?.chips[a || "all"];
            return (
              <button key={a || "all"} type="button" aria-pressed={filters.age === a} onClick={() => setFilters({ age: a, page: 1 })}
                className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground", filters.age === a && "bg-background text-foreground shadow-sm")}>
                {a ? AGE_LABEL[a] : "Hammasi"} · {count === undefined ? "—" : formatNumber(count)}
              </button>
            );
          })}
        </div>
      )}

      <UrlSearchBox value={filters.search} onSearch={onSearch} label="O'quvchini qidirish" />
      {/* Nothing else on the row says it opens (the debt page's lesson). */}
      {data && data.rows.total > 0 && (
        <p className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm text-primary">
          <MousePointerClick className="size-4 shrink-0" />
          O'quvchi ustiga bosing — tafsilot va amallar o'ng tomonda ochiladi
        </p>
      )}

      {isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Ro'yxatni yuklab bo'lmadi.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Qayta urinish</Button>
        </div>
      ) : (
        <div aria-busy={isPlaceholderData} className={cn(isPlaceholderData && "pointer-events-none opacity-60")}>
          <RefundableTable tab={tab} rows={data?.rows.data} loading={rowsLoading} searched={!!filters.search}
            offset={(filters.page - 1) * filters.pageSize} onOpen={setDrawerId} />
        </div>
      )}
      {data && data.rows.total > 0 && (
        <TablePagination total={data.rows.total} page={filters.page} pageSize={filters.pageSize}
          onPageChange={(p) => setFilters({ page: p })} onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })} />
      )}

      <RefundableDrawer studentId={drawerId} canAct={hasAnyRole(roles, REFUND_REQUEST_ROLES)} onClose={() => setDrawerId(null)}
        onAction={(kind, student) => { setDrawerId(null); setAction({ kind, student }); }} />
      {action && <ActionDialog key={`${action.kind}-${action.student.id}`} action={action} onClose={() => setAction(null)} onDone={() => invalidateRefunds(qc)} />}
      {handOver && stillPending(handOver) && <HandOverDialog target={handOver} accounts={data?.cashAccounts ?? []} onClose={() => setHandOver(null)} />}
      {cancel && stillPending(cancel) && <CancelRefundDialog target={cancel} onClose={() => setCancel(null)} />}
    </div>
  );
}

function TabButtons({ data, active, onSelect }: {
  data: RefundableListResponse | undefined; active: RefundableTab; onSelect: (t: RefundableTab) => void;
}) {
  const overThirty = data ? data.chips.d31to60 + data.chips.over60 : 0;
  return (
    <div role="tablist" aria-label="Kimlarning puli" className="grid gap-3 md:grid-cols-3">
      {REFUNDABLE_TABS.map((t) => {
        const total = data?.tabs[t];
        return (
          <button key={t} type="button" role="tab" aria-selected={t === active} onClick={() => onSelect(t)}
            className={cn("flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left", t === active && "border-primary ring-1 ring-primary")}>
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className={cn("size-2 rounded-full", TAB_DOT[t])} />{TAB_LABEL[t]}
            </span>
            <span className="text-xl font-bold tabular-nums">{total ? formatBalance(total.total) : "—"}</span>
            {total && <span className="text-xs text-muted-foreground">{tabSubline(t, total.count, overThirty)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The existing dialog a drawer option opens (spec §3.5). The page keys it by the
 * option and the student, so each use mounts fresh: `ChangeStatusDialog` reads
 * `initialStatus` on mount only. The refund and withdrawal dialogs refresh the
 * page's keys themselves.
 */
function ActionDialog({ action: { kind, student }, onClose, onDone }: {
  action: { kind: DrawerAction; student: DrawerStudent }; onClose: () => void; onDone: () => void;
}) {
  const name = `${student.firstName} ${student.lastName}`;
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  if (kind === "refund") return <RefundDialog open onOpenChange={onOpenChange} studentId={student.id} studentName={name} />;
  if (kind === "transfer") return <WithdrawalDialog open onOpenChange={onOpenChange} studentId={student.id} studentName={name} />;
  if (kind === "return") {
    return (
      <ChangeStatusDialog open onOpenChange={onOpenChange} entityType="students" entityId={student.id} entityName={name}
        currentStatus={student.status} initialStatus="ACTIVE" onStatusChanged={onDone} />
    );
  }
  return (
    <EnrollToGroupDialog open onOpenChange={onOpenChange} studentId={student.id} studentName={name}
      enrolledGroupIds={[]} studentBranchId={student.branchId} onEnrolled={onDone} />
  );
}
