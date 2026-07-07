"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Info, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthPicker } from "@/components/ui/month-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import {
  SALARY_STATUS_BADGE,
  SALARY_STATUS_LABELS,
  currentMonthKey,
  monthLabel,
} from "./salary-utils";
import { SalarySettingsSheet } from "./salary-settings-sheet";

interface MonthlyRow {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    isActive: boolean;
    branch: { id: number; name: string } | null;
  };
  hasLessonData: boolean;
  isFixedMonthly: boolean;
  fullDeserved: number | null;
  covered: number | null;
  gap: number | null;
  advances: number;
  netToPay: number;
  payment: { id: string; amount: number; status: string } | null;
}
interface MonthlyResponse {
  month: string;
  floorMonth: string;
  period: { periodStart: string; periodEnd: string; cycleStartDay: number };
  data: MonthlyRow[];
  totals: {
    fullDeserved: number;
    covered: number;
    gap: number;
    advances: number;
    netToPay: number;
  };
}

const FALLBACK_FLOOR = "2026-05";

const filtersSchema = {
  month: { type: "string" as const, defaultValue: "" },
  search: { type: "string" as const, defaultValue: "" },
};

interface Props {
  isCeo: boolean;
  onOpenBreakdown: (paymentId: string) => void;
  refreshKey: number;
  bumpRefresh: () => void;
}

/** Renders a so'm value, or a muted "—" when the month has no per-lesson data. */
function MoneyOrDash({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  if (value == null)
    return <span className="text-muted-foreground">—</span>;
  return <span className={cn("tabular-nums", className)}>{formatPrice(value)}</span>;
}

export function SalaryMonthlyView({
  isCeo,
  onOpenBreakdown,
  refreshKey,
  bumpRefresh,
}: Props) {
  const { filters, setFilters } = useUrlFilters(filtersSchema);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const maxMonth = currentMonthKey();
  const month = filters.month || maxMonth;

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setFilters({ search: value });
  }, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["salary-monthly", month, filters.search, refreshKey],
    queryFn: () =>
      api
        .get<MonthlyResponse>("/salary/monthly", {
          params: { month, search: filters.search || undefined },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const rows = data?.data ?? [];
  const totals = data?.totals;
  const floorMonth = data?.floorMonth ?? FALLBACK_FLOOR;
  // The server clamps the month up to the floor — reflect that in the picker.
  const shownMonth = data?.month ?? month;
  const monthHasNoData =
    rows.length > 0 && rows.every((r) => !r.hasLessonData);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <MonthPicker
          value={shownMonth}
          minMonth={floorMonth}
          maxMonth={maxMonth}
          onChange={(m) => setFilters({ month: m })}
          className="sm:w-52"
        />
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ism, familiya yoki ID bo'yicha..."
            className="pl-9"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              debouncedSetSearch(e.target.value);
            }}
          />
        </div>
        {isCeo && (
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="size-4" />
            Sozlamalar
          </Button>
        )}
      </div>

      {/* Manual-month note */}
      {monthHasNoData && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            {monthLabel(shownMonth)} — bu oy qo&apos;lda kiritilgan, dars-by-dars
            ma&apos;lumot yo&apos;q. Faqat kiritilgan summa va avans ko&apos;rsatilgan.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>O&apos;qituvchi</TableHead>
              <TableHead className="text-right">To&apos;liq ishlangan</TableHead>
              <TableHead className="text-right">O&apos;quvchilar to&apos;lagan</TableHead>
              <TableHead className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="inline-flex items-center gap-1">
                      Qo&apos;shilishi kerak
                      <Info className="size-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      Markaz o&apos;z yonidan qo&apos;shishi kerak bo&apos;lgan summa
                      (to&apos;liq ishlangan − o&apos;quvchilar to&apos;lagan). O&apos;quvchi
                      keyin to&apos;lasa kamayadi.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-right">Avans</TableHead>
              <TableHead className="text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="inline-flex items-center gap-1">
                      To&apos;lanishi kerak
                      <Info className="size-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      O&apos;qituvchiga to&apos;lanishi kerak bo&apos;lgan sof summa:
                      to&apos;liq ishlangan (markaz qo&apos;shimchasi bilan) − avans.
                      Hisoblab bo&apos;lingan oylar uchun haqiqiy to&apos;langan summa
                      ko&apos;rsatiladi.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead>Holat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Bu oyda o&apos;qituvchi topilmadi — oyni yoki qidiruvni
                  o&apos;zgartirib ko&apos;ring.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, idx) => {
                const p = row.payment;
                return (
                  <TableRow
                    key={row.user.id}
                    className={cn(p && "cursor-pointer")}
                    onClick={p ? () => onOpenBreakdown(p.id) : undefined}
                  >
                    <TableCell className="border-r text-muted-foreground tabular-nums">
                      {idx + 1}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/teachers/profile/${row.user.id}?tab=ish-haqi`}
                        className="font-medium hover:underline"
                      >
                        {row.user.firstName} {row.user.lastName}
                      </Link>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        #{row.user.id}
                        {row.user.branch ? ` · ${row.user.branch.name}` : ""}
                        {row.isFixedMonthly && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[10px] font-normal"
                          >
                            Oylik
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <MoneyOrDash value={row.fullDeserved} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyOrDash value={row.covered} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyOrDash
                        value={row.gap}
                        className={cn(
                          row.gap && row.gap > 0 && "font-medium text-amber-700 dark:text-amber-400",
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.advances > 0 ? (
                        formatPrice(row.advances)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatPrice(row.netToPay)}
                    </TableCell>
                    <TableCell>
                      {p ? (
                        <Badge
                          className={cn("font-normal", SALARY_STATUS_BADGE[p.status])}
                        >
                          {SALARY_STATUS_LABELS[p.status] ?? p.status}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Hisoblanmagan
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {!isLoading && rows.length > 0 && totals && (
            <TableFooter>
              <TableRow>
                <TableCell className="border-r" />
                <TableCell className="font-semibold">Jami</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatPrice(totals.fullDeserved)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatPrice(totals.covered)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {formatPrice(totals.gap)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatPrice(totals.advances)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatPrice(totals.netToPay)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {/* Row count + manual-month totals caveat */}
      {!isLoading && rows.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Jami: {rows.length} ta o&apos;qituvchi</span>
          {rows.some((r) => !r.hasLessonData && r.payment) && (
            <span>
              Qo&apos;lda kiritilgan oylar &quot;to&apos;liq / to&apos;lagan / qo&apos;shilishi&quot;
              jamiga qo&apos;shilmagan
            </span>
          )}
        </div>
      )}

      {/* Settings (rate rules + cycle day) — CEO */}
      {isCeo && (
        <SalarySettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          period={data?.period ?? null}
          onChanged={bumpRefresh}
        />
      )}
    </div>
  );
}
