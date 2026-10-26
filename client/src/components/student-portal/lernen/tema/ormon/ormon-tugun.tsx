"use client";

import { Check, LockSimple, Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import type { TugunBelgisiProps, TugunHolat } from "../tema-turlari";

/**
 * The orb of each state (ormon2.html `.node.done / .cur / .lock`): lit gold, a
 * mint glow, a pale frosted stone (a translucent surface, no backdrop blur —
 * the scene moves under it on every scroll frame). The level colour is not
 * used: the forest has its own light; the sticky banner still shows the level.
 */
export const SHAR: Record<TugunHolat, { fon: string; soya: string; belgi: string }> = {
  done: {
    fon: "radial-gradient(circle at 36% 30%, #fff6d4, #f2cd7a 60%, #e2ae52)",
    soya: "0 8px 20px rgba(0, 0, 0, 0.2), 0 0 26px rgba(255, 227, 160, 0.4)",
    belgi: "#6b4a10",
  },
  active: {
    fon: "radial-gradient(circle at 36% 30%, #f0fffb, #86ead2 60%, #4fcdb3)",
    soya: "0 8px 24px rgba(0, 0, 0, 0.2), 0 0 36px rgba(166, 253, 232, 0.67)",
    belgi: "#0d4a3d",
  },
  locked: {
    fon: "color-mix(in srgb, var(--surface-card) 72%, transparent)",
    soya: "0 6px 18px rgba(0, 0, 0, 0.13)",
    belgi: "var(--ink-600)",
  },
};

/**
 * «O'rmon»'s path node. The current one wears a breathing ring (transform and
 * opacity only, `.ormon-ring`). A locked node is still a button — the student
 * gets the soft "locked" answer — but it says it is closed to screen readers.
 * The name sits on a plain surface pill, so it reads over any part of the scene.
 *
 * Under «Kam harakat» the ring rests at `opacity: 0`, so the current node does
 * not lean on it: its own mint fill, mint glow and star already tell it apart
 * from the gold check and the frosted lock, with no motion.
 */
export function OrmonTugun({ label, holat, onClick, onBosilmagan }: TugunBelgisiProps) {
  const t = useT();
  const locked = holat === "locked";
  const shar = SHAR[holat];
  const Icon = holat === "done" ? Check : holat === "active" ? Star : LockSimple;
  return (
    <div data-tugun="ormon" className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {holat === "active" ? (
          <span
            aria-hidden
            className="ormon-ring absolute inset-0 rounded-full"
            style={{ boxShadow: "0 0 0 10px rgba(166, 253, 232, 0.55)" }}
          />
        ) : null}
        <button
          type="button"
          onClick={locked ? onBosilmagan : onClick}
          aria-label={locked ? t("{label} — hali ochilmagan", { label }) : label}
          aria-disabled={locked || undefined}
          className={cn(
            "relative grid size-[68px] place-items-center rounded-full transition-transform",
            locked ? "cursor-default border border-white/60" : "hover:-translate-y-0.5 active:scale-95",
          )}
          style={{ background: shar.fon, boxShadow: shar.soya, color: shar.belgi }}
        >
          <Icon size={28} weight="fill" />
        </button>
      </div>
      <span className="relative max-w-[120px] truncate rounded-full bg-surface px-2.5 py-0.5 text-center text-xs font-bold text-ink-900 shadow-lumio-sm">
        {label}
      </span>
    </div>
  );
}
