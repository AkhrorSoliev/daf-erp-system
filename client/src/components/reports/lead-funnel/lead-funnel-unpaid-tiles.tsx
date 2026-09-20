"use client";

import { ChevronRight, Info } from "lucide-react";
import { formatNumber } from "@/lib/format-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { displayDate, FUNNEL_START_DATE } from "./lead-funnel-math";
import type { LeadFunnelResponse, UnpaidStatusBucket } from "./lead-funnel-types";

interface Props {
  unpaid: LeadFunnelResponse["unpaid"];
  onOpen: (status: UnpaidStatusBucket) => void;
  /** Jamlangan ro'yxat — holat filtrisiz, hammasi birga. */
  onOpenAll?: () => void;
}

const TILES: { status: UnpaidStatusBucket; label: string; urgent: boolean }[] = [
  { status: "active", label: "Faol", urgent: true },
  { status: "frozen", label: "Muzlatilgan", urgent: false },
  { status: "expelled", label: "Chetlatilgan", urgent: false },
  { status: "other", label: "Boshqa", urgent: false },
];

/**
 * Voronkaga 10.09.2026 dan beri kirgan, darsga kelgan, lekin hali to'lamagan
 * odamlar — BUGUNGI holat, tanlangan davrga bog'liq emas. 6–40 kishi uchun
 * grafik emas, raqamlar: har holat o'z ro'yxatini ochadi. «Faol» eng
 * shoshilinchi — darsga kelayotgan, lekin to'lamayotgan odam. Sarlavhadagi
 * jami son ham bosiladigan — hammasini bitta ro'yxatda, holat filtrisiz
 * ko'rish uchun (eski kartochka shuni qilardi, plitkalar esa har biri o'z
 * holatiga qulflangan).
 */
export function LeadFunnelUnpaidTiles({ unpaid, onOpen, onOpenAll }: Props) {
  const tiles = TILES.filter((t) => t.status !== "other" || unpaid.other > 0);

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="space-y-0.5">
            <h3 className="font-semibold">Darsga kelgan, lekin to&apos;lamagan</h3>
            <span className="text-xs text-muted-foreground">
              {displayDate(FUNNEL_START_DATE)} dan beri · bugungi holat ·{" "}
              <button
                type="button"
                onClick={onOpenAll}
                className="rounded tabular-nums transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>{formatNumber(unpaid.total)} kishi</span>
              </button>
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Tushuntirish"
                className="text-muted-foreground transition-colors hover:text-foreground mt-1"
              >
                <Info className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Voronkaga kirgan, kamida bir darsga kelgan va hali birorta to&apos;lov
              qilmaganlar. Davr filtriga bog&apos;liq emas: boshlanishdan bugungacha,
              o&apos;quvchining hozirgi holati bo&apos;yicha.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className={cn("grid gap-3", tiles.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
        {tiles.map((t) => {
          const value = unpaid[t.status];
          return (
            <button
              key={t.status}
              type="button"
              onClick={() => onOpen(t.status)}
              className="group flex items-center justify-between gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-muted-foreground">{t.label}</span>
                <span
                  className={cn(
                    "block text-2xl font-semibold tabular-nums",
                    t.urgent && value > 0 && "text-orange-600 dark:text-orange-400",
                  )}
                >
                  {formatNumber(value)}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
