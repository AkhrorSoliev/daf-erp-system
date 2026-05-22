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
  totalStudents: number;
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

function KpiCard({ icon: Icon, label, value, tooltip, valueColor }: KpiCardProps) {
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
    "Ketgan o'quvchilar ulushi = Ketganlar ÷ Barcha o'quvchilar × 100.\n" +
    `Misol: ${data.departedCount} ketgan ÷ ${data.totalStudents} jami → ${data.churnRate.toFixed(1)}%.\n` +
    "Barcha o'quvchilar = ketganlar + hozir guruhda o'qiyotganlar.";

  const departedTooltip =
    "Hozir hech qaysi faol guruhda o'qimayotgan o'quvchilar soni — " +
    "chetlashtirilgan, muzlatilgan va guruhsiz qolgan faol o'quvchilar. " +
    "Bitirgan o'quvchilar hisobga olinmaydi.";

  const lostRevenueTooltip =
    "Agar ketgan o'quvchilar qolishganida, yana qancha so'm keltirishardi.\n" +
    "Har bir ketgan yozuv uchun: Shartnoma summasi − Allaqachon to'langan summa. Shartnomasi yo'q yozuvlar 0 deb hisoblanadi.";

  const avgDurationTooltip =
    "Ketgan o'quvchilar markazda o'rtacha necha oy o'qiganini ko'rsatadi. " +
    "Har bir yozuv uchun: Chiqarilgan sana − Qo'shilgan sana (oylarda). Keyin o'rtacha olinadi.";

  const debtTooltip =
    "Ketgan o'quvchilarning markazga qarzi (balansi manfiy bo'lganlar).\n" +
    `${data.debtorCount} ta ketgan o'quvchida qarz bor.`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        icon={UserMinus}
        label="Ketganlar soni"
        value={data.departedCount.toLocaleString("uz-UZ")}
        tooltip={departedTooltip}
      />
      <KpiCard
        icon={TrendingDown}
        label="Ketish koeffitsienti"
        value={`${data.churnRate.toFixed(1)}%`}
        valueColor={
          data.churnRate >= 10
            ? "text-red-600 dark:text-red-400"
            : data.churnRate >= 5
              ? "text-amber-600 dark:text-amber-400"
              : undefined
        }
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
