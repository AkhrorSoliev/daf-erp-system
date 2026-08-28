"use client";

import * as React from "react";
import { Coin, Diamond, Lightning, Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Mukofot hisobi — «yulduz 3/10» ko'rinishidagi kapsula.
 *
 * Dizayn tizimidan ko'chirilgan
 * (`daf-design-system/components/gamification/FractionChip`). Dars va
 * mashq kartalarida qancha to'plangani va qancha borligini ko'rsatadi.
 */
export type FractionKind = "star" | "coin" | "xp" | "gem";

const KIND: Record<
  FractionKind,
  {
    color: string;
    Icon: React.ComponentType<{ size?: number; weight?: "fill" }>;
  }
> = {
  star: { color: "var(--success)", Icon: Star },
  coin: { color: "var(--amber-400)", Icon: Coin },
  xp: { color: "var(--amber-500)", Icon: Lightning },
  gem: { color: "var(--teal-500)", Icon: Diamond },
};

export interface FractionChipProps {
  kind?: FractionKind;
  earned: number;
  total: number;
  size?: "sm" | "md";
  className?: string;
}

export function FractionChip({
  kind = "star",
  earned,
  total,
  size = "md",
  className,
}: FractionChipProps) {
  const { color, Icon } = KIND[kind];
  const sm = size === "sm";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface",
        sm ? "h-7 pl-1.5 pr-2.5 text-[13px]" : "h-[34px] pl-2 pr-3 text-[15px]",
        className,
      )}
    >
      <span style={{ color }} className="inline-flex">
        <Icon size={sm ? 16 : 19} weight="fill" />
      </span>
      <span className="font-display font-extrabold leading-none text-ink-900">
        {earned}
        <span className="text-ink-400">/{total}</span>
      </span>
    </span>
  );
}
