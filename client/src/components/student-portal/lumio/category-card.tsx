"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Kategoriya kartasi — bo'lim ichidagi bo'linmalar (Lug'at / Grammatika /
 * Mashq) va lug'at to'plamlari uchun.
 *
 * Dizayn tizimidan ko'chirilgan
 * (`daf-design-system/components/gamification/CategoryCard`): yumshoq
 * pastel fon, yirik sarlavha va o'ng tomonda oq quticha ichida qiymat.
 */
export type CategoryTone =
  "sky" | "pink" | "sand" | "grape" | "mint" | "peach" | "coral" | "teal";

const TONE_BG: Record<CategoryTone, string> = {
  sky: "var(--sky-100)",
  pink: "#fce0ee",
  sand: "#f4e7cb",
  grape: "var(--grape-100)",
  mint: "#cff3d8",
  peach: "#ffe3c2",
  coral: "var(--coral-100)",
  teal: "var(--teal-50)",
};

export interface CategoryCardProps {
  title: string;
  value: React.ReactNode;
  tone?: CategoryTone;
  onClick?: () => void;
  href?: string;
  className?: string;
}

export function CategoryCard({
  title,
  value,
  tone = "sky",
  onClick,
  className,
}: CategoryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{ background: TONE_BG[tone] }}
      className={cn(
        "flex w-full items-center gap-4 rounded-card px-4 py-5 text-left shadow-lumio-sm transition-transform",
        onClick && "active:translate-y-[2px]",
        className,
      )}
    >
      <span className="flex-1 font-display text-[23px] font-extrabold leading-tight text-ink-900">
        {title}
      </span>
      <span className="inline-flex h-14 min-w-[60px] items-center justify-center rounded-2xl bg-white/70 px-3.5 font-display text-2xl font-extrabold text-ink-900">
        {value}
      </span>
    </button>
  );
}
