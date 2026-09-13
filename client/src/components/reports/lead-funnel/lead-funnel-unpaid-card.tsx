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
 */
export function LeadFunnelUnpaidCard({
  unpaid,
  onOpen,
}: LeadFunnelUnpaidCardProps) {
  const parts = [
    { label: "Faol", value: unpaid.active, tone: "bg-emerald-500" },
    { label: "Muzlatilgan", value: unpaid.frozen, tone: "bg-sky-500" },
    { label: "Chetlatilgan", value: unpaid.expelled, tone: "bg-rose-500" },
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <WalletCards className="size-4" />
          <span>Darsga kelgan, lekin to&apos;lamagan</span>
        </div>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <div>
        <p className="text-3xl font-semibold tabular-nums">
          {formatNumber(unpaid.total)}
        </p>
        <p className="text-xs text-muted-foreground">
          bugungi holat · tanlangan davrga bog&apos;liq emas
        </p>
      </div>

      {unpaid.total > 0 && (
        <div
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
        </div>
      )}

      <dl className="grid grid-cols-3 gap-2 text-sm">
        {parts.map((p) => (
          <div key={p.label} className="min-w-0">
            <dt className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span className={`size-2 shrink-0 rounded-full ${p.tone}`} />
              {p.label}
            </dt>
            <dd className="font-medium tabular-nums">{formatNumber(p.value)}</dd>
          </div>
        ))}
      </dl>
    </button>
  );
}
