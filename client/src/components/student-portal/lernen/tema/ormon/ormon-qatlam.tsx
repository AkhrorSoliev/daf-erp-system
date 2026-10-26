import * as React from "react";
import { TILE_COPIES } from "../sahna-umumiy";
import { BIOMES, type BiomeId } from "./ormon-biom";
import { LAYER_BLUR, LAYER_FACTOR, TILE, type LayerId } from "./ormon-sahna-rejasi";
import { layerShapes, type Bush, type Hill, type Shape, type Tree } from "./ormon-shakllar";

const LAYER_SEED: Record<LayerId, number> = { far: 11, mid: 23, near: 37 };
const BIOME_SEED: Record<BiomeId, number> = { tong: 0, kol: 100, kuz: 200 };

/** The shapes of one tile of a biome's layer: the layer's seed plus the biome's, so every biome has its own forest. */
export function tileShapes(biome: BiomeId, layer: LayerId, count: number): Shape[] {
  return layerShapes(layer, count, LAYER_SEED[layer] + BIOME_SEED[biome]);
}

/** A soft tree drawn at its own origin (ormon2.html `soft`): a trunk and four round crowns. */
function SoftTree({ crown, trunk }: { crown: string; trunk: string }) {
  return (
    <>
      <rect x="-5" y="-50" width="10" height="50" rx="5" fill={trunk} opacity="0.6" />
      <circle cx="0" cy="-78" r="34" fill={crown} />
      <circle cx="-28" cy="-56" r="26" fill={crown} />
      <circle cx="28" cy="-56" r="26" fill={crown} />
      <circle cx="0" cy="-52" r="28" fill={crown} />
    </>
  );
}

/**
 * One depth layer of one biome: a 640 px tile of soft shapes drawn `TILE_COPIES`
 * times with `<use>` and blurred once inside the SVG (rasterised once, then only
 * moved). It is the screen plus a tile tall, so the parallax (`useParallaks`
 * reads `data-omil`) can wrap it forever. Positions across are percentages, so
 * one tile fits a 360 px phone and a wide desktop alike.
 */
export const OrmonQatlam = React.memo(function OrmonQatlam({
  biome,
  layer,
  count,
}: {
  biome: BiomeId;
  layer: LayerId;
  count: number;
}) {
  const p = BIOMES[biome];
  const fill = p[layer];
  const shapes = tileShapes(biome, layer, count);
  const hills = shapes.filter((s): s is Hill => s.kind === "hill");
  const trees = shapes.filter((s): s is Tree => s.kind === "tree");
  const bushes = shapes.filter((s): s is Bush => s.kind === "bush");
  const id = `ormon-${biome}-${layer}`;
  return (
    <svg
      data-omil={LAYER_FACTOR[layer]}
      aria-hidden="true"
      className="ormon-layer absolute inset-x-0 top-0 w-full"
      style={{ height: `calc(100% + ${TILE}px)` }}
    >
      <defs>
        <filter id={`${id}-blur`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={LAYER_BLUR[layer]} />
        </filter>
      </defs>
      <g filter={`url(#${id}-blur)`}>
        <g id={`${id}-tile`}>
          {hills.map((h, i) => (
            <ellipse key={`h${i}`} cx={`${h.cx}%`} cy={h.cy} rx={h.rx} ry={h.ry} fill={fill} opacity="0.5" />
          ))}
          {trees.map((tr, i) => (
            <svg key={`t${i}`} x={`${tr.x}%`} y={tr.y} overflow="visible">
              <g transform={`scale(${tr.scale})`} opacity={tr.opacity}>
                <SoftTree crown={fill} trunk={p.near} />
              </g>
            </svg>
          ))}
          {bushes.length > 0 ? (
            <>
              <svg x="0" overflow="visible">
                {bushes
                  .filter((b) => b.side === "left")
                  .map((b, i) => (
                    <circle key={`l${i}`} cx={b.inset} cy={b.cy} r={b.r} fill={fill} opacity="0.85" />
                  ))}
              </svg>
              <svg x="100%" overflow="visible">
                {bushes
                  .filter((b) => b.side === "right")
                  .map((b, i) => (
                    <circle key={`r${i}`} cx={-b.inset} cy={b.cy} r={b.r} fill={fill} opacity="0.85" />
                  ))}
              </svg>
            </>
          ) : null}
        </g>
        {Array.from({ length: TILE_COPIES - 1 }, (_, i) => (
          <use key={i} href={`#${id}-tile`} y={TILE * (i + 1)} />
        ))}
      </g>
    </svg>
  );
});
