"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CONTENT_INSET, type SidebarMode } from "../../lib/sidebar-store";

/**
 * The bar's own paint: the plain surface before the check, then a soft green
 * or the soft amber «almost» (ADR-0128) mixed INTO the surface, so the bar
 * stays opaque over the question it covers.
 */
const FON = {
  bosh: "bg-surface",
  togri: "bg-[color-mix(in_srgb,var(--success)_14%,var(--surface-card))]",
  xato: "bg-[color-mix(in_srgb,var(--amber-500)_16%,var(--surface-card))]",
} as const;

/**
 * A session's fixed bottom bar: the verdict and «Tekshirish»/«Keyingi».
 *
 * `fixed` takes the bar out of the content column, so on its own it spans the
 * whole viewport and, from md up, slides under the side rail. The outer layer
 * therefore carries the shell's own CONTENT_INSET: the painted bar starts where
 * the rail ends and is centred on the same column as the question, for either
 * rail width and for the pre-hydration `auto` mode. Below md there is no rail
 * and no inset, so a phone keeps the full-width bar.
 *
 * The mode is a prop, not read from `useSidebar` here, so a test can render the
 * wiring for every mode (a server render only ever sees the store's `auto`).
 * `ohang` is the verdict's tint (`panelOhangi`), `null` before the check.
 */
export function PastkiPanel({
  sidebarMode,
  ohang = null,
  children,
}: React.PropsWithChildren<{
  sidebarMode: SidebarMode;
  ohang?: "togri" | "xato" | null;
}>) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 transition-[padding] duration-200 ease-out",
        CONTENT_INSET[sidebarMode],
      )}
    >
      <div
        className={cn(
          "border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3",
          "transition-colors duration-200 motion-reduce:transition-none in-data-[kam-harakat]:transition-none",
          FON[ohang ?? "bosh"],
        )}
      >
        {children}
      </div>
    </div>
  );
}
