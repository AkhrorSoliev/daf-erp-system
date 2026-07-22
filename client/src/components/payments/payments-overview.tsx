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
  salary: {
    paid: number;
    pending: number;
    advances?: number;
    /**
     * Computed monthly teacher salary for the period's month — the SAME figure
     * the downloaded Excel "Oyliklar" sheet and the /payments/salary page show
     * (accrual/HISOBLANGAN basis, not the cash-paid `paid`). `null` when the
     * calc is unavailable. `hasLessonData=false` for config-gap months (e.g. the
     * May cutover) where deserved/covered can't be computed.
     */
    computed?: {
      month: string;
      hasLessonData: boolean;
      netToPay: number;
      advances: number;
      gross: number;
    } | null;
  };
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

const UZ_MONTHS = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr",
];

/** "2026-07" → "Iyul 2026". Fallback "Shu oy" when the month is unknown. */
function monthLabel(m?: string) {
  if (!m) return "Shu oy";
  const [y, mo] = m.split("-").map(Number);
  const name = UZ_MONTHS[(mo ?? 0) - 1];
  return name ? `${name} ${y}` : "Shu oy";
}

interface PaymentsOverviewProps {
  startDate: string;
  endDate: string;
  refreshKey?: number;
}

export function PaymentsOverview({ startDate, endDate, refreshKey }: PaymentsOverviewProps) {
  const { selectedBranch } = useBranchSwitcher();
  const user = useAuth((s) => s.user);
  // Sensitive financial figures (income, expenses, profit, LTV, CAC, ROI, and
  // the forecast/salary/debt/method breakdown blocks) are CEO/BD only. Ordinary
  // admins (Administrator, Cashier) see only the two operational cards below.
  const canSeeFinancials =
    user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const canSeeWriteOffSummary = canSeeFinancials;
  // Only a CEO can view arbitrary branches while the salary card stays
  // company-wide (getMonthly scopes by caller role → CEO sees all branches, to
  // match the Excel). A Branch Director's salary card is already their own
  // branch, so no "barcha filiallar" caveat is needed for them.
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;

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
          {Array.from({ length: canSeeFinancials ? 8 : 2 }).map((_, i) => (
            <Skeleton key={i} className="h-22 rounded-xl" />
          ))}
        </div>
        {canSeeFinancials && (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        )}
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
    salary: { paid: 0, pending: 0, advances: 0, computed: null },
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
        {canSeeFinancials && (
          <>
            {/* 1. Tushumlar */}
            <KpiCard
              icon={Wallet}
              label="Tushumlar"
              value={`${fmt(d.income.actual)} so'm`}
              color="text-green-600 dark:text-green-400"
              tooltip={`${d.income.paymentCount} ta to'lov orqali`}
              onClick={() => setChartKey("income")}
            />
            {/* 2. Chiqimlar — faqat operatsion xarajatlar (oylik va avansdan tashqari) */}
            <KpiCard
              icon={Receipt}
              label="Chiqimlar"
              value={`${fmt(d.expenses)} so'm`}
              color="text-red-600 dark:text-red-400"
              tooltip="Operatsion xarajatlar (ijara, marketing, jihoz va boshqalar). Ustoz oyliklari va avanslar bu yerga kirmaydi — ular alohida 'Ustoz oyliklari' kartasida ko'rsatiladi."
              onClick={() => setChartKey("expenses")}
            />
            {/* 3. Foyda */}
            <KpiCard
              icon={TrendingUp}
              label="Foyda"
              value={`${fmt(d.netProfit)} so'm`}
              color={d.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
              tooltip="Sof foyda: tushumlardan barcha chiqimlar (operatsion xarajatlar + shu davrda to'langan oyliklar) ayirilgan."
              onClick={() => setChartKey("profit")}
            />
          </>
        )}
        {/* 4. To'lov qilganlar */}
        <KpiCard
          icon={Users}
          label="To'lov qilganlar"
          value={`${d.ltvPayerCount ?? 0} ta`}
          color="text-blue-600 dark:text-blue-400"
          tooltip="Tanlangan davrda kamida 1 marta to'lov qilgan o'quvchilar soni"
          subtitle="Davrda aktiv"
        />
        {canSeeFinancials && (
          <>
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
          </>
        )}
        {/* 8. O'rtacha to'lov */}
        <KpiCard
          icon={CreditCard}
          label="O'rtacha to'lov"
          value={`${fmt(d.avgPayment)} so'm`}
          color="text-sky-600 dark:text-sky-400"
          tooltip="Har bir to'lovning o'rtacha summasi"
          subtitle="To'lov boshiga"
          onClick={canSeeFinancials ? () => setChartKey("avgPayment") : undefined}
        />
      </div>

      {/* ===== Pastki qator: Prognoz, Oyliklar, Qarzdorlik, To'lov usullari — CEO/BD only ===== */}
      {canSeeFinancials && (
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

        {/* Ustoz oyliklari — tanlangan oy uchun HISOBLANGAN (Excel "Oyliklar"
            varag'i + /payments/salary bilan bir xil hisoblash). Avans + sof
            oylik. Ko'rsatiladigan 3 qiymat (sof oylik / avans / jami) Excelda
            hech qachon "—" bilan ketmaydi — shuning uchun ularni doim
            ko'rsatamiz; "o'tish oyi" faqat izoh sifatida qo'shiladi. */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <p className="text-sm font-medium text-muted-foreground">
                  Ustoz oyliklari
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {monthLabel(d.salary.computed?.month)} uchun hisoblangan
                  {isCeo && selectedBranch ? " · barcha filiallar" : ""}
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64">
              Bu ustozlarning shu oy uchun HISOBLANGAN oyligi — Excel
              &quot;Oyliklar&quot; varag&apos;i va Oyliklar sahifasidagi bilan
              aynan bir xil hisoblanadi. Oylik odatda keyingi oy boshida
              to&apos;lanadi, shuning uchun bu &quot;Foyda&quot;dagi to&apos;langan
              oylikdan farq qilishi mumkin.
              {isCeo && selectedBranch
                ? " Oylik barcha filiallar bo'yicha (Excel kabi), boshqa kartalar esa tanlangan filial bo'yicha."
                : ""}
            </TooltipContent>
          </Tooltip>
          {d.salary.computed ? (
            <div className="space-y-2">
              {/* a) Ustozlar olishi kerak bo'lgan summa (avans ayirilgan) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm cursor-help">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Banknote className="size-3" />
                      Sof oylik (avanssiz)
                    </span>
                    <span className="font-medium">
                      {fmt(d.salary.computed.netToPay)} so&apos;m
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-64">
                  Avans ayirilgach ustozlarga beriladigan summalar yig&apos;indisi.
                  Excel &quot;Oyliklar&quot; varag&apos;idagi &quot;Sof
                  to&apos;lanadigan&quot; ustuni bilan bir xil.
                </TooltipContent>
              </Tooltip>
              {/* b) Avanslarning jami yig'indisi */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avans</span>
                <span className="font-medium">
                  {fmt(d.salary.computed.advances)} so&apos;m
                </span>
              </div>
              {/* c) Avans + oylik jami */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm border-t pt-2 cursor-help">
                    <span className="text-muted-foreground">
                      Jami (avans + oylik)
                    </span>
                    <span className="font-semibold">
                      {fmt(d.salary.computed.gross)} so&apos;m
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-64">
                  Avans va sof to&apos;lanadigan oylik yig&apos;indisi — ustozlarga
                  shu oy uchun beriladigan jami summa.
                </TooltipContent>
              </Tooltip>
              {!d.salary.computed.hasLessonData && (
                <p className="text-xs text-amber-600 dark:text-amber-400 border-t pt-2">
                  O&apos;tish oyi — bu oy uchun dars ma&apos;lumoti cheklangan
                  (hisoblangan oylik to&apos;liq bo&apos;lmasligi mumkin).
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Hisoblangan oylik ma&apos;lumoti mavjud emas
            </p>
          )}
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
      )}

      <KpiChartDialog
        open={!!chartKey}
        onOpenChange={(open) => { if (!open) setChartKey(null); }}
        kpiKey={chartKey}
        startDate={startDate}
        endDate={endDate}
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
