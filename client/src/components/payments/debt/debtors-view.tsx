"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Plus,
  Search,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { TablePagination } from "@/components/outreach/table-pagination";
import {
  LogCallDialog,
  type LogCallPrefill,
} from "@/components/outreach/log-call-dialog";
import { SummaryCard } from "../summary-card";
import { RecordPaymentDialog } from "../record-payment-dialog";
import { type Debtor, DebtorRow } from "../debtor-row";
import { useDebtFilters } from "./debt-filters-provider";

type PaymentTarget = {
  id: number;
  firstName: string;
  lastName: string;
  balance: number;
};

interface DebtorSummary {
  totalDebt: number;
  debtorCount: number;
  avgDebt: number;
  openPromises: number;
  overduePromises: number;
}

export const SORT_OPTIONS = [
  { value: "debt_high", label: "Eng katta qarz", sortBy: "balance", order: "asc" },
  { value: "debt_low", label: "Eng kichik qarz", sortBy: "balance", order: "desc" },
  { value: "name", label: "Ism (A-Z)", sortBy: "firstName", order: "asc" },
] as const;

const PROMISE_OPTIONS = [
  { value: "all", label: "Barcha qarzdorlar" },
  { value: "has_open", label: "Sana belgilangan" },
  { value: "overdue", label: "Muddati o'tgan" },
] as const;

/**
 * The debt page's main view: who owes money right now, and the two actions that
 * move that — record a payment, log a call.
 *
 * Payment promises are NOT a separate list here. `GET /payments/debtors`
 * already returns each debtor's active promise and last call, so a promise is
 * rendered as part of the row and filtered from the same bar. There is likewise
 * no separate "make a promise" dialog: `LogCallDialog` with the "To'laydi"
 * outcome already creates one, and a second way to write the same record would
 * be a second thing to keep in step.
 */
export function DebtorsView() {
  const { selectedBranch } = useBranchSwitcher();
  const queryClient = useQueryClient();
  const { filters, setFilter, setFilters } = useDebtFilters();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [recordTarget, setRecordTarget] = useState<PaymentTarget | null>(null);
  const [callTarget, setCallTarget] = useState<LogCallPrefill | null>(null);

  // Local input mirror so typing stays smooth; debounced into the URL.
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => setSearchInput(filters.search), [filters.search]);
  useEffect(() => {
    if (searchInput === filters.search) return;
    const t = setTimeout(() => setFilters({ search: searchInput, page: 1 }), 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.search, setFilters]);

  const sortMeta =
    SORT_OPTIONS.find((s) => s.value === filters.sort) ?? SORT_OPTIONS[0];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["debtors"] });
    queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
  };

  const { data, isLoading } = useQuery({
    queryKey: [
      "debtors",
      "list",
      selectedBranch?.id,
      filters.search,
      filters.sort,
      filters.promise,
      filters.page,
      filters.pageSize,
    ],
    queryFn: () =>
      api
        .get<{ data: Debtor[]; total: number }>("/payments/debtors", {
          params: {
            branchId: selectedBranch?.id,
            page: filters.page,
            pageSize: filters.pageSize,
            search: filters.search || undefined,
            sortBy: sortMeta.sortBy,
            order: sortMeta.order,
            promise: filters.promise === "all" ? undefined : filters.promise,
          },
        })
        .then((r) => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ["debtors", "summary", selectedBranch?.id],
    queryFn: () =>
      api
        .get<DebtorSummary>("/payments/debtors/summary", {
          params: { branchId: selectedBranch?.id },
        })
        .then((r) => r.data),
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Balansi minus bo&apos;lgan faol o&apos;quvchilar
          {selectedBranch ? ` — ${selectedBranch.name}` : ""}
        </p>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          To&apos;lov qayd qilish
        </Button>
      </div>

      {/* All three measure "right now". The center top-up figure is deliberately
          NOT here — it is month-scoped, and a monthly number in a row of live
          ones invites the two to be read as comparable. It has its own tab. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          icon={<Wallet className="size-5 text-red-700 dark:text-red-300" />}
          tone="red"
          label="Jami qarz"
          value={summary ? formatBalance(summary.totalDebt) : "—"}
        />
        <SummaryCard
          icon={<Users className="size-5 text-slate-700 dark:text-slate-300" />}
          tone="slate"
          label="Qarzdorlar soni"
          value={summary ? `${formatNumber(summary.debtorCount)} ta` : "—"}
        />
        <SummaryCard
          icon={
            <TrendingDown className="size-5 text-amber-700 dark:text-amber-300" />
          }
          tone="amber"
          label="O'rtacha qarz"
          value={summary ? formatBalance(summary.avgDebt) : "—"}
        />
        <SummaryCard
          icon={
            <CalendarClock className="size-5 text-violet-700 dark:text-violet-300" />
          }
          tone="violet"
          label="Belgilangan / muddati o'tgan"
          value={
            summary
              ? `${formatNumber(summary.openPromises)} / ${formatNumber(summary.overduePromises)}`
              : "—"
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Ism, telefon yoki ID bo'yicha qidirish…"
            spellCheck={false}
            aria-label="Qarzdorlar orasidan qidirish"
            className="pl-8"
          />
        </div>
        <Select
          value={filters.sort}
          onValueChange={(v) => setFilters({ sort: v, page: 1 })}
        >
          <SelectTrigger className="w-44" aria-label="Saralash">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.promise}
          onValueChange={(v) => setFilters({ promise: v, page: 1 })}
        >
          <SelectTrigger className="w-52" aria-label="To'lov sanasi holati">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROMISE_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {filters.search || filters.promise !== "all"
            ? "Filtrlarga mos qarzdor topilmadi — qidiruvni tozalab yoki filtrni kengaytirib ko'ring"
            : "Qarzdor o'quvchilar yo'q"}
        </p>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>O&apos;quvchi</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Guruh</TableHead>
                  <TableHead>To&apos;lov sanasi / Izoh</TableHead>
                  <TableHead className="text-right">Qarz</TableHead>
                  <TableHead>Qachondan beri</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d, i) => (
                  <DebtorRow
                    key={d.id}
                    debtor={d}
                    index={(filters.page - 1) * filters.pageSize + i + 1}
                    onRecordPayment={() =>
                      setRecordTarget({
                        id: d.id,
                        firstName: d.firstName,
                        lastName: d.lastName,
                        balance: d.balance,
                      })
                    }
                    onLogCall={() =>
                      setCallTarget({
                        studentId: d.id,
                        studentLabel: `#${d.id} ${d.firstName} ${d.lastName}`,
                        studentPhone: d.phone || null,
                        reason: "DEBT",
                      })
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            total={data?.total ?? 0}
            page={filters.page}
            pageSize={filters.pageSize}
            onPageChange={(p) => setFilter("page", p)}
            onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
          />
        </>
      )}

      <RecordPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={refresh}
      />
      <RecordPaymentDialog
        open={!!recordTarget}
        onOpenChange={(open) => !open && setRecordTarget(null)}
        preSelectedStudent={recordTarget}
        suggestedAmount={
          recordTarget
            ? (rows.find((r) => r.id === recordTarget.id)?.debtAmount ?? undefined)
            : undefined
        }
        onSuccess={refresh}
      />
      <LogCallDialog
        open={!!callTarget}
        onOpenChange={(open) => !open && setCallTarget(null)}
        prefill={callTarget}
      />
    </div>
  );
}
