"use client";

import * as React from "react";
import { yengilRejimmi } from "./kam-harakat";
import { layerOffset, scenePaused } from "./parallaks";

const obunaYoq = () => () => {};

function qurilmaZaifmi(): boolean {
  const n = navigator as Navigator & { deviceMemory?: number };
  return yengilRejimmi({ yadro: n.hardwareConcurrency, xotira: n.deviceMemory });
}

/**
 * A weak device draws the lighter scene (spec §9). The server and the first
 * paint assume the light one — a weak phone never pays for the full scene —
 * and the browser's answer replaces it after hydration.
 */
export function useYengilRejim(): boolean {
  return React.useSyncExternalStore(obunaYoq, qurilmaZaifmi, () => true);
}

/**
 * Whether the scene holds still: the tab is hidden (`visibilitychange`) or the
 * scene is off screen (`IntersectionObserver`). `false` on the server.
 */
export function useSahnaPauza(ildiz: React.RefObject<HTMLElement | null>): boolean {
  const [yashirin, setYashirin] = React.useState(false);
  const [ekrandaEmas, setEkrandaEmas] = React.useState(false);

  React.useEffect(() => {
    const yangila = () => setYashirin(document.visibilityState === "hidden");
    yangila();
    document.addEventListener("visibilitychange", yangila);
    const el = ildiz.current;
    const io =
      el && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([e]) => setEkrandaEmas(!e.isIntersecting))
        : null;
    if (el) io?.observe(el);
    return () => {
      document.removeEventListener("visibilitychange", yangila);
      io?.disconnect();
    };
  }, [ildiz]);

  return scenePaused({ hidden: yashirin, offscreen: ekrandaEmas });
}

/**
 * The scene's ONE `requestAnimationFrame` for the scroll parallax (spec §5):
 * every element under `ildiz` with `data-omil` (its factor) moves by
 * `layerOffset` from a passive scroll listener, at most once a frame. Off
 * (`faol` false: «Kam harakat» or paused) the layers rest where they are drawn.
 * `kalit` changes when the drawn layers change, so the list is read again.
 */
export function useParallaks(
  ildiz: React.RefObject<HTMLElement | null>,
  { faol, tile, kalit }: { faol: boolean; tile: number; kalit: string },
): void {
  React.useEffect(() => {
    const el = ildiz.current;
    if (!el) return;
    const qatlamlar = [...el.querySelectorAll<HTMLElement | SVGElement>("[data-omil]")];
    if (!faol) {
      for (const q of qatlamlar) q.style.transform = "";
      return;
    }
    let kadr = 0;
    const chiz = () => {
      kadr = 0;
      const y = window.scrollY;
      for (const q of qatlamlar) {
        q.style.transform = `translate3d(0, ${layerOffset(y, Number(q.dataset.omil), tile)}px, 0)`;
      }
    };
    const turtki = () => {
      if (!kadr) kadr = requestAnimationFrame(chiz);
    };
    chiz();
    window.addEventListener("scroll", turtki, { passive: true });
    return () => {
      window.removeEventListener("scroll", turtki);
      if (kadr) cancelAnimationFrame(kadr);
    };
  }, [ildiz, faol, tile, kalit]);
}
