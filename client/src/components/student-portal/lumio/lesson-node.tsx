"use client";

import * as React from "react";
import { LockSimple } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type LessonNodeState = "locked" | "active" | "done";

export interface LessonNodeProps {
  label: string;
  percent?: number;
  state?: LessonNodeState;
  onClick?: () => void;
  className?: string;
  /** Yo'ldagi joylashuv — zigzag uchun mutlaq koordinatalar. */
  style?: React.CSSProperties;
}

/**
 * Dars yo'lidagi tugun — Duolingo uslubidagi yo'g'on kartacha.
 *
 * Dizayn tizimidan (`daf-design-system/components/gamification/LessonNode`)
 * ko'chirilgan. Uch holat va ularning ma'nosi:
 *
 *   locked — hali ochilmagan (kul rang, botiq, qulf)
 *   active — hozirgi dars (oq, koral halqa va yorug'lik)
 *   done   — tugallangan (teal)
 *
 * «Lab» soyasi (`0 6px 0`) — Lumio'ning loy uslubi: kartacha qalinlikka
 * ega, bosilganda cho'kadi.
 */
export function LessonNode({
  label,
  percent = 0,
  state = "locked",
  onClick,
  className,
  style,
}: LessonNodeProps) {
  const locked = state === "locked";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked || !onClick}
      aria-label={`${label}${locked ? " — hali ochilmagan" : ""}`}
      className={cn(
        "relative flex size-[132px] flex-col justify-between rounded-3xl p-4 text-left transition-transform",
        "active:translate-y-[3px]",
        locked && "cursor-default",
        className,
      )}
      style={{
        ...style,
        background:
          state === "done"
            ? "var(--teal-50)"
            : state === "active"
              ? "var(--surface-card, #fff)"
              : "var(--bg-sunk)",
        color:
          state === "done"
            ? "var(--teal-700)"
            : locked
              ? "var(--ink-400)"
              : "var(--ink-900)",
        boxShadow:
          state === "active"
            ? "0 0 0 5px var(--coral-500), 0 6px 0 var(--line), 0 16px 26px rgba(255,107,74,.28)"
            : state === "done"
              ? "0 6px 0 var(--teal-300), 0 12px 22px rgba(14,42,61,.10)"
              : "0 6px 0 var(--line), 0 12px 22px rgba(14,42,61,.10)",
      }}
    >
      <span className="font-display text-[26px] font-extrabold leading-none">
        {percent}%
      </span>
      <span className="font-display text-[19px] font-bold leading-none">
        {label}
      </span>
      {locked ? (
        <LockSimple
          size={18}
          weight="fill"
          className="absolute right-3 top-3 text-ink-400"
        />
      ) : null}
    </button>
  );
}
