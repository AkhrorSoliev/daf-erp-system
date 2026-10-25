"use client";

import * as React from "react";
import { kamHarakatHozir } from "../harakat/kam-harakat";
import { KONFETI_KADRLARI, konfetiQadam, konfetiYarat } from "./konfeti";

/**
 * One burst of confetti over the whole screen, then the canvas is emptied.
 * Never under less motion (system or the device's «Kam harakat»). A remount —
 * React StrictMode's second effect run included — simply throws a fresh burst;
 * the reward sound is not here, so it cannot repeat with it.
 */
export function KonfetiTuval() {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const tuval = ref.current;
    // Read the setting here, in the effect: it is browser-only and must not differ on the server.
    if (!tuval || kamHarakatHozir()) return;
    const ctx = tuval.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = tuval.clientWidth;
    const h = tuval.clientHeight;
    // Setting width/height also resets the transform, so a second run never stacks the scale.
    tuval.width = Math.round(w * dpr);
    tuval.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    const zarralar = konfetiYarat(w / 2, h * 0.45);
    let kadr = 0;
    let id = 0;
    const chiz = () => {
      ctx.clearRect(0, 0, w, h);
      konfetiQadam(zarralar);
      for (const z of zarralar) {
        ctx.save();
        ctx.translate(z.x, z.y);
        ctx.rotate(z.a);
        ctx.fillStyle = z.rang;
        ctx.fillRect(-z.r, -z.r / 2, z.r * 2, z.r);
        ctx.restore();
      }
      kadr += 1;
      if (kadr < KONFETI_KADRLARI) {
        id = requestAnimationFrame(chiz);
      } else {
        // Width 0 clears the canvas AND frees its bitmap (full screen at 2x is several MB);
        // the element stays in the DOM, transparent and inert.
        tuval.width = 0;
      }
    };
    id = requestAnimationFrame(chiz);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 size-full"
    />
  );
}
