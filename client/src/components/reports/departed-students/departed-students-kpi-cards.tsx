"use client";

import {
  Calendar,
  CircleDollarSign,
  Info,
  TrendingDown,
  UserMinus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface DepartedStudentsSummary {
  churnRate: number;
  departedCount: number;
  /** Students in a group at the start of the range — the churn denominator. */
  activeAtStart: number;
  /** Stopped in the range, not back yet, grace period still running. */
  pendingCount: number;
  graceDays: number;
  lostRevenue: number;
  totalDebt: number;
  debtorCount: number;
  avgDurationMonths: number;
  totalTeacherChanges: number;
  departedAfterTeacherChange: number;
}

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  tooltip: string;
  valueColor?: string;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tooltip,
  valueColor,
}: KpiCardProps) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" />
          <span>{label}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Tushuntirish"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Info className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-pre-line">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums", valueColor)}>
        {value}
      </div>
    </div>
  );
}

function formatMoney(n: number): string {
  // Guard against undefined / NaN (e.g. an older API response missing a
  // field) so the card never renders "NaN so'm".
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe.toLocaleString("uz-UZ")} so'm`;
}

function formatMonths(n: number): string {
  if (n === 0) return "0 oy";
  if (n >= 10) return `${Math.round(n)} oy`;
  return `${n.toFixed(1)} oy`;
}

/**
 * Tooltip of the «Davrda ketganlar» card. The last sentence names the
 * pending stops of the period, so it is left out when there are none.
 */
export function departedTooltip({
  graceDays,
  pendingCount,
}: Pick<DepartedStudentsSummary, "graceDays" | "pendingCount">): string {
  return (
    "Tanlangan davrda ketgan o'quvchilar, har biri bir marta.\n" +
    "Chetlatilgan kuni sanaladi. Guruhdan chiqqan yoki muzlatilgan o'quvchi " +
    `${graceDays} kun ichida qaytmasa, to'xtagan kuni sanaladi.` +
    (pendingCount > 0
      ? `\nYana ${pendingCount} nafari ${graceDays} kun ichida qaytmasa qo'shiladi.`
      : "")
  );
}

interface Props {
  data: DepartedStudentsSummary | undefined;
  isLoading: boolean;
}

export function DepartedStudentsKpiCards({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
    );
  }

  const churnTooltip =
    "Ketish koeffitsienti = Davrda ketganlar ÷ Davr boshida guruhda bo'lganlar × 100.\n" +
    `Misol: ${data.departedCount} ÷ ${data.activeAtStart} → ${data.churnRate.toFixed(1)}%.`;

  const lostRevenueTooltip =
    "Agar ketgan o'quvchilar qolishganida, yana qancha so'm keltirishardi.\n" +
    "Har bir ketgan yozuv uchun: Shartnoma summasi − Allaqachon to'langan summa. Shartnomasi yo'q yozuvlar 0 deb hisoblanadi.";

  const avgDurationTooltip =
    "Davrda ketganlar markazda o'rtacha necha oy o'qigani: birinchi guruhga qo'shilgan kundan ketgan kungacha.";

  const debtTooltip =
    "Hozir qaytmagan ketganlarning markazga qarzi (balansi manfiy bo'lganlar).\n" +
    `${data.debtorCount} ta o'quvchida qarz bor.`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        icon={UserMinus}
        label="Davrda ketganlar"
        value={data.departedCount.toLocaleString("uz-UZ")}
        tooltip={departedTooltip(data)}
      />
      <KpiCard
        icon={TrendingDown}
        label="Ketish koeffitsienti"
        value={`${data.churnRate.toFixed(1)}%`}
        tooltip={churnTooltip}
      />
      <KpiCard
        icon={CircleDollarSign}
        label="Yo'qotilgan daromad"
        value={formatMoney(data.lostRevenue)}
        valueColor={
          data.lostRevenue > 0 ? "text-red-600 dark:text-red-400" : undefined
        }
        tooltip={lostRevenueTooltip}
      />
      <KpiCard
        icon={Calendar}
        label="O'rtacha o'qish davomiyligi"
        value={formatMonths(data.avgDurationMonths)}
        tooltip={avgDurationTooltip}
      />
      <KpiCard
        icon={Wallet}
        label="Ketganlar qarzi"
        value={formatMoney(Math.abs(data.totalDebt))}
        valueColor={
          data.totalDebt < 0 ? "text-red-600 dark:text-red-400" : undefined
        }
        tooltip={debtTooltip}
      />
    </div>
  );
}
