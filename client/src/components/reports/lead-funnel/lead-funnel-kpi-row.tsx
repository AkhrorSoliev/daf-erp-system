"use client";

import {
  ChevronRight,
  Info,
  Percent,
  UserPlus,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { formatNumber } from "@/lib/format-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { conversionPct, displayDate, wholePercent } from "./lead-funnel-math";
import type { LeadFunnelResponse } from "./lead-funnel-types";

interface CardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tooltip: string;
  valueClass?: string;
}

function KpiCard({ icon: Icon, label, value, sub, tooltip, valueClass }: CardProps) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
          <span>{label}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Tushuntirish"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-pre-line">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums", valueClass)}>
        {value}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>
    </div>
  );
}

function previousSub(
  previous: LeadFunnelResponse["previous"],
  pick: (stages: Record<string, number>) => string,
): string {
  if (!previous) return "oldingi davr yo'q";
  return `oldingi davr ${pick(previous.stages)}`;
}

interface Props {
  data: LeadFunnelResponse;
  onOpenUnpaidActive: () => void;
}

/**
 * Dushanba ertalabki savolga 3 soniyada javob: qancha keldi, qanchasi to'ladi,
 * bu oldingi davrga nisbatan qanday. Taqqoslash faqat shu yerda — voronka
 * qatorlarida uchta raqam bo'lib ketmasin.
 */
export function LeadFunnelKpiRow({ data, onOpenUnpaidActive }: Props) {
  const conversion = conversionPct(data.stages.lead, data.stages.paid);
  const previousRange = data.previous
    ? `${displayDate(data.previous.period.startDate)} – ${displayDate(data.previous.period.endDate)}`
    : null;
  const comparisonNote = previousRange
    ? `Oldingi davr: ${previousRange} (tanlangan davr uzunligida, undan oldin).`
    : "Oldingi davr voronka boshlanishidan (10.09.2026) oldinga to'g'ri keladi, shuning uchun taqqoslash yo'q.";

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={Percent}
        label="Liddan to'lovgacha"
        value={wholePercent(conversion)}
        sub={previousSub(data.previous, (s) => wholePercent(conversionPct(s.lead, s.paid)))}
        tooltip={`Davrda kelgan lidlarning necha foizi to'lov qilgani. ${comparisonNote}`}
      />
      <KpiCard
        icon={UserPlus}
        label="Yangi lidlar"
        value={formatNumber(data.stages.lead)}
        sub={previousSub(data.previous, (s) => formatNumber(s.lead))}
        tooltip={`Davrda kelgan odamlar: doskadan ${formatNumber(data.leadSplit.board)}, to'g'ridan ${formatNumber(data.leadSplit.direct)}. Bir odamning bir nechta lidi bitta hisoblanadi. ${comparisonNote}`}
      />
      <KpiCard
        icon={Wallet}
        label="To'lov qildi"
        value={formatNumber(data.stages.paid)}
        sub={previousSub(data.previous, (s) => formatNumber(s.paid))}
        tooltip={`Davrda kelib, keyin (davrdan keyin bo'lsa ham) to'lov qilganlar. ${comparisonNote}`}
      />
      <button
        type="button"
        onClick={onOpenUnpaidActive}
        className="group space-y-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <WalletCards className="size-4" aria-hidden="true" />
            To&apos;lamagan faol
          </span>
          <ChevronRight
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
        <span className="block text-2xl font-semibold text-orange-600 tabular-nums dark:text-orange-400">
          {formatNumber(data.unpaid.active)}
        </span>
        <span className="block text-xs text-muted-foreground">
          darsga kelgan, hali to&apos;lamagan, faol · ro&apos;yxat
        </span>
      </button>
    </div>
  );
}
