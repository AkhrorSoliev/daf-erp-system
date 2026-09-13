"use client";

import { ChevronRight, WalletCards } from "lucide-react";
import { formatNumber } from "@/lib/format-utils";
import type { LeadFunnelResponse } from "./lead-funnel-types";

interface LeadFunnelUnpaidCardProps {
  unpaid: LeadFunnelResponse["unpaid"];
  onOpen: () => void;
}

/**
 * Voronkadan boshqa o'lchov: davrga emas, BUGUNGA bog'liq. Holat bo'yicha
 * bo'linadi — aks holda jami «hozir qo'ng'iroq qilinadiganlar» deb o'qilardi,
 * vaholanki ularning bir qismi allaqachon chetlatilgan.
 *
 * Tugma ichida faqat `span` — `div`/`p`/`dl` tugma ichida ruxsat etilmagan.
 */
export function LeadFunnelUnpaidCard({
  unpaid,
  onOpen,
}: LeadFunnelUnpaidCardProps) {
  const parts = [
    { label: "Faol", value: unpaid.active, tone: "bg-emerald-500" },
    { label: "Muzlatilgan", value: unpaid.frozen, tone: "bg-sky-500" },
    { label: "Chetlatilgan", value: unpaid.expelled, tone: "bg-rose-500" },
    // Bitirgan, arxivlangan va h.k. — kam uchraydi, faqat bor bo'lsa ko'rinadi.
    ...(unpaid.other > 0
      ? [{ label: "Boshqa", value: unpaid.other, tone: "bg-slate-400" }]
      : []),
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Darsga kelgan, lekin to'lamagan: ${unpaid.total} kishi — ro'yxatni ochish`}
      className="group flex w-full flex-col gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <WalletCards className="size-4" />
          Darsga kelgan, lekin to&apos;lamagan
        </span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </span>

      <span className="block">
        <span className="block text-3xl font-semibold tabular-nums">
          {formatNumber(unpaid.total)}
        </span>
        <span className="block text-xs text-muted-foreground">
          bugungi holat · tanlangan davrga bog&apos;liq emas
        </span>
      </span>

      {unpaid.total > 0 && (
        <span
          className="flex h-2 overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          {parts.map((p) =>
            p.value > 0 ? (
              <span
                key={p.label}
                className={p.tone}
                style={{ width: `${(p.value / unpaid.total) * 100}%` }}
              />
            ) : null,
          )}
        </span>
      )}

      <span
        className={`grid gap-2 text-sm ${parts.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}
      >
        {parts.map((p) => (
          <span key={p.label} className="block min-w-0">
            <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className={`size-2 shrink-0 rounded-full ${p.tone}`} />
              {p.label}
            </span>
            <span className="block font-medium tabular-nums">
              {formatNumber(p.value)}
            </span>
          </span>
        ))}
      </span>
    </button>
  );
}
