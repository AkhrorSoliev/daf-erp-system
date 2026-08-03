"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, HandCoins, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthPicker } from "@/components/ui/month-picker";
import { useUrlFilters } from "@/hooks/use-url-filters";
import api from "@/lib/api";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { SummaryCard } from "./summary-card";
import { SalaryAddAdvanceDialog } from "./salary-add-advance-dialog";
import { SalaryAdvanceCalendar } from "./salary-advance-calendar";
import { SalaryAdvanceDayPanel } from "./salary-advance-day-panel";
import { currentMonthKey } from "./salary-utils";

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
  };
  advances: AdvanceRow[];
}

const FALLBACK_FLOOR = "2026-05";

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
 * «Avanslar» tabi — oy davomida qaysi kuni qancha avans berilgani.
 * Butun oy bitta so'rovda keladi, shuning uchun kunni tanlash mahalliy holat.
 */
export function SalaryAdvancesTab({ canPay }: { canPay: boolean }) {
  const { filters, setFilters } = useUrlFilters(filtersSchema);
  const [addOpen, setAddOpen] = useState(false);
  // Tanlangan kun URL'ga yozilmaydi — u vaqtinchalik UI holati.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Panel orqali ochilganda dialogga uzatiladigan sana.
  const [addDate, setAddDate] = useState<Date | null>(null);

  const maxMonth = currentMonthKey();
  const month = filters.month || maxMonth;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["salary-advance-calendar", month],
    queryFn: () =>
      api
        .get<CalendarResponse>("/salary/advance-calendar", { params: { month } })
        .then((r) => r.data),
    staleTime: 0,
  });

  const totals = data?.totals;
  const floorMonth = data?.floorMonth ?? FALLBACK_FLOOR;
  // Server oyni floor'gacha ko'taradi — tanlagichda ham shuni ko'rsatamiz.
  const shownMonth = data?.month ?? month;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <MonthPicker
          value={shownMonth}
          minMonth={floorMonth}
          maxMonth={maxMonth}
          onChange={(m) => {
            setSelectedDate(null);
            setFilters({ month: m });
          }}
          className="sm:w-52"
        />
        <div className="flex-1" />
        {canPay && (
          <Button className="shrink-0" onClick={() => setAddOpen(true)}>
            <HandCoins className="size-4" />
            Avans qo&apos;shish
          </Button>
        )}
      </div>

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
            value={totals ? `${formatNumber(totals.daysWithAdvances)} kun` : "—"}
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
            Bu oyda avans berilmagan.
          </p>
          {canPay && (
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => setAddOpen(true)}
            >
              <HandCoins className="size-4" />
              Avans qo&apos;shish
            </Button>
          )}
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
          />
        </div>
      )}

      <SalaryAddAdvanceDialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) setAddDate(null);
        }}
        onSaved={() => refetch()}
        defaultDate={addDate}
      />
    </div>
  );
}
