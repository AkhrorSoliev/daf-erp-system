"use client";

import { ChevronRight, WalletCards } from "lucide-react";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { formatNumber } from "@/lib/format-utils";
import { displayDate, FUNNEL_START_DATE } from "./lead-funnel-math";
import type { LeadFunnelResponse } from "./lead-funnel-types";

interface LeadFunnelUnpaidCardProps {
  unpaid: LeadFunnelResponse["unpaid"];
  onOpen: () => void;
}

/**
 * Voronkaga 10.09.2026 dan beri kirgan, darsga kelgan, lekin hali to'lamagan
 * odamlar. Tanlangan davrga emas, BUGUNGI holatga bog'liq. Holat bo'yicha
 * bo'linadi — aks holda jami «hozir qo'ng'iroq qilinadiganlar» deb o'qilardi,
 * vaholanki ularning bir qismi allaqachon chetlatilgan.
 *
 * Tugma ichida faqat `span` — `div`/`p`/`dl` tugma ichida ruxsat etilmagan.
 */
export function LeadFunnelUnpaidCard({
  unpaid,
  onOpen,
}: LeadFunnelUnpaidCardProps) {
  const t = useT();
  // The labels count people, so they are plural («Faollar»), not the status
  // badge words («Faol») that agree with a single student.
  const parts = [
    { label: msg("Faollar"), value: unpaid.active, tone: "bg-emerald-500" },
    { label: msg("Muzlatilganlar"), value: unpaid.frozen, tone: "bg-sky-500" },
    { label: msg("Chetlatilganlar"), value: unpaid.expelled, tone: "bg-rose-500" },
    // Bitirgan, arxivlangan va h.k. — kam uchraydi, faqat bor bo'lsa ko'rinadi.
    ...(unpaid.other > 0
      ? [{ label: msg("Boshqalar"), value: unpaid.other, tone: "bg-slate-400" }]
      : []),
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t(
        "Darsga kelgan, lekin to'lamagan: {n} kishi — ro'yxatni ochish",
        { n: formatNumber(unpaid.total) },
      )}
      className="group flex w-full flex-col gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <WalletCards className="size-4" />
          {t("Darsga kelgan, lekin to'lamagan")}
        </span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </span>

      <span className="block">
        <span className="block text-3xl font-semibold tabular-nums">
          {formatNumber(unpaid.total)}
        </span>
        <span className="block text-xs text-muted-foreground">
          {t("{date} dan beri voronkaga kirganlar · bugungi holat", {
            date: displayDate(FUNNEL_START_DATE),
          })}
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
              {t(p.label)}
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
