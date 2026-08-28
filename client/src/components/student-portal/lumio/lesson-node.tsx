"use client";

import * as React from "react";
import { LockSimple } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type LessonNodeState = "locked" | "active" | "done";

/**
 * Bosqich rangi — har daraja o'z tusi bilan ajraladi.
 *
 * Yo'l uzluksiz, ya'ni A1.1 dan B1 gacha bitta chiziq. Daraja
 * o'zgarganini KO'RSATADIGAN narsa rang bo'ladi; agar u bo'lmasa, yo'l
 * bitta uzun ro'yxatga aylanib, o'quvchi qayerdaligini bilmay qoladi.
 */
export type LessonNodeTone = "coral" | "amber" | "teal" | "sky" | "grape";

const TONE: Record<
  LessonNodeTone,
  { face: string; ring: string; lip: string; text: string }
> = {
  coral: {
    face: "var(--coral-100)",
    ring: "var(--coral-500)",
    lip: "var(--coral-500)",
    text: "var(--coral-700)",
  },
  amber: {
    face: "#fdf0d5",
    ring: "var(--amber-500)",
    lip: "var(--amber-500)",
    text: "var(--amber-700)",
  },
  teal: {
    face: "var(--teal-50)",
    ring: "var(--teal-500)",
    lip: "var(--teal-300)",
    text: "var(--teal-700)",
  },
  sky: {
    face: "var(--sky-100)",
    ring: "var(--sky-500)",
    lip: "var(--sky-400)",
    text: "var(--ink-900)",
  },
  grape: {
    face: "var(--grape-100)",
    ring: "var(--grape-500)",
    lip: "var(--grape-400)",
    text: "var(--grape-600)",
  },
};

export interface LessonNodeProps {
  /** Tugun ichidagi nom — bo'limning o'z nomi. */
  label: string;
  percent?: number;
  state?: LessonNodeState;
  tone?: LessonNodeTone;
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
  tone = "coral",
  onClick,
  className,
  style,
}: LessonNodeProps) {
  const locked = state === "locked";
  const t = TONE[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked || !onClick}
      aria-label={`${label}${locked ? " — hali ochilmagan" : ""}`}
      className={cn(
        "relative flex size-[132px] shrink-0 flex-col justify-between rounded-3xl p-4 text-left transition-transform",
        "active:translate-y-[3px]",
        locked && "cursor-default",
        className,
      )}
      style={{
        ...style,
        background: locked ? "var(--bg-sunk)" : t.face,
        color: locked ? "var(--ink-400)" : t.text,
        boxShadow: locked
          ? "0 6px 0 var(--line), 0 12px 22px rgba(14,42,61,.10)"
          : state === "active"
            ? `0 0 0 5px ${t.ring}, 0 6px 0 ${t.lip}, 0 16px 26px rgba(14,42,61,.18)`
            : `0 6px 0 ${t.lip}, 0 12px 22px rgba(14,42,61,.10)`,
      }}
    >
      <span className="font-display text-[26px] font-extrabold leading-none">
        {percent}%
      </span>
      <span className="line-clamp-3 font-display text-[15px] font-bold leading-tight">
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
