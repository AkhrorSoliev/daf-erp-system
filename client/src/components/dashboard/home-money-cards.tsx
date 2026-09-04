"use client";

import Link from "next/link";
import { Banknote, TrendingUp, UserMinus, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import type { DashboardMoney } from "./dashboard-summary-types";

interface MoneyCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  tooltip: string;
  href: string;
  valueClassName?: string;
}

function MoneyCard({
  icon: Icon,
  label,
  value,
  hint,
  tooltip,
  href,
  valueClassName,
}: MoneyCardProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className="flex flex-col rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          <div
            className={cn(
              "mt-3 text-xl font-semibold tabular-nums sm:text-2xl",
              valueClassName,
            )}
          >
            {formatNumber(value)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function HomeMoneyCards({ money }: { money: DashboardMoney }) {
  // Kanonik sof foyda hisoblanmagan bo'lsa raqam kassa asosida keladi va
  // haqiqiy foydadan ancha yuqori chiqadi — karta buni YASHIRMAYDI, o'z
  // sarlavhasini almashtiradi.
  const profitIsCash = money.netProfitBasis === "cash";

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      <MoneyCard
        icon={Wallet}
        label="Bu oy tushum"
        value={money.monthIncome}
        hint={`${formatNumber(money.paymentCount)} ta to'lov`}
        tooltip="Shu oy kassaga tushgan pul (so'm)."
        href="/payments/overview"
      />
      <MoneyCard
        icon={TrendingUp}
        label="Oy oxiriga kutilyapti"
        value={money.expectedMonthEnd}
        hint="prognoz"
        tooltip="Oy oxirigi prognoz: o'tilgan va rejadagi darslar qiymati. Bu kassa tushumi emas — ikkovi turli o'lchov, shuning uchun ular ayirilmaydi."
        href="/payments/overview"
      />
      <MoneyCard
        icon={UserMinus}
        label="Qarzdorlik"
        value={money.debt.total}
        hint={`${formatNumber(money.debt.count)} ta qarzdor`}
        tooltip="Markazga qarzdor o'quvchilarning jami qarzi (so'm)."
        href="/payments/debt"
        valueClassName={
          money.debt.total > 0 ? "text-red-600 dark:text-red-400" : undefined
        }
      />
      <MoneyCard
        icon={Banknote}
        label={profitIsCash ? "Foyda (kassa asosida)" : "Sof foyda"}
        value={money.netProfit}
        hint={profitIsCash ? "kassa asosida" : "shu oy"}
        tooltip={
          profitIsCash
            ? "Kanonik sof foyda hisoblanmadi, bu kassa asosidagi raqam: ustoz oyligi keyingi davrda to'lanadi, shuning uchun bu son haqiqiy foydadan yuqori chiqadi."
            : "Shu oyning sof foydasi: dars tushumidan ustoz va admin oyligi, operatsion xarajat va qaytarishlar ayirilgan."
        }
        href="/payments/overview"
        valueClassName={
          money.netProfit < 0
            ? "text-red-600 dark:text-red-400"
            : "text-emerald-600 dark:text-emerald-400"
        }
      />
    </div>
  );
}
