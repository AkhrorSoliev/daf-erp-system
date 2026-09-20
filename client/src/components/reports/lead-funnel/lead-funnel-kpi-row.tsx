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
import {
  conversionPct,
  displayDate,
  FUNNEL_START_DATE,
  periodDayCount,
  wholePercent,
} from "./lead-funnel-math";
import type { LeadFunnelResponse } from "./lead-funnel-types";

interface CardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tooltip: string;
}

function KpiCard({ icon: Icon, label, value, sub, tooltip }: CardProps) {
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
              <Info className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-pre-line">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="text-2xl font-semibold tabular-nums">
        {value}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>
    </div>
  );
}

const UNPAID_ACTIVE_TOOLTIP = `Darsga kelgan, hali to'lov qilmagan va hozir faol bo'lgan o'quvchilar. Davr filtriga bog'liq emas: ${displayDate(FUNNEL_START_DATE)} dan bugungacha, o'quvchining hozirgi holati bo'yicha hisoblanadi.`;

/**
 * To'rtinchi karta qolgan uchtadan ikki jihati bilan farq qiladi: son davrga
 * bog'liq emas (voronka boshlanishidan bugungacha) va butun karta bosiladigan
 * — ro'yxatni ochadi. Shu sabab u alohida komponent: tushuntirish
 * tugmasini (Tooltip) shu bosiladigan tugma ICHIGA joylash tugma ichida
 * tugma degani bo'lardi (buzuq HTML), shuning uchun karta tanasi — sarlavha
 * qatoridan pastdagi son+izoh+chevron — o'zi alohida `<button>`, tushuntirish
 * belgisi esa sarlavha qatorida, undan tashqarida, opa-singil element sifatida.
 */
function UnpaidActiveCard({
  value,
  onOpen,
}: {
  value: number;
  onOpen: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <WalletCards className="size-4" aria-hidden="true" />
          <span>To&apos;lamagan faol</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Tushuntirish"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Info className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-pre-line">
            {UNPAID_ACTIVE_TOOLTIP}
          </TooltipContent>
        </Tooltip>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center justify-between gap-2 rounded-lg text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="space-y-2">
          <span className="block text-2xl font-semibold text-orange-600 tabular-nums dark:text-orange-400">
            {formatNumber(value)}
          </span>
          <span className="block text-xs text-muted-foreground">
            darsga kelgan, hali to&apos;lamagan, faol · ro&apos;yxat
          </span>
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

function previousSub(
  previous: LeadFunnelResponse["previous"],
  pick: (stages: Record<string, number>) => string,
  dayCount?: number,
): string {
  if (!previous) return "oldingi davr yo'q";
  const suffix = dayCount === undefined ? "" : ` (${dayCount} kun)`;
  return `oldingi davr ${pick(previous.stages)}${suffix}`;
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
    ? `Oldingi davr: ${previousRange}. Bu tanlangan davrdan to'g'ridan-to'g'ri oldingi davr.`
    : "Oldingi davr voronka boshlanishidan (10.09.2026) oldinga to'g'ri keladi, shuning uchun taqqoslash yo'q.";
  // Server tanlangan davrni voronka boshlanishiga (10.09.2026) qirqib
  // qo'yishi mumkin — shunda oldingi davr tanlangan davrdan QISQAROQ chiqadi
  // (masalan, oktyabrda joriy davr 31 kun, oldingisi 10.09–30.09 — 21 kun).
  // Uzunlik farq qilganda kun soni sub-qatorga qo'shiladi, aks holda ikki xil
  // uzunlikdagi davr xuddi to'g'ridan-to'g'ri solishtirsa bo'ladigandek
  // ko'rinardi.
  const previousDays = data.previous
    ? periodDayCount(data.previous.period)
    : null;
  const currentDays = periodDayCount(data.period);
  const previousDayCount =
    previousDays !== null && previousDays !== currentDays
      ? previousDays
      : undefined;

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
        sub={previousSub(data.previous, (s) => formatNumber(s.lead), previousDayCount)}
        tooltip={`Davrda kelgan odamlar: doskadan ${formatNumber(data.leadSplit.board)}, to'g'ridan ${formatNumber(data.leadSplit.direct)}. Bir odamning bir nechta lidi bitta hisoblanadi. ${comparisonNote}`}
      />
      <KpiCard
        icon={Wallet}
        label="To'lov qildi"
        value={formatNumber(data.stages.paid)}
        sub={previousSub(data.previous, (s) => formatNumber(s.paid), previousDayCount)}
        tooltip={`Davrda kelib, keyin (davrdan keyin bo'lsa ham) to'lov qilganlar. ${comparisonNote}`}
      />
      <UnpaidActiveCard value={data.unpaid.active} onOpen={onOpenUnpaidActive} />
    </div>
  );
}
