"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CreditCard,
  DollarSign,
  Eraser,
  Megaphone,
  Receipt,
  Target,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { KpiChartDialog } from "./kpi-chart-dialog";
import type { KpiKey } from "./kpi-chart-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

interface FinancialOverview {
  income: {
    expected: number;
    actual: number;
    /** Real lesson value billed in the period (Σ LESSON_DEDUCTION). */
    billed: number;
    paymentCount: number;
    byMethod: { method: string; amount: number; count: number }[];
  };
  /**
   * Forecast and receivables (D.2). `expected` above is kept as an alias for
   * `recognizedRevenueForecast` for backward compat; new clients should
   * read from here.
   */
  forecast: {
    recognizedRevenueForecast: number;
    outstandingReceivable: number;
    debtorExposure: { count: number; avgDebt: number };
  };
  salary: { paid: number; pending: number; advances?: number };
  expenses: number;
  netProfit: number;
  debtorCount: number;
  activeBalance: number;
  activeStudentCount: number;
  ltv: number;
  ltvPayerCount: number;
  cac: number;
  marketingRoi: number;
  avgPayment: number;
  newStudentCount: number;
  marketingExpenses: number;
}

const methodLabels: Record<string, string> = {
  CASH: "Naqd",
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
  TRANSFER: "Bank o'tkazmasi",
};

function fmt(n: number) {
  return n.toLocaleString("uz-UZ");
}

interface PaymentsOverviewProps {
  startDate: string;
  endDate: string;
  refreshKey?: number;
}

export function PaymentsOverview({ startDate, endDate, refreshKey }: PaymentsOverviewProps) {
  const { selectedBranch } = useBranchSwitcher();
  const user = useAuth((s) => s.user);
  const canSeeWriteOffSummary =
    user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

  const { data, isLoading } = useQuery({
    queryKey: ["financial-overview", selectedBranch?.id, startDate, endDate, refreshKey],
    queryFn: () =>
      api
        .get<FinancialOverview>("/reports/financial-overview", {
          params: { branchId: selectedBranch?.id, startDate, endDate },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const { data: writeOffSummary } = useQuery<{
    totalAmount: number;
    count: number;
  }>({
    queryKey: [
      "debt-write-offs-summary",
      selectedBranch?.id,
      startDate,
      endDate,
      refreshKey,
    ],
    queryFn: () =>
      api
        .get("/reports/debt-write-offs-summary", {
          params: { branchId: selectedBranch?.id, startDate, endDate },
        })
        .then((r) => r.data),
    enabled: canSeeWriteOffSummary,
    staleTime: 0,
  });

  const [chartKey, setChartKey] = useState<KpiKey | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-22 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const empty: FinancialOverview = {
    income: { expected: 0, actual: 0, billed: 0, paymentCount: 0, byMethod: [] },
    forecast: {
      recognizedRevenueForecast: 0,
      outstandingReceivable: 0,
      debtorExposure: { count: 0, avgDebt: 0 },
    },
    salary: { paid: 0, pending: 0, advances: 0 },
    expenses: 0,
    netProfit: 0,
    debtorCount: 0,
    activeBalance: 0,
    activeStudentCount: 0,
    ltv: 0,
    ltvPayerCount: 0,
    cac: 0,
    marketingRoi: 0,
    avgPayment: 0,
    newStudentCount: 0,
    marketingExpenses: 0,
  };

  const d = {
    ...empty,
    ...data,
    income: { ...empty.income, ...data?.income },
    forecast: { ...empty.forecast, ...data?.forecast, debtorExposure: { ...empty.forecast.debtorExposure, ...data?.forecast?.debtorExposure } },
    salary: { ...empty.salary, ...data?.salary },
  };

  return (
    <div className="space-y-6">
      {/* ===== Asosiy ko'rsatkichlar — 2 qator, 4 tadan ===== */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {/* 1. Tushumlar */}
        <KpiCard
          icon={Wallet}
          label="Tushumlar"
          value={`${fmt(d.income.actual)} so'm`}
          color="text-green-600 dark:text-green-400"
          tooltip={`${d.income.paymentCount} ta to'lov orqali`}
          onClick={() => setChartKey("income")}
        />
        {/* 2. Chiqimlar */}
        <KpiCard
          icon={Receipt}
          label="Chiqimlar"
          value={`${fmt(d.expenses + d.salary.paid)} so'm`}
          color="text-red-600 dark:text-red-400"
          tooltip={`Xarajatlar: ${fmt(d.expenses)}, Oyliklar: ${fmt(d.salary.paid)}`}
          onClick={() => setChartKey("expenses")}
        />
        {/* 3. Foyda */}
        <KpiCard
          icon={TrendingUp}
          label="Foyda"
          value={`${fmt(d.netProfit)} so'm`}
          color={d.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
          tooltip="Tushumlar - Chiqimlar (xarajatlar + oyliklar)"
          onClick={() => setChartKey("profit")}
        />
        {/* 4. To'lov qilganlar */}
        <KpiCard
          icon={Users}
          label="To'lov qilganlar"
          value={`${d.ltvPayerCount ?? 0} ta`}
          color="text-blue-600 dark:text-blue-400"
          tooltip="Tanlangan davrda kamida 1 marta to'lov qilgan o'quvchilar soni"
          subtitle="Davrda aktiv"
        />
        {/* 5. LTV */}
        <KpiCard
          icon={Users}
          label="LTV"
          value={`${fmt(d.ltv)} so'm`}
          color="text-violet-600 dark:text-violet-400"
          tooltip="Tanlangan davrdagi o'rtacha o'quvchi qiymati — shu davrda to'lov qilgan o'quvchilardan o'rtacha daromad"
          subtitle="Davriy o'quvchi qiymati"
          onClick={() => setChartKey("ltv")}
        />
        {/* 6. CAC */}
        <KpiCard
          icon={UserPlus}
          label="CAC"
          value={`${fmt(d.cac)} so'm`}
          color="text-amber-600 dark:text-amber-400"
          tooltip={`Yangi o'quvchi jalb qilish narxi. Marketing: ${fmt(d.marketingExpenses)}, Yangi: ${d.newStudentCount} ta`}
          subtitle="Jalb qilish narxi"
          onClick={() => setChartKey("cac")}
        />
        {/* 7. Marketing ROI */}
        <KpiCard
          icon={Megaphone}
          label="Marketing ROI"
          value={`${d.marketingRoi}%`}
          color={d.marketingRoi > 100 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}
          tooltip="Marketing samaradorligi — sarflangan mablag'ning qaytimi foizda"
          subtitle="Samaradorlik"
          onClick={() => setChartKey("marketingRoi")}
        />
        {/* 8. O'rtacha to'lov */}
        <KpiCard
          icon={CreditCard}
          label="O'rtacha to'lov"
          value={`${fmt(d.avgPayment)} so'm`}
          color="text-sky-600 dark:text-sky-400"
          tooltip="Har bir to'lovning o'rtacha summasi"
          subtitle="To'lov boshiga"
          onClick={() => setChartKey("avgPayment")}
        />
      </div>

      {/* ===== Pastki qator: Prognoz, Oyliklar, Qarzdorlik, To'lov usullari ===== */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {/* Tushum ko'rsatkichlari — Prognoz (bashorat) + Hisoblangan darslar (real) + Tushgan */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Tushum ko&apos;rsatkichlari
          </p>
          <div className="space-y-2.5">
            {/* Prognoz — schedule-based projection, not a real figure */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-between text-sm cursor-help">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <ArrowDownRight className="size-3.5 text-amber-500" />
                    Prognoz (bashorat)
                  </span>
                  <span className="font-medium">
                    {fmt(d.forecast.recognizedRevenueForecast)} so&apos;m
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64">
                Taxminiy reja — barcha aktiv o&apos;quvchi to&apos;liq oy dars
                olsa kutiladigan summa. Haqiqiy hisob emas, shuning uchun
                tushgan to&apos;lov va qarz bilan teng kelmaydi.
              </TooltipContent>
            </Tooltip>
            {/* Hisoblangan darslar — real billed (Σ LESSON_DEDUCTION) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-between text-sm cursor-help">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Receipt className="size-3.5 text-sky-500" />
                    Hisoblangan darslar
                  </span>
                  <span className="font-medium">
                    {fmt(d.income.billed)} so&apos;m
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64">
                Bu davrda o&apos;quvchilarga real hisoblab yozilgan darslar
                puli. Tushgan to&apos;lov va qarz aynan shu summadan kelib
                chiqadi.
              </TooltipContent>
            </Tooltip>
            {/* Tushgan tushum — real payments received */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-between text-sm cursor-help">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <ArrowUpRight className="size-3.5 text-green-500" />
                    Tushgan tushum
                  </span>
                  <span className="font-medium text-green-600">
                    {fmt(d.income.actual)} so&apos;m
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64">
                Bu davrda kassaga real tushgan to&apos;lovlar.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Oyliklar */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Ustoz oyliklari
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <Banknote className="size-3" />
                To&apos;langan
              </span>
              <span className="font-medium">
                {fmt(d.salary.paid)} so&apos;m
              </span>
            </div>
            {(d.salary.advances ?? 0) > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-xs text-muted-foreground pl-4 cursor-help">
                    <span>shundan avans</span>
                    <span>{fmt(d.salary.advances ?? 0)} so&apos;m</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-64">
                  Bu davr oyligidan ushlab qolingan (hisoblangan) avans — oylik
                  tarkibida ko&apos;rsatiladi. Berilgan, lekin hali ushlanmagan
                  avans Chiqimga kirmaydi; u ushlangan oyda oylik sifatida
                  hisoblanadi.
                </TooltipContent>
              </Tooltip>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Kutilayotgan</span>
              <span className="font-medium text-amber-600">
                {fmt(d.salary.pending)} so&apos;m
              </span>
            </div>
          </div>
        </div>

        {/* Qarzdorlik majmui — backend forecast.outstandingReceivable + debtorExposure */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
            <UserMinus className="size-3 text-red-500" />
            Qarzdorlik majmui
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Jami qarz</span>
              <span className="font-medium text-red-600">
                {fmt(d.forecast.outstandingReceivable)} so&apos;m
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Qarzdor o&apos;quvchilar</span>
              <span className="font-medium">{d.forecast.debtorExposure.count} ta</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">O&apos;rtacha qarz</span>
              <span className="font-medium">
                {fmt(d.forecast.debtorExposure.avgDebt)} so&apos;m
              </span>
            </div>
            {canSeeWriteOffSummary && writeOffSummary && (
              <div className="mt-2 border-t pt-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/payments/debt-write-offs"
                      className="flex justify-between text-sm group cursor-help"
                    >
                      <span className="text-muted-foreground flex items-center gap-1.5 group-hover:text-foreground">
                        <Eraser className="size-3 text-amber-500" />
                        Hisobdan chiqarilgan
                      </span>
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {fmt(writeOffSummary.totalAmount)} so&apos;m
                        {writeOffSummary.count > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({writeOffSummary.count} ta)
                          </span>
                        )}
                      </span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-64">
                    &quot;Yo&apos;qolgan o&apos;quvchi&quot; flow ostida joriy
                    sikldan hisobdan chiqarilgan qarzlar. Jurnalga o&apos;tish
                    uchun bosing.
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>

        {/* To'lov usullari */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            To&apos;lov usullari
          </p>
          <div className="space-y-2">
            {d.income.byMethod.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Hali to&apos;lov yo&apos;q
              </p>
            ) : (
              d.income.byMethod.map((m) => {
                const pct = d.income.actual > 0 ? Math.round((m.amount / d.income.actual) * 100) : 0;
                return (
                  <div key={m.method} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {methodLabels[m.method] ?? m.method} ({m.count})
                      </span>
                      <span className="font-medium">
                        {fmt(m.amount)} so&apos;m
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <KpiChartDialog
        open={!!chartKey}
        onOpenChange={(open) => { if (!open) setChartKey(null); }}
        kpiKey={chartKey}
      />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  tooltip,
  subtitle,
  onClick,
}: {
  icon: typeof Wallet;
  label: string;
  value: string | number;
  color: string;
  tooltip: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="rounded-xl border bg-card p-4 space-y-1.5 hover:shadow-md hover:border-primary/30 transition-all text-left w-full cursor-pointer"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon className="size-4 shrink-0" />
            <span className="text-xs font-medium truncate">{label}</span>
          </div>
          <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground leading-tight">{subtitle}</p>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
