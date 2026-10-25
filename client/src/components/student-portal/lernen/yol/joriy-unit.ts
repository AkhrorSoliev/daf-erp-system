"use client";

import * as React from "react";

/** The unit whose header has scrolled up to (or past) the sticky line; the first one before any has. */
export function joriyUnitIndeksi(tepalar: number[], chegara: number): number {
  let idx = 0;
  tepalar.forEach((tepa, i) => {
    if (tepa <= chegara) idx = i;
  });
  return idx;
}

/** Sticky banner follows the scroll. One passive listener, work done inside a frame. */
export function useJoriyUnit(konteyner: React.RefObject<HTMLElement | null>, chegara = 120): number {
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    let kadr = 0;
    const hisobla = () => {
      kadr = 0;
      const el = konteyner.current;
      if (!el) return;
      const tepalar = [...el.querySelectorAll<HTMLElement>("[data-yol-unit]")].map((u) => u.getBoundingClientRect().top);
      setIdx(joriyUnitIndeksi(tepalar, chegara));
    };
    const turtki = () => {
      if (!kadr) kadr = requestAnimationFrame(hisobla);
    };
    hisobla();
    window.addEventListener("scroll", turtki, { passive: true });
    window.addEventListener("resize", turtki);
    return () => {
      window.removeEventListener("scroll", turtki);
      window.removeEventListener("resize", turtki);
      if (kadr) cancelAnimationFrame(kadr);
    };
  }, [konteyner, chegara]);

  return idx;
}
