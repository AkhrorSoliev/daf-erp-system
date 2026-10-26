"use client";

import { Check, LockSimple, Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import type { UnitJoyiProps } from "../tema-turlari";
import { belgiTuri, tugunRangi } from "./toza-tugun-model";

/**
 * «Toza»: one lesson as a place of the unit (spec §8) — the path's own node
 * badge (check, star, lock), the name, and «Boshlash» on the current one. A
 * locked place stays a button — it answers with the short "locked" sound —
 * but tells screen readers it is closed, as the path node does.
 */
export function TozaUnitJoyi({ label, holat, tone, izoh, onClick, onBosilmagan }: UnitJoyiProps) {
  const t = useT();
  const qulf = holat === "locked";
  const joriy = holat === "active";
  const { yuz, lab } = tugunRangi(holat, tone);
  const belgi = belgiTuri(holat);
  const Icon = belgi === "tekshirildi" ? Check : belgi === "yulduz" ? Star : LockSimple;
  return (
    <button
      type="button"
      onClick={qulf ? onBosilmagan : onClick}
      aria-disabled={qulf || undefined}
      aria-label={qulf ? t("{label} — hali ochilmagan", { label }) : undefined}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-card border-2 border-b-[5px] border-line bg-surface px-4 py-3 text-left transition-transform",
        qulf ? "cursor-default" : "active:translate-y-[3px] hover:-translate-y-0.5",
      )}
      style={joriy ? { borderColor: yuz } : undefined}
    >
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full"
        style={{
          background: yuz,
          color: qulf ? "var(--ink-400)" : "#fff",
          boxShadow: `0 4px 0 ${lab}`,
        }}
      >
        <Icon size={22} weight="fill" />
      </span>
      <span className="min-w-0 flex-1">
        {/* Text on white: ink-600 (6.58:1) for a closed lesson — a pale ink-400 (2.52:1) is unreadable, the lock badge already says "closed". */}
        <span
          className={cn(
            "block truncate font-semibold",
            qulf ? "text-ink-600" : "text-ink-900",
          )}
        >
          {label}
        </span>
        {izoh ? (
          <span className="block truncate text-xs font-semibold text-[var(--amber-ink)]">
            {izoh}
          </span>
        ) : null}
      </span>
      {joriy ? (
        // White text needs 4.5:1: the level colour itself is 2.48-4.23:1, its darker lip 4.56-7.10:1.
        <span
          className="shrink-0 rounded-full px-3 py-1 font-display text-xs font-extrabold uppercase tracking-wide text-white"
          style={{ background: lab }}
        >
          {t("Boshlash")}
        </span>
      ) : null}
    </button>
  );
}
