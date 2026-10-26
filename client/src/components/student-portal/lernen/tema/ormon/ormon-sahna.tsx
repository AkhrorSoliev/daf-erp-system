"use client";

import * as React from "react";
import { useKamHarakat } from "../../harakat/use-kam-harakat";
import { useParallaks, useSahnaPauza, useYengilRejim } from "../../harakat/use-sahna";
import type { SahnaProps } from "../tema-turlari";
import { OrmonAmbient } from "./ormon-ambient";
import { BIOME_IDS, BIOMES, DARK_VEIL, biomeForUnit } from "./ormon-biom";
import { OrmonQatlam } from "./ormon-qatlam";
import { TILE, scenePlan, type ScenePlan } from "./ormon-sahna-rejasi";
import { glowSpecs } from "./ormon-shakllar";

export interface OrmonSahnaChizmaProps {
  unitTartibi: number;
  plan: ScenePlan;
  /** «Kam harakat»: marks the root, so the CSS stops every animation and the biome fade. */
  kam: boolean;
  /** The tab is hidden or the scene is off screen: the drifting decor holds still. */
  tinch: boolean;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Draws the «O'rmon» scene for a given plan — no hooks, so a test can render
 * any state. Three biome stacks (sky, glow orbs, the depth layers) stand on
 * the page and only the unit's biome shows (`data-faol`); the light, the
 * dark-mode veil and the vignette lie over them.
 */
export function OrmonSahnaChizma({ unitTartibi, plan, kam, tinch, ref }: OrmonSahnaChizmaProps) {
  const biome = biomeForUnit(unitTartibi);
  const glows = glowSpecs(plan.glows);
  return (
    <div
      ref={ref}
      data-sahna="ormon"
      data-kam-harakat={kam ? "" : undefined}
      data-tinch={tinch ? "" : undefined}
      className="absolute inset-0"
    >
      {BIOME_IDS.map((id) => {
        const p = BIOMES[id];
        return (
          <div key={id} data-biom={id} data-faol={id === biome ? "" : undefined} className="ormon-biome absolute inset-0">
            <div className="absolute inset-0" style={{ background: `linear-gradient(${p.sky1}, ${p.sky2})` }} />
            {glows.map((g, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${g.left}%`,
                  top: `${g.top}%`,
                  width: g.size,
                  height: g.size,
                  opacity: g.opacity,
                  background: `radial-gradient(closest-side, color-mix(in srgb, ${p.glow} 70%, transparent), transparent)`,
                }}
              />
            ))}
            {plan.layers.map((l) => (
              <OrmonQatlam key={l.id} biome={id} layer={l.id} count={l.count} />
            ))}
          </div>
        );
      })}
      <OrmonAmbient plan={plan} glow={BIOMES[biome].glow} />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{ background: DARK_VEIL.color, opacity: DARK_VEIL.alpha }}
      />
      <div className="ormon-vignette absolute inset-0" />
    </div>
  );
}

/**
 * «O'rmon»'s `Sahna` (spec §8, ADR-0131): three biomes by the unit, a scroll
 * parallax, fireflies, light shafts and mist. A weak device draws half,
 * «Kam harakat» a still picture, and it holds still while hidden.
 */
export function OrmonSahna({ unitTartibi }: SahnaProps) {
  const kam = useKamHarakat();
  const yengil = useYengilRejim();
  const ildiz = React.useRef<HTMLDivElement>(null);
  const tinch = useSahnaPauza(ildiz);
  const plan = React.useMemo(() => scenePlan({ reduced: kam, light: yengil }), [kam, yengil]);
  useParallaks(ildiz, {
    faol: plan.parallax && !tinch,
    tile: TILE,
    kalit: plan.layers.map((l) => `${l.id}${l.count}`).join(),
  });
  return <OrmonSahnaChizma ref={ildiz} unitTartibi={unitTartibi} plan={plan} kam={kam} tinch={tinch} />;
}
