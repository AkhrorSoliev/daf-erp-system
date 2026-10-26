"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";
import { CONTENT_INSET, type SidebarMode } from "../../lib/sidebar-store";

/**
 * Text a page draws straight on a scene sits on the plain surface — exactly as
 * on «Toza»'s cards — so it reads at 4.5:1 over any part of the picture
 * (spec §11). Only when the theme has a scene; no backdrop blur (the scene
 * moves under it on every scroll frame).
 */
export const SAHNA_PARDASI = "rounded-2xl bg-surface px-3 py-2 shadow-lumio-sm";

/** The same for a one-line caption (a level divider, a node's section name). */
export const SAHNA_PARDASI_KICHIK = "w-fit rounded-full bg-surface px-2.5 py-0.5 shadow-lumio-sm";

/** The same for a block with its own padding (an empty or a failed state). */
export const SAHNA_KARTASI = "rounded-[28px] bg-surface shadow-lumio-card";

/**
 * The frame every theme's scene is drawn in (ADR-0131): the whole screen,
 * behind the page's content (the page root is `isolate`, the frame `-z-10`),
 * clear of the side rail — it is `fixed`, so the content column's inset does
 * not reach it — and never in the way of a tap or a screen reader. The rail
 * mode is a prop (as `PastkiPanel`'s), so a test can render every width.
 * The inset slides at the content column's pace (the rail and the column take
 * 200 ms to change width), so the scene never sits under the rail or leaves a
 * gap beside it for a moment; under reduced motion it follows at once.
 */
export function SahnaRamka({ sidebarMode, children }: { sidebarMode: SidebarMode; children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 transition-[padding] duration-200 ease-out motion-reduce:transition-none",
        CONTENT_INSET[sidebarMode],
      )}
    >
      <div className="relative h-full w-full overflow-hidden">{children}</div>
    </div>
  );
}
