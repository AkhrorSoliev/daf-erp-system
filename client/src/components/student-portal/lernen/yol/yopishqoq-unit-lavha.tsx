"use client";

import { cn } from "@/lib/utils";

/**
 * The level hues of the path (A1 coral, A2 teal, B1 grape), in the palette's deep stops: the banner carries
 * white text, which the bright 500 stops cannot hold at 4.5:1 (2.82 / 2.48 / 4.23); these give 5.07 / 5.20 / 5.70.
 * The unit page's banner uses the same map. The path's nodes keep the bright stops.
 */
export const DARAJA_FONI: Record<string, string> = {
  A1: "bg-coral-700",
  A2: "bg-teal-700",
  B1: "bg-grape-600",
};

/**
 * The banner that sticks under the page header and shows which unit the student
 * is scrolling through; its colour follows the unit's level.
 */
export function YopishqoqUnitLavha({ matn, daraja }: { matn: string; daraja: string }) {
  return (
    <div
      // Hidden from screen readers: it repeats the unit headers and would re-announce while scrolling.
      // `data-yol-banner` lets the auto-scroll measure its height.
      aria-hidden="true"
      data-yol-banner=""
      className={cn(
        "sticky top-[max(0.5rem,env(safe-area-inset-top))] z-10 rounded-2xl px-4 py-3 font-display text-base font-extrabold text-white",
        // `in-data-…`: LernenYol marks its root while the device's less-motion switch is on.
        "shadow-[0_5px_0_rgba(0,0,0,.22)] transition-colors duration-500 motion-reduce:transition-none in-data-[kam-harakat]:transition-none",
        DARAJA_FONI[daraja] ?? DARAJA_FONI.A1,
      )}
    >
      {matn}
    </div>
  );
}
