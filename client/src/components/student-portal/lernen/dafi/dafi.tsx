"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { kamHarakatHozir } from "../harakat/kam-harakat";
import { DAFI_OLCHAM, RIG_HOLAT, type DafiHolat, type DafiOlcham } from "./dafi-holat";
import { DAFI_SVG } from "./dafi-svg";
import type { DafiRig } from "./dafi-rig";

export interface DafiProps {
  holat?: DafiHolat;
  olcham?: DafiOlcham;
  className?: string;
}

/**
 * Dafi, the bear head (ADR-0125). The SVG is server-rendered in its calm
 * pose (the neutral mouth and the hidden state-only layers are starting
 * attributes of `DAFI_SVG`), so the first paint already shows him, and he
 * stays that way if the animation chunk is slow or fails to load. `gsap` and
 * the rig load after mount and only here (the portal bundle stays free of the
 * animation library); the rig overwrites these attributes on its first frame.
 */
export function Dafi({ holat = "tinch", olcham = "md", className }: DafiProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const rig = React.useRef<DafiRig | null>(null);
  const hozirgi = React.useRef<DafiHolat>(holat);

  React.useEffect(() => {
    let tugadi = false;
    void Promise.all([import("gsap"), import("./dafi-rig")]).then(([{ gsap }, { DafiRig }]) => {
      if (tugadi || !ref.current) return;
      const r = new DafiRig(ref.current, gsap, { reduce: kamHarakatHozir() });
      rig.current = r;
      r.set(RIG_HOLAT[hozirgi.current]);
    });
    return () => {
      tugadi = true;
      rig.current?.destroy();
      rig.current = null;
    };
  }, []);

  React.useEffect(() => {
    hozirgi.current = holat;
    rig.current?.set(RIG_HOLAT[holat]);
  }, [holat]);

  const w = DAFI_OLCHAM[olcham];
  return (
    <div
      ref={ref}
      data-holat={holat}
      aria-hidden="true"
      className={cn("pointer-events-none inline-block shrink-0", className)}
      style={{ width: w, height: Math.round(w * 0.9) }}
      dangerouslySetInnerHTML={{ __html: DAFI_SVG }}
    />
  );
}
