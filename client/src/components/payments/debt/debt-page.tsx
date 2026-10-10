"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Download, MousePointerClick } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { LogCallDialog, type LogCallPrefill } from "@/components/outreach/log-call-dialog";
import { TablePagination } from "@/components/outreach/table-pagination";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { downloadAuthedFile } from "@/lib/download-file";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentNow } from "@/lib/tashkent-time";
import { cn } from "@/lib/utils";
import { RecordPaymentDialog } from "../record-payment-dialog";
import { DebtDrawer } from "./debt-drawer";
import { DebtFilterBar } from "./debt-filter-bar";
import { dayMonth, KIND_LABEL, sumLine, TAB_LABEL, tabRule, tabSubline } from "./debt-format";
import { useDebtList } from "./debt-queries";
import { DebtTable } from "./debt-table";
import { activeTab, cleanDebtFilters, DEBT_LIST_SCHEMA, debtListParams, hasDebtFilter, lastPageIfPast, type DebtFilters } from "./debt-url";
import { DEBT_TABS, type DebtKind, type DebtListResponse, type DebtTab, type PayTarget } from "./debt-types";

const TAB_DOT: Record<DebtTab, string> = { "shu-oy": "bg-amber-500", eski: "bg-red-500", chiqqan: "bg-muted-foreground" };
const KINDS: ("" | DebtKind)[] = ["", "ungrouped", "frozen", "left"];

/**
 * «Qarzdorlik» (spec B2a, ADR-0072): today's debt in three tabs, never added.
 * Every figure is the server's — the tab totals are the debt split's, the rows
 * are the same split's rows.
 */
export function DebtPage() {
  const { filters: raw, setFilters } = useUrlFilters(DEBT_LIST_SCHEMA);
  // A value the server would refuse (an old bookmark) is read as its default.
  const filters = cleanDebtFilters(raw as DebtFilters);
  const tab = activeTab(filters);
  const { data, isPending, isPlaceholderData, isError, refetch } = useDebtList(filters);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [callTarget, setCallTarget] = useState<LogCallPrefill | null>(null);
  const today = tashkentNow().dateStr;
  const monthKey = today.slice(0, 7);
  // A page past the last one goes to the last page that has rows (never a false «qarzdor yo'q»).
  const lastPage = data && !isPlaceholderData ? lastPageIfPast(filters.page, filters.pageSize, data.total, data.data.length) : null;
  useEffect(() => {
    if (lastPage !== null) setFilters({ page: lastPage });
  }, [lastPage, setFilters]);
  // A kept empty answer is not the new one: skeleton, not «qarzdor yo'q», until it lands.
  const tableLoading = isPending || lastPage !== null || (isPlaceholderData && !data?.data.length);

  const exportExcel = async () => {
    // The list's own query; the server ignores page and pageSize for the Excel.
    const qs = new URLSearchParams(
      Object.entries(debtListParams(filters)).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
    ).toString();
    try {
      await downloadAuthedFile(`/payments/debt/excel?${qs}`, `qarzdorlik-${tab}-${today}.xlsx`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-heading text-lg font-semibold tracking-tight">Qarzdorlik</h1>
        <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm text-muted-foreground">
          <Clock className="size-3.5" />Bugungi holat · {dayMonth(today)}
        </span>
        <Button variant="outline" onClick={exportExcel}><Download className="mr-2 size-4" />Excel</Button>
      </div>

      <TabButtons tabs={data?.tabs} active={tab} monthKey={monthKey}
        onSelect={(t) => setFilters({ tab: t, page: 1, kind: "", groupIds: [], teacherIds: [] })} />

      {tab === "shu-oy" && data && data.leftThisMonth > 0 && (
        <p className="text-sm text-muted-foreground">
          Shu oy guruhdan chiqqanlarning shu oy qarzi — {formatBalance(data.leftThisMonth)} — «O&apos;qimayotganlar» bo&apos;limida.
        </p>
      )}
      <p className="text-sm text-muted-foreground">{tabRule(tab, monthKey)}</p>

      {tab === "chiqqan" && (
        <div role="group" aria-label="Holat" className="flex w-max max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
          {KINDS.map((k) => {
            const count = k ? data?.tabs.chiqqan.byKind[k].count : data?.tabs.chiqqan.count;
            return (
              <button key={k || "all"} type="button" aria-pressed={filters.kind === k} onClick={() => setFilters({ kind: k, page: 1 })}
                className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground", filters.kind === k && "bg-background text-foreground shadow-sm")}>
                {k ? KIND_LABEL[k] : "Hammasi"} · {count === undefined ? "—" : formatNumber(count)}
              </button>
            );
          })}
        </div>
      )}

      <DebtFilterBar filters={filters} setFilters={setFilters} options={data?.options} />
      {data && !isPlaceholderData && <p className="text-sm text-muted-foreground">{sumLine(hasDebtFilter(filters), data.total, data.sum, data.tabs[tab])}</p>}
      {/* Nothing else on the row says it opens: until this line, admins found the drawer by accident. */}
      {data && data.total > 0 && (
        <p className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm text-primary">
          <MousePointerClick className="size-4 shrink-0" />
          O&apos;quvchi ustiga bosing — qarz tafsiloti, aloqa va va&apos;da o&apos;ng tomonda ochiladi
        </p>
      )}

      {isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Qarzdorlar ro&apos;yxatini yuklab bo&apos;lmadi.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Qayta urinish</Button>
        </div>
      ) : (
        // The previous page stays dimmed and inert until the next one answers.
        <div aria-busy={isPlaceholderData} className={cn(isPlaceholderData && "pointer-events-none opacity-60")}>
          <DebtTable tab={tab} rows={data?.data} loading={tableLoading} filtered={hasDebtFilter(filters)} offset={(filters.page - 1) * filters.pageSize} today={today} onOpen={setDrawerId}
            onPay={(r) => setPayTarget({ id: r.studentId, firstName: r.firstName, lastName: r.lastName, balance: -r.debt, suggested: r.debt })} />
        </div>
      )}

      {data && data.total > 0 && (
        <TablePagination total={data.total} page={filters.page} pageSize={filters.pageSize}
          onPageChange={(p) => setFilters({ page: p })} onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })} />
      )}

      <div className="space-y-1.5 pt-2">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
          <FooterLink href="/payments/debt-history">Oylar bo&apos;yicha qarz tarixi</FooterLink>
          <FooterLink href="/payments/debt-write-offs">Kechirilgan qarzlar arxivi{data ? ` · ${formatNumber(data.writeOffCount)} ta` : ""}</FooterLink>
        </div>
        <p className="text-xs text-muted-foreground">Markaz qoplagani — Ish haqi sahifasida.</p>
        {/* Spec B2b §3.8: the frozen balances live on «Qaytariladigan pul» now. */}
        <p className="text-xs text-muted-foreground">
          Muzlatilganlarning markazda turgan puli —{" "}
          <Link href="/payments/refunds?tab=muzlatilgan" className="text-primary hover:underline">«Qaytariladigan pul»</Link> sahifasida.
        </p>
      </div>

      <RecordPaymentDialog open={payTarget !== null} onOpenChange={(open) => !open && setPayTarget(null)}
        preSelectedStudent={payTarget} suggestedAmount={payTarget?.suggested} />
      <DebtDrawer studentId={drawerId} onClose={() => setDrawerId(null)}
        onPay={(t) => { setDrawerId(null); setPayTarget(t); }}
        onLogCall={(p) => { setDrawerId(null); setCallTarget(p); }} />
      <LogCallDialog open={callTarget !== null} onOpenChange={(open) => !open && setCallTarget(null)} prefill={callTarget} />
    </div>
  );
}

const FooterLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="inline-flex items-center gap-1 text-primary hover:underline">{children}<ArrowRight className="size-3.5" /></Link>
);

function TabButtons({ tabs, active, monthKey, onSelect }: {
  tabs: DebtListResponse["tabs"] | undefined; active: DebtTab; monthKey: string; onSelect: (t: DebtTab) => void;
}) {
  return (
    <div role="tablist" aria-label="Qarz turi" className="grid gap-3 md:grid-cols-3">
      {DEBT_TABS.map((t) => {
        const total = tabs?.[t];
        return (
          <button key={t} type="button" role="tab" aria-selected={t === active} onClick={() => onSelect(t)}
            className={cn("flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left", t === "chiqqan" && "bg-muted/50", t === active && "border-primary ring-1 ring-primary")}>
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className={cn("size-2 rounded-full", TAB_DOT[t])} />{TAB_LABEL[t]}
            </span>
            <span className={cn("text-xl font-bold tabular-nums", t !== "chiqqan" && "text-red-600 dark:text-red-400")}>{total ? formatBalance(total.total) : "—"}</span>
            {total && <span className="text-xs text-muted-foreground">{tabSubline(t, total.count, monthKey)}</span>}
          </button>
        );
      })}
    </div>
  );
}
