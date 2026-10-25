/** One piece of confetti: a small rotating rectangle. */
export interface Zarra {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Half the long side, px. */
  r: number;
  rang: string;
  /** Rotation, radians. */
  a: number;
}

/** Lumio's coral, amber, teal, grape and sky — canvas cannot read CSS variables. */
export const KONFETI_RANGLARI = ["#ff6b4a", "#ffc24d", "#14b8ac", "#8b5cf6", "#5bb1ff"] as const;
export const KONFETI_SONI = 100;
/** About 2 s at 60 fps (duo.html `confetti()`). */
export const KONFETI_KADRLARI = 120;
export const OGIRLIK = 0.42;

/** A burst from one point: speeds and sizes are duo.html's. `rnd` is injectable for tests. */
export function konfetiYarat(x: number, y: number, rnd: () => number = Math.random): Zarra[] {
  const oraliq = (a: number, b: number) => a + rnd() * (b - a);
  return Array.from({ length: KONFETI_SONI }, () => ({
    x,
    y,
    vx: oraliq(-7, 7),
    vy: oraliq(-14, -3),
    r: oraliq(4, 8),
    rang: KONFETI_RANGLARI[Math.min(KONFETI_RANGLARI.length - 1, Math.floor(rnd() * KONFETI_RANGLARI.length))],
    a: oraliq(0, 6),
  }));
}

/** One frame, in place: move, then let gravity pull and the piece spin. */
export function konfetiQadam(zarralar: Zarra[]): void {
  for (const z of zarralar) {
    z.x += z.vx;
    z.y += z.vy;
    z.vy += OGIRLIK;
    z.a += 0.2;
  }
}
