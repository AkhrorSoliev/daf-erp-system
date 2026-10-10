"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, HandCoins, Info, TrendingUp, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUrlFilters } from "@/hooks/use-url-filters";
import api from "@/lib/api";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { SummaryCard } from "./summary-card";
import { SalaryAdvanceDialog } from "./salary-advance-dialog";
import { SalaryDeleteAdvanceDialog } from "./salary-delete-advance-dialog";
import type { EditableAdvance } from "./advance-row-actions";
import { SalaryAdvanceCalendar } from "./salary-advance-calendar";
import { SalaryAdvanceDayPanel } from "./salary-advance-day-panel";
import { currentMonthKey } from "./salary-utils";
import { SalaryAdvancesTable } from "./salary/salary-advances-table";

export interface AdvanceDay {
  date: string;
  total: number;
  count: number;
  cash: number;
  card: number;
}

export interface AdvanceRow {
  id: string;
  date: string;
  amount: number;
  paymentMethod: "CASH" | "CARD";
  description: string;
  createdAt: string;
  settled: boolean;
  settledPeriodStart: string | null;
  settledPeriodEnd: string | null;
  /** «YYYY-MM»: the month of the payment that took it, or its own month while it waits. */
  deductMonth: string;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    roles: { id: number; name: string }[];
  };
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

interface CalendarResponse {
  month: string;
  floorMonth: string;
  days: AdvanceDay[];
  totals: {
    total: number;
    count: number;
    daysWithAdvances: number;
    employeeCount: number;
    maxDay: { date: string; total: number } | null;
    outsideRoster: { count: number; total: number };
  };
  advances: AdvanceRow[];
}

/**
 * Modul darajasida — komponent ichida yozilsa har renderda yangi obyekt bo'lib,
 * `useUrlFilters` ichidagi `useMemo` va `setFilters` identifikatori bekorga
 * yangilanib turadi. `salary-monthly-view.tsx:100` da ham shu shakl.
 * `month` kaliti «Oyliklar» tabi bilan BIR XIL — oy ikkala tabda umumiy.
 */
const filtersSchema = {
  month: { type: "string" as const, defaultValue: "" },
};

/** "2026-07-15" → "15.07". */
function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

/**
 * «Avanslar» tab: how much advance was given on which day, then the month's
 * advances as a table. The month picker and «Avans berish» live in the page
 * header; the tab reads the month from `?month=`. The whole month arrives in
 * one request, so picking a day is local state. The caller mounts the tab with
 * `key={month}`, so a new month starts with no day picked and on page one of
 * the table.
 */
export function SalaryAdvancesTab({ canPay }: { canPay: boolean }) {
  const { filters } = useUrlFilters(filtersSchema);
  const [addOpen, setAddOpen] = useState(false);
  // Tanlangan kun URL'ga yozilmaydi — u vaqtinchalik UI holati.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Panel orqali ochilganda dialogga uzatiladigan sana.
  const [addDate, setAddDate] = useState<Date | null>(null);
  // Tahrirlanayotgan va o'chirilayotgan avans — ikkalasi ham vaqtinchalik UI
  // holati, URL'ga yozilmaydi.
  const [editAdvance, setEditAdvance] = useState<EditableAdvance | null>(null);
  const [deleteAdvance, setDeleteAdvance] = useState<EditableAdvance | null>(
    null,
  );

  const maxMonth = currentMonthKey();
  const month = filters.month || maxMonth;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["salary-advance-calendar", month],
    queryFn: () =>
      api
        .get<CalendarResponse>("/salary/advance-calendar", {
          params: { month },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const totals = data?.totals;
  // The server lifts the month to the floor; the calendar shows that month.
  const shownMonth = data?.month ?? month;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            icon={
              <HandCoins className="size-5 text-amber-700 dark:text-amber-300" />
            }
            tone="amber"
            label="Jami avans"
            value={totals ? formatBalance(totals.total) : "—"}
          />
          <SummaryCard
            icon={
              <CalendarDays className="size-5 text-blue-700 dark:text-blue-300" />
            }
            tone="blue"
            label="Berilgan kunlar"
            value={
              totals ? `${formatNumber(totals.daysWithAdvances)} kun` : "—"
            }
          />
          <SummaryCard
            icon={
              <Users className="size-5 text-violet-700 dark:text-violet-300" />
            }
            tone="violet"
            label="Xodimlar"
            value={totals ? `${formatNumber(totals.employeeCount)} ta` : "—"}
          />
          <SummaryCard
            icon={
              <TrendingUp className="size-5 text-red-700 dark:text-red-300" />
            }
            tone="red"
            label="Eng katta kun"
            value={
              totals?.maxDay
                ? `${shortDay(totals.maxDay.date)} — ${formatBalance(totals.maxDay.total)}`
                : "—"
            }
          />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-[360px] w-full" />
      ) : data && data.days.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {canPay
              ? "Bu oyda avans berilmagan — «Avans berish» tugmasi bilan qo'shing."
              : "Bu oyda avans berilmagan."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <SalaryAdvanceCalendar
            month={shownMonth}
            days={data?.days ?? []}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
          />
          <SalaryAdvanceDayPanel
            date={selectedDate}
            advances={data?.advances ?? []}
            canPay={canPay}
            onAdd={(d) => {
              setAddDate(new Date(`${d}T00:00:00`));
              setAddOpen(true);
            }}
            onEdit={setEditAdvance}
            onDelete={setDeleteAdvance}
          />
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        data &&
        data.advances.length > 0 && <SalaryAdvancesTable advances={data.advances} />
      )}

      {/* Kalendar barcha avanslarni ko'rsatadi, «Oyliklar» JAMI'si esa faqat
          oylik ro'yxatidagi xodimlarnikini — farq yashirin qolmasin. */}
      {totals && totals.outsideRoster.count > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            {formatNumber(totals.outsideRoster.count)} ta avans (
            {formatBalance(totals.outsideRoster.total)}) oylik ro&apos;yxatidan
            tashqari xodimga berilgan — «Oyliklar» tabidagi Avans JAMI&apos;sida
            ko&apos;rinmaydi.
          </p>
        </div>
      )}

      <SalaryAdvanceDialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) setAddDate(null);
        }}
        onSaved={() => refetch()}
        defaultDate={addDate}
      />

      {/* Tahrirlash — xuddi shu oyna, `advance` berilgan rejimda */}
      <SalaryAdvanceDialog
        open={!!editAdvance}
        onOpenChange={(v) => {
          if (!v) setEditAdvance(null);
        }}
        onSaved={() => refetch()}
        advance={editAdvance}
      />

      <SalaryDeleteAdvanceDialog
        advance={deleteAdvance}
        onOpenChange={(v) => {
          if (!v) setDeleteAdvance(null);
        }}
        onDeleted={() => refetch()}
      />
    </div>
  );
}
