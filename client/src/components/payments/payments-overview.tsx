"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
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
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { KpiKey } from "./kpi-chart-dialog";
import { monthLabel, monthShort } from "./salary-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

/** «Hisoblandi / To'landi / Qoldi» — server `MonthCharges` (ADR-0058). */
export interface MonthCharges {
  month: string;
  charged: number;
  paid: number;
  unpaid: number;
  paidPct: number | null;
  students: number;
}

/**
 * «O'qiyotganlar qarzi» and «O'qimayotganlar qarzi» — server `DebtSplit`
 * (ADR-0059). Two numbers that are never added: the first is the debt of
 * students in an active group (`currentMonth` — the part of it up to this
 * month's bill, `older` — the rest), the second is everyone else's.
 */
export interface DebtSplit {
  studying: {
    total: number;
    count: number;
    currentMonth: number;
    older: number;
  };
  notStudying: { total: number; count: number };
}

interface FinancialOverview {
  income: {
    actual: number;
    paymentCount: number;
    byMethod: { method: string; amount: number; count: number }[];
  };
  /** Month-end expectation (shown for months before the monthly-payment switch). */
  forecast: {
    /** Lessons held-and-paid + the remaining scheduled ones, by lesson value. */
    expectedMonthEnd: number;
    expectedHeld: number;
    expectedRemaining: number;
  };
  /**
   * The month's own bill, paid and unpaid (ADR-0058). `null` for months before
   * the monthly-payment switch, which keep the «Oy oxiriga kutilyapti» card.
   * Never sent to Administrator/Cashier.
   */
  monthCharges: MonthCharges | null;
  /**
   * What the centre is owed TODAY — the period does not change it. Never sent to
   * Administrator/Cashier. Optional: the client goes live before the server,
   * and a server older than ADR-0059 sends none — the block then draws «—».
   */
  debtSplit?: DebtSplit;
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
  // 'cash' = the canonical figure could not be computed and this is the
  // legacy kassa number instead. The card must say so rather than label it
  // «Foyda» — the two answer different questions and the cash one runs high,
  // because teacher salary is paid the following cycle.
  netProfitBasis?: "recognized" | "cash";
  ownMonthProfit?: number | null;
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

/**
 * Both dialogs draw with `recharts`, which is by far the heaviest dependency
 * this page pulls in — and this is the page the finance team opens every
 * morning. Statically imported, every one of those visits downloaded the
 * charting library whether or not anyone opened a chart.
 *
 * `ssr: false` because a chart has nothing to render on the server, and the
 * `opened` refs below are what actually save the bytes: `next/dynamic` fetches
 * the chunk as soon as the component is RENDERED, and a controlled dialog is
 * rendered from the start with `open={false}`. Mounting it only after the
 * first open moves the download to the moment it is needed.
 *
 * They stay mounted afterwards, so the close animation still runs — it is the
 * FIRST open that is being deferred, not every one.
 */
const KpiChartDialog = dynamic(
  () => import("./kpi-chart-dialog").then((m) => m.KpiChartDialog),
  { ssr: false },
);
const ExpectationHistoryDialog = dynamic(
  () => import("./expectation-history-dialog").then((m) => m.ExpectationHistoryDialog),
  { ssr: false },
);

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

  const [chartKey, selectChartKey] = useState<KpiKey | null>(null);
  const [historyOpen, showHistory] = useState(false);

  // Latched at the first open and never lowered, so a dialog is mounted from
  // then on: closing it must not tear the component down, or the exit
  // animation is skipped and the next open refetches from scratch.
  //
  // Wrapping the setters rather than editing seven `onClick`s keeps the latch
  // impossible to forget — a new KPI card cannot open the chart without it.
  const [chartMounted, setChartMounted] = useState(false);
  const [historyMounted, setHistoryMounted] = useState(false);

  const setChartKey = (key: KpiKey | null) => {
    if (key) setChartMounted(true);
    selectChartKey(key);
  };
  const setHistoryOpen = (open: boolean) => {
    if (open) setHistoryMounted(true);
    showHistory(open);
  };

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
    income: { actual: 0, paymentCount: 0, byMethod: [] },
    forecast: {
      expectedMonthEnd: 0,
      expectedHeld: 0,
      expectedRemaining: 0,
    },
    monthCharges: null,
    salary: { paid: 0, pending: 0, advances: 0, computed: null },
    expenses: 0,
    netProfit: 0,
    netProfitBasis: "recognized" as const,
    ownMonthProfit: null,
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
    forecast: { ...empty.forecast, ...data?.forecast },
    salary: { ...empty.salary, ...data?.salary },
  };
  // No zero default for the debt: with no split (an older server, or a failed
  // request) the block draws «—», as the home card and the debt page do. A
  // zero would read as «nobody owes».
  const debtSplit =
    data?.debtSplit?.studying && data.debtSplit.notStudying
      ? data.debtSplit
      : null;

  // «Ustoz oyliklari» sarlavhasidagi oy — serverning oyi, umumiy `monthLabel`
  // yozilishida («Oktabr 2026»), «Moliya» kartasidagi `monthShort` bilan bir
  // xil jadvaldan. Server oy aytmasa — «Shu oy».
  const salaryMonthLabel = d.salary.computed?.month
    ? monthLabel(d.salary.computed.month)
    : "Shu oy";

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
              tooltip="Ijara, marketing, jihoz va shunga o'xshash xarajatlar. Ustoz oyliklari va avanslar bu yerga kirmaydi — ular alohida 'Ustoz oyliklari' kartasida."
              onClick={() => setChartKey("expenses")}
            />
            {/* 3. Foyda — yoki hisoblab bo'lmasa, halol nomlangan kassa raqami */}
            <KpiCard
              icon={TrendingUp}
              label={
                d.netProfitBasis === "cash" ? "Kassa harakati" : "Foyda"
              }
              value={`${fmt(d.netProfit)} so'm`}
              color={d.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
              subtitle={
                d.netProfitBasis === "cash"
                  ? "Sof foyda hisoblanmadi — bu kassa raqami"
                  : d.ownMonthProfit == null
                    ? undefined
                    : `Oyning o'z foydasi: ${fmt(d.ownMonthProfit)} so'm`
              }
              tooltip={
                d.netProfitBasis === "cash"
                  ? "Sof foydani hisoblab bo'lmadi, shuning uchun bu yerda kassa harakati ko'rsatilyapti: tushum minus NAQD to'langan oylik. Bu foyda EMAS va odatda undan yuqori chiqadi — ustoz oyligi keyingi tsiklda to'lanadi, ya'ni bu oyning raqamida deyarli aks etmaydi. Sahifani qayta yuklang; takrorlansa, texnik yordamga ayting."
                  : "Shu oy o'tilgan darslarning pulidan ustoz oyligi, xarajatlar va qaytarilgan pullar ayirilgan — qolgani markazga foyda. «Oyning o'z foydasi» esa boshqa savolga javob beradi: shu oyning O'Z puli shu oyning xarajatini qopladimi. Manfiy bo'lsa — oy eski qarz undirish yoki oldingi oylar puli hisobiga yopilgan."
              }
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
          tooltip="Shu davrda kamida bir marta pul to'lagan o'quvchilar soni."
          subtitle="Davrda aktiv"
        />
        {canSeeFinancials && (
          <>
            {/* 5. LTV */}
            <KpiCard
              icon={Users}
              label="O'quvchi qiymati"
              value={`${fmt(d.ltv)} so'm`}
              color="text-violet-600 dark:text-violet-400"
              tooltip="Bitta o'quvchi shu davrda o'rtacha qancha pul olib kelgan. Yuqori bo'lsa — yaxshi."
              subtitle="Bitta o'quvchidan o'rtacha"
              onClick={() => setChartKey("ltv")}
            />
            {/* 6. CAC */}
            <KpiCard
              icon={UserPlus}
              label="Jalb qilish narxi"
              value={`${fmt(d.cac)} so'm`}
              color="text-amber-600 dark:text-amber-400"
              tooltip={`Bitta yangi o'quvchi olib kelish qancha turgani. Marketingga ${fmt(d.marketingExpenses)} so'm sarflandi, ${d.newStudentCount} ta yangi o'quvchi keldi.`}
              subtitle="Bitta yangi o'quvchiga"
              onClick={() => setChartKey("cac")}
            />
            {/* 7. Marketing ROI */}
            <KpiCard
              icon={Megaphone}
              label="Marketing samarasi"
              value={`${d.marketingRoi}%`}
              color={d.marketingRoi > 100 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}
              tooltip="Marketingga sarflangan pul qancha qaytganini ko'rsatadi. 100% dan yuqori bo'lsa — foyda keltiryapti."
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
          tooltip="Bitta to'lov o'rtacha qancha bo'lgani."
          subtitle="To'lov boshiga"
          onClick={canSeeFinancials ? () => setChartKey("avgPayment") : undefined}
        />
      </div>

      {/* ===== Pastki qator: Prognoz, Oyliklar, Qarzdorlik, To'lov usullari — CEO/BD only ===== */}
      {canSeeFinancials && (
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {/* Oyning asosiy raqami. Oylik to'lov oylarida (2026-09 dan): hisoblandi /
            to'landi / qoldi — ADR-0058. Undan oldingi oylar: eski «Oy oxiriga
            kutilyapti» (bosilsa kunlik siljish). Raqamlarning hammasi serverdan.
            Karta BIR oyni ko'rsatadi (bir necha oylik davrda — uning boshlang'ich
            oyini), shuning uchun oy sarlavhada nomlanadi: serverning `month`i,
            brauzer soati emas. */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {d.monthCharges
              ? `${monthShort(d.monthCharges.month)} to'lovlari`
              : "Tushum ko'rsatkichlari"}
          </p>
          {d.monthCharges ? (
            <div className="space-y-2.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm cursor-help">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Receipt className="size-3.5 text-blue-500" />
                      Hisoblandi
                    </span>
                    <span className="font-medium">
                      {fmt(d.monthCharges.charged)} so&apos;m
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72">
                  Shu oy uchun o&apos;quvchilarga yozilgan oylik hisoblar
                  yig&apos;indisi — chegirmalar bilan, ketgan va bekor qilingan
                  darslar uchun qaytarilgani ayirilgan.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm cursor-help">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <ArrowUpRight className="size-3.5 text-green-500" />
                      To&apos;landi
                    </span>
                    <span className="font-medium text-green-600">
                      {fmt(d.monthCharges.paid)} so&apos;m
                      {d.monthCharges.paidPct !== null &&
                        ` (${d.monthCharges.paidPct}%)`}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72">
                  Shu oy hisoblaridan to&apos;langan qismi (qarz kechirilgani
                  ham shu yerda). To&apos;lov avval eng eski qarzni yopadi:
                  eski qarzi bor o&apos;quvchining to&apos;lovi avval o&apos;sha
                  qarzga ketadi.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm cursor-help">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <ArrowDownRight className="size-3.5 text-red-500" />
                      Qoldi
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        d.monthCharges.unpaid > 0 && "text-red-600",
                      )}
                    >
                      {fmt(d.monthCharges.unpaid)} so&apos;m
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72">
                  Shu oy hisoblaridan hali to&apos;lanmagan qismi.
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Oy oxiriga kutilyapti — lesson value, calendar-based */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="flex w-full cursor-pointer items-center justify-between rounded-md px-1 -mx-1 py-0.5 text-left text-sm transition-colors hover:bg-muted/60"
                  >
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <ArrowDownRight className="size-3.5 text-amber-500" />
                      Oy oxiriga kutilyapti
                    </span>
                    <span className="font-medium">
                      {fmt(d.forecast.expectedMonthEnd)} so&apos;m
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72">
                  Oy oxirigacha hamma dars jadval bo&apos;yicha o&apos;tsa,
                  o&apos;quvchilar jami shuncha darsga pul to&apos;lashi kerak.
                  <br />
                  <br />
                  Shundan {fmt(d.forecast.expectedHeld)} — allaqachon
                  o&apos;tilgan darslar, {fmt(d.forecast.expectedRemaining)} —
                  oy oxirigacha qolgani. Bayramlar, bekor qilingan darslar va
                  har guruhning dars kunlari hisobga olingan.
                  <br />
                  <br />
                  Bu pul qachon kelishini aytmaydi — faqat qancha
                  bo&apos;lishini. Kunma-kun qanday o&apos;zgarganini ko&apos;rish
                  uchun bosing.
                </TooltipContent>
              </Tooltip>
            </div>
          )}
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
                  {salaryMonthLabel} uchun hisoblangan
                  {isCeo && selectedBranch ? " · barcha filiallar" : ""}
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64">
              Ustozlar shu oyda ishlab topgan pul. Hali qo&apos;llariga
              berilmagan bo&apos;lishi mumkin — naqd oylik odatda keyingi oy
              boshida chiqadi.
              <br />
              <br />
              Bu raqam Oyliklar sahifasi, Excel va Foyda kartasidagi bilan bir
              xil.
              {isCeo && selectedBranch
                ? " Faqat bitta farq: oylik barcha filiallar bo'yicha, qolgan kartalar esa siz tanlagan filial bo'yicha."
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
                  Ustozlarning qo&apos;liga tegadigan qismi. Agar avans
                  allaqachon berilgan bo&apos;lsa, u shu summadan ayirilgan.
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
                  Avans + qolgan oylik. Ya&apos;ni ustozlarga shu oy uchun
                  beriladigan jami pul.
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

        {/* Qarzdorlik — bugungi qarz IKKI alohida raqamda (ADR-0059), ikkalasi
            backend `debtSplit`dan. Ular hech qayerda qo'shilmaydi: shuning uchun
            «Jami qarz» va «O'rtacha qarz» qatorlari yo'q. Javobda bo'linma
            bo'lmasa (eski server yoki xato) ikkala qator «—», 🟡 qatori yo'q. */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          {/* Bu blok tanlangan davrga bog'liq EMAS — u bugungi holat. Yonidagi
              kartalar davr bo'yicha bo'lgani uchun buni aytib qo'yish shart,
              aks holda "davr qarzi" deb o'qiladi. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <UserMinus className="size-3 text-red-500" />
                  Qarzdorlik
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Bugungi holat
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64">
              O&apos;quvchilarning bugungi kundagi qarzi — hamma oylar
              bo&apos;yicha to&apos;planib qolgani, ikki alohida raqamda.
              <br />
              <br />
              Boshqa kartalardan farqi: bu yuqorida tanlangan davrga
              bog&apos;liq emas, doim bugungi holatni ko&apos;rsatadi.
            </TooltipContent>
          </Tooltip>
          <div className="space-y-2">
            {/* O'qiyotganlar qarzi — ostida: qarzning shu oy hisobigacha bo'lgan
                qismi va qolgani (eski qarz). */}
            <div className="space-y-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm cursor-help">
                    <span className="text-muted-foreground">
                      O&apos;qiyotganlar qarzi
                    </span>
                    <span
                      className={cn(
                        "ml-auto font-medium",
                        debtSplit &&
                          debtSplit.studying.total > 0 &&
                          "text-red-600",
                      )}
                    >
                      <DebtAmount debt={debtSplit?.studying ?? null} />
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-64">
                  Faol guruhda o&apos;qiyotgan o&apos;quvchilarning qarzi. Shu
                  oy — qarzning shu oy hisobigacha bo&apos;lgan qismi, eski
                  qarz — qolgani.
                </TooltipContent>
              </Tooltip>
              {debtSplit && (
                <p className="text-right text-[10px] leading-tight text-muted-foreground">
                  {`🟡 shu oy ${formatPrice(debtSplit.studying.currentMonth)} · 🔴 eski qarz ${formatPrice(debtSplit.studying.older)}`}
                </p>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm cursor-help">
                  <span className="text-muted-foreground">
                    O&apos;qimayotganlar qarzi
                  </span>
                  <span className="ml-auto font-medium">
                    <DebtAmount debt={debtSplit?.notStudying ?? null} />
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64">
                Guruhsiz, muzlatilgan va ketgan o&apos;quvchilarning qarzi.
                O&apos;qiyotganlar qarziga qo&apos;shilmaydi.
              </TooltipContent>
            </Tooltip>
            {canSeeWriteOffSummary && writeOffSummary && (
              <div className="mt-2 border-t pt-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/payments/debt?tab=kechirilgan"
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
                    O&apos;quvchi butunlay ketib qolgani uchun undirib
                    bo&apos;lmaydi deb kechirilgan qarzlar. Ro&apos;yxatni
                    ko&apos;rish uchun bosing.
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

      {chartMounted && (
      <KpiChartDialog
        open={!!chartKey}
        onOpenChange={(open) => { if (!open) setChartKey(null); }}
        kpiKey={chartKey}
        startDate={startDate}
        endDate={endDate}
        expectedMonthEnd={d.forecast.expectedMonthEnd}
        monthCharges={d.monthCharges}
        onSelectKpi={setChartKey}
      />
      )}

      {/* Kunlik surat tarixi — «Oy oxiriga kutilyapti» qatorini bosganda.
          Oy sahifadagi davrning BOSHLANG'ICH oyidan olinadi, kartalar bilan
          bir xil qoida. */}
      {historyMounted && (
      <ExpectationHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        month={(startDate ?? new Date().toISOString().slice(0, 10)).slice(0, 7)}
      />
      )}
    </div>
  );
}

/** «X so'm (N ta)» for one of the two debts, or «—» when the server sent no split. */
function DebtAmount({
  debt,
}: {
  debt: { total: number; count: number } | null;
}) {
  if (!debt) return "—";
  return (
    <>
      {formatPrice(debt.total)} so&apos;m
      <span className="ml-1 text-xs font-normal text-muted-foreground">
        ({formatNumber(debt.count)} ta)
      </span>
    </>
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
