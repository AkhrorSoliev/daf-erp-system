"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  Info,
  PieChart,
  Wallet,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format-utils";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { ProfitCompositionRows } from "./profit-composition-rows";
import {
  headline,
  mln,
  recurringLabel,
  reconciliation,
  statusLabel,
  type ProfitComposition,
} from "./profit-composition-text";

interface IncomeSplit {
  total: number;
  lateTotal: number;
  late: { monthKey: string; label: string; amount: number }[];
}

interface Props {
  /** yyyy-MM-dd — the period the Foyda card shows; its START month is explained. */
  startDate: string;
  endDate: string;
  /** Opens the «Tushumlar» drill-down, where the late payments are listed. */
  onShowIncome?: () => void;
}

/**
 * «Foyda tarkibi» — shown under the profit chart when the Foyda card is
 * clicked. What the card's figure is made of, and what the month is on course
 * to close at. Every number comes from `GET /reports/profit-composition`,
 * which is built from the same call as the card, so the lines add up to it.
 */
export function ProfitCompositionPanel({
  startDate,
  endDate,
  onShowIncome,
}: Props) {
  const { selectedBranch } = useBranchSwitcher();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["profit-composition", selectedBranch?.id, startDate],
    queryFn: () =>
      api
        .get<ProfitComposition>("/reports/profit-composition", {
          params: { branchId: selectedBranch?.id, startDate },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  // Same request and key as the «Tushum tarkibi» panel, so opening one after
  // the other reads from cache instead of asking twice.
  const { data: income } = useQuery({
    queryKey: [
      "income-month-attribution",
      selectedBranch?.id,
      startDate,
      endDate,
    ],
    queryFn: () =>
      api
        .get<IncomeSplit>("/reports/income-month-attribution", {
          params: { branchId: selectedBranch?.id, startDate, endDate },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <PieChart className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">Foyda tarkibi</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Foyda qanday hisoblanadi"
                  className="inline-flex cursor-help text-muted-foreground"
                >
                  <Info className="size-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72">
                Sof foyda = shu oy o&apos;tilgan darslar puli + balansdan
                yechib olingan pul − ustozlar haqi − xodimlar oyligi −
                xarajatlar − qaytarilgan pul.
                <br />
                <br />
                Kassaga tushgan pul emas, o&apos;tilgan dars hisoblanadi: dars
                o&apos;tilgan bo&apos;lsa, pul hali kelmagan bo&apos;lsa ham shu
                oyga yoziladi.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground">
            Sof foyda qayerdan chiqdi va oy oxiriga qancha kutilyapti
          </p>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5">
              <Building2 className="size-3" aria-hidden="true" />
              {selectedBranch?.name ?? "Barcha filiallar"}
            </span>
            <span className="rounded-md bg-sky-100 px-2 py-0.5 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
              {statusLabel(data)}
            </span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : isError ? (
        <div className="space-y-2 py-4 text-center">
          <p className="text-sm text-muted-foreground">
            Foyda tarkibini yuklab bo&apos;lmadi
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Qayta urinish
          </button>
        </div>
      ) : !data ? null : (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {data.status.isOpen ? "Sof foyda, hozircha" : "Sof foyda"}
            </p>
            <p
              className={`text-2xl font-bold leading-tight tabular-nums ${data.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            >
              {formatPrice(data.netProfit)} so&apos;m
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {headline(
                data.revenue.total,
                data.netProfit,
                data.withdrawals.total,
              )}
            </p>
          </div>

          <ProfitCompositionRows data={data} />

          {data.forecast && <ForecastCard forecast={data.forecast} />}

          <Warnings data={data} />

          {income && income.total > 0 && (
            <div className="rounded-lg bg-muted/60 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <Wallet
                    className="size-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  Kassaga tushgan pul — boshqa raqam
                </span>
                <span className="font-semibold tabular-nums">
                  {formatPrice(income.total)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Foyda kassaga emas, o&apos;tilgan darsga qarab hisoblanadi.
                {income.lateTotal > 0 && (
                  <>
                    {" "}
                    {formatPrice(income.lateTotal)} so&apos;m eski oylar uchun
                    kelgan
                    {income.late[0] &&
                      ` (${income.late[0].label} — ${formatPrice(income.late[0].amount)})`}{" "}
                    — u o&apos;sha oylar foydasida hisoblangan.
                  </>
                )}
              </p>
              {onShowIncome && (
                <button
                  type="button"
                  onClick={onShowIncome}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Tushum tarkibi
                  <ArrowRight className="size-3" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          <p className="border-t pt-2 text-[11px] text-muted-foreground tabular-nums">
            {reconciliation(data)}
          </p>
        </div>
      )}
    </div>
  );
}

function ForecastCard({
  forecast,
}: {
  forecast: NonNullable<ProfitComposition["forecast"]>;
}) {
  return (
    <div className="rounded-lg border border-sky-300 bg-card p-3 dark:border-sky-800">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarClock
            className="size-3.5 text-sky-600 dark:text-sky-400"
            aria-hidden="true"
          />
          Oy oxiriga kutilyapti
        </span>
        <span
          className={`text-base font-bold tabular-nums ${forecast.expectedNetProfit >= 0 ? "text-sky-700 dark:text-sky-300" : "text-red-600 dark:text-red-400"}`}
        >
          ≈ {formatPrice(forecast.expectedNetProfit)}
        </span>
      </div>
      <div className="mt-2 space-y-0.5 text-xs">
        <ForecastLine
          label={`Qolgan darslar · ${forecast.remainingLessons.count} dars`}
          amount={forecast.remainingLessons.value}
        />
        <ForecastLine
          label="Shu darslar uchun ustoz haqi"
          amount={-forecast.remainingTeacherPay}
          approx
        />
        {forecast.missingExpenses.map((e) => (
          <ForecastLine
            key={e.key}
            label={`${recurringLabel(e.key)} · o'tgan oy ${e.lastMonthDay}-kuni yozilgan`}
            amount={-e.amount}
            approx
          />
        ))}
      </div>
      {forecast.missingExpenses.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Bu xarajatlar o&apos;tgan oyda bor edi, bu oy hali yozilmagan —
          o&apos;tgan oydagi summa olindi.
        </p>
      )}
    </div>
  );
}

function ForecastLine({
  label,
  amount,
  approx,
}: {
  label: string;
  amount: number;
  approx?: boolean;
}) {
  const sign = amount >= 0 ? "+" : "−";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums">
        {approx ? "≈ " : ""}
        {sign}
        {formatPrice(Math.abs(amount))}
      </span>
    </div>
  );
}

/** Things that make the figure look better than the money is. */
function Warnings({ data }: { data: ProfitComposition }) {
  const { unpaidLeft, branchesWithoutExpenses } = data;
  if (!unpaidLeft && branchesWithoutExpenses.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200">
      {unpaidLeft && (
        <div>
          <div className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Qarz bilan ketgan o&apos;quvchilar
            </span>
            <span className="tabular-nums">
              {formatPrice(unpaidLeft.amount)}
            </span>
          </div>
          <p className="mt-0.5 text-xs">
            {unpaidLeft.students} o&apos;quvchi endi o&apos;qimayapti (guruhdan
            chiqqan yoki muzlatilgan), shu oydagi {unpaidLeft.lessons} darsining
            puli kelmagan. Undirilmasa, foyda {mln(unpaidLeft.amount)} kam
            bo&apos;ladi.
          </p>
        </div>
      )}
      {branchesWithoutExpenses.map((b) => (
        <div
          key={b.id}
          className={
            unpaidLeft
              ? "border-t border-yellow-300 pt-2 dark:border-yellow-800"
              : ""
          }
        >
          <div className="flex items-center justify-between gap-2 text-sm font-medium">
            <span className="flex items-center gap-1.5">
              <Building2 className="size-3.5" aria-hidden="true" />
              {b.name} — xarajat yozilmagan
            </span>
            <span className="tabular-nums">0</span>
          </div>
          <p className="mt-0.5 text-xs">
            Ijara, admin, svet yo&apos;q — bu filial foydasi haqiqatdan katta
            ko&apos;rinishi mumkin.
          </p>
        </div>
      ))}
    </div>
  );
}
