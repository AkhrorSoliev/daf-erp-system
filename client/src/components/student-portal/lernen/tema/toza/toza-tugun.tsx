"use client";

import * as React from "react";
import { Check, LockSimple, Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import type { TugunBelgisiProps } from "../tema-turlari";
import { belgiTuri, tugunRangi } from "./toza-tugun-model";

/**
 * The «Toza» theme's path node: a round, chunky button with a darker lip that
 * sinks when pressed. The current node wears a ring and breathes. A locked node
 * is still a button (the student gets the soft "locked" answer), but it says
 * it is closed to screen readers.
 */
export function TozaTugun({ label, holat, tone, onClick, onBosilmagan }: TugunBelgisiProps) {
  const t = useT();
  const { yuz, lab } = tugunRangi(holat, tone);
  const locked = holat === "locked";
  const belgi = belgiTuri(holat);
  const Icon = belgi === "tekshirildi" ? Check : belgi === "yulduz" ? Star : LockSimple;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {holat === "active" ? (
          <span
            aria-hidden
            className="lumio-pulse-ring absolute -inset-2 rounded-full"
            style={{ boxShadow: `0 0 0 4px ${yuz}` }}
          />
        ) : null}
        <button
          type="button"
          onClick={locked ? onBosilmagan : onClick}
          aria-label={locked ? t("{label} — hali ochilmagan", { label }) : label}
          aria-disabled={locked || undefined}
          className={cn(
            "relative grid size-[76px] place-items-center rounded-full transition-transform",
            "active:translate-y-[5px]",
            locked ? "cursor-default" : "hover:-translate-y-0.5",
          )}
          style={{
            background: yuz,
            color: locked ? "var(--ink-400)" : "#fff",
            boxShadow: `0 7px 0 ${lab}, 0 14px 22px rgba(14,42,61,.14)`,
          }}
        >
          <Icon size={32} weight="fill" />
        </button>
      </div>
      <span className="max-w-[120px] truncate text-center text-xs font-bold text-ink-500">{label}</span>
    </div>
  );
}
