"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CONTENT_INSET, type SidebarMode } from "../../lib/sidebar-store";

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
 */
export function PastkiPanel({
  sidebarMode,
  children,
}: React.PropsWithChildren<{ sidebarMode: SidebarMode }>) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 transition-[padding] duration-200 ease-out",
        CONTENT_INSET[sidebarMode],
      )}
    >
      <div className="border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {children}
      </div>
    </div>
  );
}
