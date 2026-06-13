"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CalendarPlus,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarWithPreview } from "@/components/ui/avatar-with-preview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { formatBalance, formatNumber, formatPhone } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { TablePagination } from "@/components/outreach/table-pagination";
import {
  CALL_OUTCOME_INFO,
  type CallOutcome,
} from "@/components/outreach/outreach-types";
import { SummaryCard } from "./summary-card";
import { RecordPaymentDialog } from "./record-payment-dialog";
import {
  AddPaymentPromiseDialog,
  type PromiseTarget,
} from "./add-payment-promise-dialog";

interface Debtor {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string | null;
  balance: number;
  debtAmount: number;
  enrollments: {
    group: { id: string; name: string; course: { name: string } };
  }[];
  // Active payment commitment (OPEN = belgilangan, BROKEN = muddati o'tgan).
  promise: {
    promiseDate: string;
    comment: string | null;
    status: "OPEN" | "BROKEN";
  } | null;
  // Last call logged from the Aloqa markazi (so it shows here too).
  lastCall: {
    note: string | null;
    outcome: CallOutcome;
    createdAt: string;
    calledByName: string;
  } | null;
}

interface DebtorSummary {
  totalDebt: number;
  debtorCount: number;
  avgDebt: number;
  openPromises: number;
  overduePromises: number;
}

const SORT_OPTIONS = [
  { value: "debt_high", label: "Eng katta qarz", sortBy: "balance", order: "asc" },
  { value: "debt_low", label: "Eng kichik qarz", sortBy: "balance", order: "desc" },
  { value: "name", label: "Ism (A-Z)", sortBy: "firstName", order: "asc" },
] as const;

const PROMISE_OPTIONS = [
  { value: "all", label: "Barcha qarzdorlar" },
  { value: "has_open", label: "Sana belgilangan" },
  { value: "overdue", label: "Muddati o'tgan" },
] as const;

const FILTER_SCHEMA = {
  search: { type: "string", defaultValue: "" },
  sort: { type: "string", defaultValue: "debt_high" },
  promise: { type: "string", defaultValue: "all" },
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 10 },
} as const;

export function DebtorsClient() {
  const { selectedBranch } = useBranchSwitcher();
  const queryClient = useQueryClient();
  const { filters, setFilter, setFilters } = useUrlFilters(FILTER_SCHEMA);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [recordTarget, setRecordTarget] = useState<PromiseTarget | null>(null);
  const [promiseTarget, setPromiseTarget] = useState<PromiseTarget | null>(null);

  // Local input mirror so typing stays smooth; debounced into the URL.
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => setSearchInput(filters.search), [filters.search]);
  useEffect(() => {
    if (searchInput === filters.search) return;
    const t = setTimeout(
      () => setFilters({ search: searchInput, page: 1 }),
      300,
    );
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Qarzdorlar
          </h2>
          <p className="text-sm text-muted-foreground">
            Balansi minus bo&apos;lgan faol o&apos;quvchilar
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-2" />
          To&apos;lov qayd qilish
        </Button>
      </div>

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
          icon={<TrendingDown className="size-5 text-amber-700 dark:text-amber-300" />}
          tone="amber"
          label="O'rtacha qarz"
          value={summary ? formatBalance(summary.avgDebt) : "—"}
        />
        <SummaryCard
          icon={<CalendarClock className="size-5 text-violet-700 dark:text-violet-300" />}
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
            placeholder="Ism, telefon yoki ID bo'yicha qidirish..."
            className="pl-8"
          />
        </div>
        <Select
          value={filters.sort}
          onValueChange={(v) => setFilters({ sort: v, page: 1 })}
        >
          <SelectTrigger className="w-44">
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
          <SelectTrigger className="w-52">
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
        <p className="text-sm text-muted-foreground py-8 text-center">
          {filters.search || filters.promise !== "all"
            ? "Filtrlarga mos qarzdor topilmadi"
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
                    onAddPromise={() =>
                      setPromiseTarget({
                        id: d.id,
                        firstName: d.firstName,
                        lastName: d.lastName,
                        balance: d.balance,
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
      <AddPaymentPromiseDialog
        open={!!promiseTarget}
        onOpenChange={(open) => !open && setPromiseTarget(null)}
        student={promiseTarget}
        onSuccess={refresh}
      />
    </div>
  );
}

function DebtorRow({
  debtor,
  index,
  onRecordPayment,
  onAddPromise,
}: {
  debtor: Debtor;
  index: number;
  onRecordPayment: () => void;
  onAddPromise: () => void;
}) {
  const name = `${debtor.firstName} ${debtor.lastName}`;
  return (
    <TableRow>
      <TableCell className="border-r text-muted-foreground">{index}</TableCell>
      <TableCell>
        <AvatarWithPreview src={debtor.photo} alt={name}>
          <Avatar className="size-8">
            <AvatarImage src={debtor.photo ?? undefined} alt={name} />
            <AvatarFallback className="text-xs">
              {debtor.firstName[0]}
              {debtor.lastName[0]}
            </AvatarFallback>
          </Avatar>
        </AvatarWithPreview>
      </TableCell>
      <TableCell className="font-medium">
        <Link
          href={`/students/profile/${debtor.id}`}
          className="hover:underline"
        >
          {name}
        </Link>
        <div className="text-xs text-muted-foreground">#{debtor.id}</div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {debtor.phone ? (
          <a href={`tel:+998${debtor.phone}`} className="hover:underline">
            {formatPhone(debtor.phone)}
          </a>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-sm">
        {debtor.enrollments.length > 0 ? (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {debtor.enrollments.map((e) => (
              <Link
                key={e.group.id}
                href={`/groups/${e.group.id}`}
                className="hover:underline"
              >
                {e.group.name}
              </Link>
            ))}
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-sm">
        <DebtorActivity promise={debtor.promise} lastCall={debtor.lastCall} />
      </TableCell>
      <TableCell className="text-right font-medium text-red-600 tabular-nums">
        {formatBalance(debtor.debtAmount)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Amallar</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRecordPayment}>
              <Plus className="mr-2 size-4" />
              To&apos;lov qayd qilish
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAddPromise}>
              <CalendarPlus className="mr-2 size-4" />
              To&apos;lov sanasini belgilash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

/**
 * Compact "To'lov sanasi / Izoh" cell: the active payment promise (date badge +
 * its comment) and, underneath, the last call logged from the Aloqa markazi.
 * The call line is hidden when its note duplicates the promise comment (a
 * "To'laydi" call with a date upserts the promise using the same note).
 */
function DebtorActivity({
  promise,
  lastCall,
}: {
  promise: Debtor["promise"];
  lastCall: Debtor["lastCall"];
}) {
  if (!promise && !lastCall) {
    return <span className="text-muted-foreground">—</span>;
  }

  const callNote = lastCall?.note?.trim() ?? "";
  const promiseComment = promise?.comment?.trim() ?? "";
  const showCall = !!lastCall && (!promise || callNote !== promiseComment);
  const overdue = promise?.status === "BROKEN";
  const outcome = lastCall ? CALL_OUTCOME_INFO[lastCall.outcome] : null;

  return (
    <div className="space-y-1">
      {promise && (
        <div className="space-y-0.5">
          <Badge
            variant="outline"
            className={
              overdue
                ? "border-red-200 bg-red-100 text-red-700 hover:bg-red-100"
                : "border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100"
            }
          >
            <CalendarClock className="mr-1 size-3" />
            {format(new Date(promise.promiseDate), "dd.MM.yyyy")}
            {overdue && " · muddati o'tgan"}
          </Badge>
          {promiseComment && (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                  {promiseComment}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">
                {promiseComment}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {showCall && lastCall && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex max-w-[220px] items-center gap-1 text-xs text-muted-foreground">
              <Phone className="size-3 shrink-0" />
              <span className="truncate">
                {outcome?.label}
                {callNote ? `: ${callNote}` : ""}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[260px]">
            <div className="font-medium">{outcome?.label}</div>
            {callNote && <div>{callNote}</div>}
            <div className="mt-1 text-[11px] opacity-80">
              {lastCall.calledByName} ·{" "}
              {format(new Date(lastCall.createdAt), "dd.MM.yyyy, HH:mm")}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

