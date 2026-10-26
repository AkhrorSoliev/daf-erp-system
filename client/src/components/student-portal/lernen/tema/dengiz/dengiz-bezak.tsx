import * as React from "react";
import { cn } from "@/lib/utils";
import { TILE, TILE_COPIES } from "../sahna-umumiy";
import { STRIP_WIDTH, WALL_FACTOR, stripShapes, wallPath, type DecorKind, type Side } from "./dengiz-reja";
import { TUBE_STEM, ZONES, type ZoneId } from "./dengiz-zona";

/** A branching coral with pale tips (dengiz.html `coral`: three strokes instead of a recursive tree). */
function Marjon({ color }: { color: string }) {
  return (
    <>
      <path d="M0 0V-30M0 -14L-12 -28M0 -20L11 -38" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M0 -30h.01M-12 -28h.01M11 -38h.01" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="5" strokeLinecap="round" />
    </>
  );
}

/** A sea fan (dengiz.html `fan`): a half disc with pale ribs. */
function Yelpigich({ color }: { color: string }) {
  return (
    <>
      <path d="M-20 0A20 20 0 0 1 20 0Z" fill={color} opacity="0.85" />
      <path d="M0 0L-14 -14M0 0L0 -20M0 0L14 -14" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" />
    </>
  );
}

/** A kelp frond (dengiz.html `kelp`, one soft blade). */
function Kelp({ color }: { color: string }) {
  return <path d="M-3 0C-12 -40 8 -70 -2 -110C10 -72 -2 -40 5 0Z" fill={color} />;
}

/** Glowing tubes of the deep (dengiz.html `tube`): stems with bright round tips. */
function Naycha({ color }: { color: string }) {
  return (
    <>
      <path d="M-8 0V-22M0 0V-32M8 0V-18" stroke={TUBE_STEM} strokeWidth="4" strokeLinecap="round" />
      <path d="M-8 -24h.01M0 -34h.01M8 -20h.01" stroke={color} strokeWidth="8" strokeLinecap="round" />
    </>
  );
}

/** Each decoration drawn at its own foot (0, 0), growing up: still SVG, two shapes at most. */
export const DECOR_GLYPH: Record<DecorKind, (p: { color: string }) => React.JSX.Element> = {
  coral: Marjon,
  fan: Yelpigich,
  kelp: Kelp,
  tube: Naycha,
};

/** Each decoration's box (`viewBox`) around its foot: a frond drawn alone is scaled to fill its element. */
export const GLYPH_BOX: Record<DecorKind, string> = {
  coral: "-16 -42 32 42",
  fan: "-22 -22 44 22",
  kelp: "-14 -112 28 112",
  tube: "-12 -38 24 38",
};

/** One fish facing right (dengiz.html `fish`), `s` times its 30 × 16 size; a school swimming left mirrors it. */
export function Baliq({ color, x, y, s, chap }: { color: string; x: number; y: number; s: number; chap: boolean }) {
  return (
    <svg
      viewBox="0 0 30 16"
      width={30 * s}
      height={16 * s}
      className="absolute"
      style={{ left: x, top: y }}
      aria-hidden="true"
    >
      <g transform={chap ? "matrix(-1 0 0 1 30 0)" : undefined}>
        <path d="M2 8L9 2 8 8 9 14Z" fill={color} />
        <path d="M8 8Q16 -2 27 8Q16 18 8 8Z" fill={color} />
        <circle cx="23" cy="6.6" r="1.6" fill="#ffffff" />
      </g>
    </svg>
  );
}

/**
 * One wall strip of one zone: a 96 px column of rock and decor at one edge,
 * one 640 px tile drawn `TILE_COPIES` times with `<use>`, the screen plus a
 * tile tall, so the parallax (`useParallaks` reads `data-omil`) wraps it
 * forever. It is the scene's only moving layer, and narrow on purpose: no
 * filter, no blur, nothing full-screen (ADR-0133). The right strip is the
 * left one's mirror image with its own seed.
 */
export const DengizDevor = React.memo(function DengizDevor({
  zona,
  side,
  count,
}: {
  zona: ZoneId;
  side: Side;
  count: number;
}) {
  const p = ZONES[zona];
  const { wall, decor } = stripShapes(zona, side, count);
  const id = `dengiz-${zona}-${side}`;
  return (
    <svg
      data-omil={WALL_FACTOR}
      aria-hidden="true"
      className={cn("dengiz-strip absolute top-0", side === "left" ? "left-0" : "right-0")}
      style={{ width: STRIP_WIDTH, height: `calc(100% + ${TILE}px)` }}
    >
      <g transform={side === "right" ? `matrix(-1 0 0 1 ${STRIP_WIDTH} 0)` : undefined}>
        <g id={`${id}-tile`}>
          <path d={wallPath(wall)} fill={p.rock} />
          {decor.map((d, i) => {
            const Glyph = DECOR_GLYPH[d.kind];
            return (
              <g key={i} transform={`translate(${d.x} ${d.y}) scale(${d.scale})`}>
                <Glyph color={d.color} />
              </g>
            );
          })}
        </g>
        {Array.from({ length: TILE_COPIES - 1 }, (_, i) => (
          <use key={i} href={`#${id}-tile`} y={TILE * (i + 1)} />
        ))}
      </g>
    </svg>
  );
});
