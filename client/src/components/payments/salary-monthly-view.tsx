"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, Info, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthPicker } from "@/components/ui/month-picker";
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
import { SalaryAddAdvanceDialog } from "./salary-add-advance-dialog";
import {
  SalaryAdvanceBreakdownDrawer,
  type AdvanceTarget,
} from "./salary-advance-breakdown-drawer";
import {
  SalaryMonthlyStaffTable,
  type StaffRow,
  type StaffTotals,
} from "./salary-monthly-staff-table";

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
  centerFunded: number | null;
  advances: number;
  netToPay: number;
  centerAdvanced: number;
  centerStillFronted: number;
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
    centerFunded: number;
    advances: number;
    netToPay: number;
    // Center top-up lifecycle (company-level card): advanced (X) / recovered
    // (Y) / still-fronted (Z), where Y = X − Z.
    centerAdvanced: number;
    centerRecovered: number;
    centerStillFronted: number;
  };
  // Non-teaching FIXED_MONTHLY staff (admin/cashier/director) — flat salary.
  staff: StaffRow[];
  staffTotals: StaffTotals;
}

const FALLBACK_FLOOR = "2026-05";

const filtersSchema = {
  month: { type: "string" as const, defaultValue: "" },
  search: { type: "string" as const, defaultValue: "" },
  // The page holds two payrolls that are computed differently: teachers earn
  // per lesson, staff earn a flat monthly rate. Filtering by which one you are
  // looking at is the split the data itself already has.
  kim: { type: "string" as const, defaultValue: "all" },
};

interface Props {
  isCeo: boolean;
  /** CEO/BD — may add advances (backed by the CEO/BD expense-create endpoint). */
  canPay: boolean;
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
  canPay,
  onOpenBreakdown,
  refreshKey,
  bumpRefresh,
}: Props) {
  const { filters, setFilters } = useUrlFilters(filtersSchema);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addAdvanceOpen, setAddAdvanceOpen] = useState(false);
  const [advanceTarget, setAdvanceTarget] = useState<AdvanceTarget | null>(
    null,
  );

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
        <Select
          value={filters.kim}
          onValueChange={(v) => setFilters({ kim: v })}
        >
          <SelectTrigger className="shrink-0 sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Hamma xodimlar</SelectItem>
            <SelectItem value="teachers">Faqat ustozlar</SelectItem>
            <SelectItem value="staff">Faqat xodimlar</SelectItem>
          </SelectContent>
        </Select>
        {canPay && (
          <Button
            className="shrink-0"
            onClick={() => setAddAdvanceOpen(true)}
          >
            <HandCoins className="size-4" />
            Avans qo&apos;shish
          </Button>
        )}
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

      {/* Manual-month note — about per-lesson data, i.e. the teacher table */}
      {filters.kim !== "staff" && monthHasNoData && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            {monthLabel(shownMonth)} — bu oy qo&apos;lda kiritilgan, dars-by-dars
            ma&apos;lumot yo&apos;q. Faqat kiritilgan summa va avans ko&apos;rsatilgan.
          </span>
        </div>
      )}

      {/* Teachers */}
      {filters.kim !== "staff" && (
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
                      Markaz qo&apos;shdi
                      <Info className="size-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64">
                      Markazning o&apos;z hisobidan bergan qismi. Oy yopilmaguncha
                      bu prognoz — o&apos;quvchi to&apos;lasa kamayadi; oy yopilgach
                      markaz haqiqatan bergan summa bo&apos;lib qoladi. Keyin
                      o&apos;quvchi to&apos;lasa, pul markazga qaytadi (pastdagi
                      &laquo;undirildi&raquo;), ustozga qayta yozilmaydi.
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
                        value={row.centerFunded}
                        className={cn(
                          row.centerFunded &&
                            row.centerFunded > 0 &&
                            "font-medium text-amber-700 dark:text-amber-400",
                        )}
                      />
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.advances > 0 ? (
                        <button
                          type="button"
                          className="font-medium text-amber-700 hover:underline dark:text-amber-400"
                          onClick={() =>
                            setAdvanceTarget({
                              userId: row.user.id,
                              name: `${row.user.firstName} ${row.user.lastName}`,
                              month: shownMonth,
                            })
                          }
                        >
                          {formatPrice(row.advances)}
                        </button>
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
                  {formatPrice(totals.centerFunded)}
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
      )}

      {/* Markaz qo'shimchasi lifecycle (company-level) — shown only for months
          where the center actually fronted money (past settled top-up months). */}
      {!isLoading && totals && totals.centerAdvanced > 0 && (
        <div className="rounded-md border bg-muted/20 p-4">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-medium">
            Markaz qo&apos;shimchasi — undirish holati (bu oy)
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="size-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  Markaz o&apos;quvchilar to&apos;lamagan qismni ustozlarga
                  qo&apos;shib bergan. O&apos;quvchilar keyin to&apos;lasa, u pul
                  markazga qaytadi (undirildi) va ustozga qayta yozilmaydi.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">
                Jami qo&apos;shdi
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {formatPrice(totals.centerAdvanced)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Undirildi</div>
              <div className="text-lg font-semibold tabular-nums text-green-700 dark:text-green-400">
                {formatPrice(totals.centerRecovered)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Qolgan (markaz)
              </div>
              <div className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {formatPrice(totals.centerStillFronted)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fixed-salary staff (admin / cashier / director) — a separate payroll:
          flat monthly rate, no per-lesson accruals. */}
      {filters.kim !== "teachers" &&
        !isLoading &&
        data &&
        (data.staff.length > 0 ? (
          <SalaryMonthlyStaffTable
            staff={data.staff}
            totals={data.staffTotals}
            onOpenBreakdown={onOpenBreakdown}
          />
        ) : (
          // Actionable empty state: staff pay is invisible here until a rate
          // exists, and without one their lessons-free salary never reaches the
          // profit figure either.
          <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Xodimlarga (administrator, kassir, direktor) hali oylik
              belgilanmagan.
              {isCeo
                ? " Belgilash uchun ⚙ Sozlamalar → Stavkalar."
                : " CEO ⚙ Sozlamalar bo'limida belgilaydi."}
            </span>
          </div>
        ))}

      {/* Row count + manual-month totals caveat — teacher table only */}
      {filters.kim !== "staff" && !isLoading && rows.length > 0 && (
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

      {/* Avans qo'shish — CEO/BD */}
      {canPay && (
        <SalaryAddAdvanceDialog
          open={addAdvanceOpen}
          onOpenChange={setAddAdvanceOpen}
          onSaved={bumpRefresh}
        />
      )}

      {/* Avans breakdown drawer (opened from the Avans cell) */}
      <SalaryAdvanceBreakdownDrawer
        target={advanceTarget}
        onClose={() => setAdvanceTarget(null)}
      />
    </div>
  );
}
