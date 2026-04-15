"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CreditCard,
  DollarSign,
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
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

interface FinancialOverview {
  income: {
    expected: number;
    actual: number;
    paymentCount: number;
    byMethod: { method: string; amount: number; count: number }[];
  };
  salary: { paid: number; pending: number };
  expenses: number;
  netProfit: number;
  debtorCount: number;
  activeBalance: number;
  activeStudentCount: number;
  ltv: number;
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
  return n.toLocaleString("en-US");
}

interface PaymentsOverviewProps {
  startDate: string;
  endDate: string;
}

export function PaymentsOverview({ startDate, endDate }: PaymentsOverviewProps) {
  const { selectedBranch } = useBranchSwitcher();

  const { data, isLoading } = useQuery({
    queryKey: ["financial-overview", selectedBranch?.id, startDate, endDate],
    queryFn: () =>
      api
        .get<FinancialOverview>("/reports/financial-overview", {
          params: { branchId: selectedBranch?.id, startDate, endDate },
        })
        .then((r) => r.data),
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
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const empty: FinancialOverview = {
    income: { expected: 0, actual: 0, paymentCount: 0, byMethod: [] },
    salary: { paid: 0, pending: 0 },
    expenses: 0,
    netProfit: 0,
    debtorCount: 0,
    activeBalance: 0,
    activeStudentCount: 0,
    ltv: 0,
    cac: 0,
    marketingRoi: 0,
    avgPayment: 0,
    newStudentCount: 0,
    marketingExpenses: 0,
  };

  const d = data ?? empty;

  const incomePercent =
    d.income.expected > 0
      ? Math.round((d.income.actual / d.income.expected) * 100)
      : 0;

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
        {/* 4. Aktiv balans */}
        <KpiCard
          icon={DollarSign}
          label="Aktiv balans"
          value={`${fmt(d.activeBalance)} so'm`}
          color={d.activeBalance >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}
          tooltip={`${d.activeStudentCount} ta faol o'quvchining umumiy balansi`}
          onClick={() => setChartKey("activeBalance")}
        />
        {/* 5. LTV */}
        <KpiCard
          icon={Users}
          label="LTV"
          value={`${fmt(d.ltv)} so'm`}
          color="text-violet-600 dark:text-violet-400"
          tooltip="O'quvchi qiymati — bir o'quvchidan olinadigan umumiy daromad"
          subtitle="O'quvchi qiymati"
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

      {/* ===== Pastki qator: Kutilayotgan vs Haqiqiy, Oyliklar, To'lov usullari ===== */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
        {/* Kutilayotgan vs Haqiqiy */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Kutilayotgan vs Haqiqiy tushum
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <ArrowDownRight className="size-3 text-amber-500" />
                Kutilayotgan
              </span>
              <span className="font-medium">
                {fmt(d.income.expected)} so&apos;m
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <ArrowUpRight className="size-3 text-green-500" />
                Haqiqiy
              </span>
              <span className="font-medium text-green-600">
                {fmt(d.income.actual)} so&apos;m
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.min(incomePercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {incomePercent}% yig&apos;ildi
            </p>
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
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Kutilayotgan</span>
              <span className="font-medium text-amber-600">
                {fmt(d.salary.pending)} so&apos;m
              </span>
            </div>
          </div>
          <div className="pt-1 flex items-center gap-2 text-sm">
            <UserMinus className="size-3 text-red-500" />
            <span className="text-muted-foreground">Qarzdorlar:</span>
            <span className="font-medium text-red-600">{d.debtorCount} ta</span>
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
