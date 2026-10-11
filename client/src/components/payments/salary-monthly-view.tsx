"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import api from "@/lib/api";
import { monthLabel } from "./salary-utils";
import type { SalarySettingsAccess } from "./salary-settings-access";
import { SettleMonthDialog } from "./salary-settle-month-dialog";
import { SalaryAttentionCard } from "./salary/salary-attention-card";
import { filterPeople, mergePeople, segmentLabels } from "./salary/salary-page-model";
import { SalaryPeopleTable } from "./salary/salary-people-table";
import { useInvalidateSalary, useSalaryMonthly } from "./salary/salary-queries";
import { SalarySummaryCard } from "./salary/salary-summary-card";

const filtersSchema = {
  search: { type: "string" as const, defaultValue: "" },
  // Teachers earn per lesson, staff a flat monthly rate: the split the data already has.
  kim: { type: "string" as const, defaultValue: "all" },
};

type Kim = "all" | "teachers" | "staff";
const asKim = (v: string): Kim => (v === "teachers" || v === "staff" ? v : "all");

interface Props {
  /** `YYYY-MM` from the page header; the server may clamp it up to its floor. */
  month: string;
  onOpenRow: (userId: number) => void;
  /** `salary.close` — the bulk settle. */
  canClose: boolean;
  settingsAccess: SalarySettingsAccess;
  onOpenSettings: () => void;
}

/**
 * «Oyliklar» (spec §2.2–§2.4): summary → attention → filters → one table.
 * The month picker, «Stavkalar» and «+ Avans berish» live in the page header.
 */
export function SalaryMonthlyView({ month, onOpenRow, canClose, settingsAccess, onOpenSettings }: Props) {
  const { filters, setFilters } = useUrlFilters(filtersSchema);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [settleOpen, setSettleOpen] = useState(false);
  const invalidateSalary = useInvalidateSalary();
  const debouncedSetSearch = useDebouncedCallback((value: string) => setFilters({ search: value }), 300);

  const { data, isError, refetch } = useSalaryMonthly(month, filters.search);
  const shownMonth = data?.month ?? month;

  // Unpaid payroll rows, from the settle preview rather than the table: a
  // re-calculated month can carry several payments per person.
  const { data: settlePreview } = useQuery({
    queryKey: ["settle-month-preview", shownMonth],
    queryFn: () =>
      api
        .get<{ rows: unknown[] }>("/salary/payments/settle-month/preview", { params: { month: shownMonth } })
        .then((r) => r.data),
    enabled: canClose && !!data && data.monthState.kind !== "OPEN",
    staleTime: 0,
  });
  const unpaidCount = settlePreview?.rows.length ?? 0;

  const people = useMemo(() => (data ? mergePeople(data) : []), [data]);
  const kim = asKim(filters.kim);
  const segment = segmentLabels(data);
  const monthHasNoData = !!data && data.data.length > 0 && data.data.every((t) => !t.hasLessonData);

  // A failed request is not "nobody this month" — never fall into the empty state.
  if (isError && !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
        Ma&apos;lumotni yuklab bo&apos;lmadi.
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Qayta urinish
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data ? (
        <SalarySummaryCard
          data={data}
          canClose={canClose}
          unpaidCount={unpaidCount}
          onSettle={() => setSettleOpen(true)}
        />
      ) : (
        <Skeleton className="h-52 w-full rounded-xl" />
      )}

      {data && (
        <SalaryAttentionCard
          attention={data.attention}
          canEditStaffRates={settingsAccess.canManageCompanyPayroll}
          onOpenSettings={settingsAccess.canOpen ? onOpenSettings : undefined}
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ism yoki ID"
            className="pl-9"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              debouncedSetSearch(e.target.value);
            }}
          />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={kim}
          // Radix lets a single group be emptied by clicking the active item; keep one chosen.
          onValueChange={(v) => v && setFilters({ kim: v })}
          className="w-full sm:w-auto"
        >
          <ToggleGroupItem value="all" className="flex-1">{segment.all}</ToggleGroupItem>
          <ToggleGroupItem value="teachers" className="flex-1">{segment.teachers}</ToggleGroupItem>
          <ToggleGroupItem value="staff" className="flex-1">{segment.staff}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Manual-month note — about per-lesson data, i.e. the teacher rows */}
      {kim !== "staff" && monthHasNoData && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            {monthLabel(shownMonth)} — bu oy qo&apos;lda kiritilgan, har bir dars bo&apos;yicha ma&apos;lumot yo&apos;q.
            Faqat kiritilgan summa va avans ko&apos;rsatilgan.
          </span>
        </div>
      )}

      <SalaryPeopleTable
        rows={filterPeople(people, kim)}
        state={data?.monthState.kind ?? "OPEN"}
        // Not `isLoading`: a paused (offline) query has no data and is not loading.
        loading={!data}
        onOpenRow={onOpenRow}
      />

      <p className="text-xs text-muted-foreground">
        Jadvalda «O&apos;quvchilar to&apos;lagan / Markaz qo&apos;shdi» ustunlari yo&apos;q — ular xodim oynasida.
        «Avans» — aynan shu oylikdan ushlanadigan summa. Hisoblash davri doim kalendar oyi (1-sanadan).
      </p>

      {canClose && (
        <SettleMonthDialog
          open={settleOpen}
          month={shownMonth}
          onOpenChange={setSettleOpen}
          onSettled={invalidateSalary}
        />
      )}
    </div>
  );
}
