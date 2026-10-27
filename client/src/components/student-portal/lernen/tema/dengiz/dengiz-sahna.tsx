"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useKamHarakat } from "../../harakat/use-kam-harakat";
import { useParallaks, useSahnaPauza, useYengilRejim } from "../../harakat/use-sahna";
import { TILE } from "../sahna-umumiy";
import type { SahnaProps } from "../tema-turlari";
import { Baliq, DECOR_GLYPH, DengizDevor, GLYPH_BOX } from "./dengiz-bezak";
import { SCHOOL_FISH, SWAY_DECOR, bubbleSpecs, dengizPlan, schoolSpecs, type DengizPlan } from "./dengiz-reja";
import { DARK_VEIL, ZONE_IDS, ZONES, zoneForUnit, type ZoneId } from "./dengiz-zona";

/** Inline style with the custom properties the CSS animations read (`--dengiz-*`). */
const vars = (o: Record<string, string | number>) => o as React.CSSProperties;

/** The far ridges on the sea floor, in a 100 × 100 box stretched over the lower part of the screen (dengiz.html `ridges`, without its blur). */
const RIDGE_BACK = "M0 55Q15 35 32 50T64 46T100 40V100H0Z";
const RIDGE_FRONT = "M0 78Q22 60 46 74T100 68V100H0Z";

/**
 * One zone: still water, still ridges, the two wall strips (the only layer
 * that moves with the scroll) and its swaying fronds at the bottom corners.
 * Only the unit's zone shows (`data-faol`); the others wait hidden for the
 * cross-fade.
 */
function DengizZona({ zona, faol, plan }: { zona: ZoneId; faol: boolean; plan: DengizPlan }) {
  const p = ZONES[zona];
  const Frond = DECOR_GLYPH[SWAY_DECOR[zona]];
  return (
    <div data-zona={zona} data-faol={faol ? "" : undefined} className="dengiz-zone absolute inset-0">
      <div className="absolute inset-0" style={{ background: `linear-gradient(${p.top}, ${p.mid} 45%, ${p.bottom})` }} />
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-2/5 w-full"
      >
        <path d={RIDGE_BACK} fill={p.ridge} opacity="0.35" />
        <path d={RIDGE_FRONT} fill={p.ridge} opacity="0.5" />
      </svg>
      <DengizDevor zona={zona} side="left" count={plan.decor} />
      <DengizDevor zona={zona} side="right" count={plan.decor} />
      {(["left", "right"] as const).slice(0, plan.sways).map((side, i) => (
        <svg
          key={side}
          aria-hidden="true"
          viewBox={GLYPH_BOX[SWAY_DECOR[zona]]}
          preserveAspectRatio="xMidYMax meet"
          className={cn("dengiz-sway absolute bottom-0 h-40 w-24", side === "left" ? "-left-4" : "-right-4")}
          style={vars({ "--dengiz-t": `${9 + i * 2}s` })}
        >
          <Frond color={p.decor[i % 2]} />
        </svg>
      ))}
    </div>
  );
}

/**
 * The water's moving life (dengiz.html `.rays`, `.bub`, `.school`): the light
 * shafts always (held still under «Kam harakat»), the bubbles and the fish
 * schools only as many as the plan allows, the fish in the shown zone's
 * colour. globals.css moves them with transform and opacity only.
 */
function DengizAmbient({ plan, fish }: { plan: DengizPlan; fish: string }) {
  return (
    <div className="absolute inset-0">
      <div className="dengiz-rays" />
      {bubbleSpecs(plan.bubbles).map((b, i) => (
        <span
          key={`b${i}`}
          className="dengiz-bubble"
          style={vars({
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            "--dengiz-t": `${b.rise}s`,
            "--dengiz-dx": `${b.dx}px`,
            animationDelay: `-${b.delay}s`,
          })}
        />
      ))}
      {schoolSpecs(plan.schools).map((s, i) => (
        <div
          key={`s${i}`}
          className="dengiz-school"
          data-chap={s.chap ? "" : undefined}
          style={vars({ top: `${s.top}%`, "--dengiz-t": `${s.swim}s`, animationDelay: `-${s.delay}s` })}
        >
          {SCHOOL_FISH.map((f, k) => (
            <Baliq key={k} color={fish} x={f.x} y={f.y} s={f.s} chap={s.chap} />
          ))}
        </div>
      ))}
    </div>
  );
}

export interface DengizSahnaChizmaProps {
  unitTartibi: number;
  plan: DengizPlan;
  /** «Kam harakat»: marks the root, so the CSS stops every animation and the zone fade. */
  kam: boolean;
  /** The tab is hidden or the scene is off screen: the drifting life holds still. */
  tinch: boolean;
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Draws the «Dengiz» scene for a given plan — no hooks, so a test can render
 * any state. Three zone stacks stand on the page and only the unit's zone
 * shows; the water's life and the dark-mode veil lie over them.
 */
export function DengizSahnaChizma({ unitTartibi, plan, kam, tinch, ref }: DengizSahnaChizmaProps) {
  const zona = zoneForUnit(unitTartibi);
  return (
    <div
      ref={ref}
      data-sahna="dengiz"
      data-kam-harakat={kam ? "" : undefined}
      data-tinch={tinch ? "" : undefined}
      className="absolute inset-0"
    >
      {ZONE_IDS.map((id) => (
        <DengizZona key={id} zona={id} faol={id === zona} plan={plan} />
      ))}
      <DengizAmbient plan={plan} fish={ZONES[zona].fish} />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{ background: DARK_VEIL.color, opacity: DARK_VEIL.alpha }}
      />
    </div>
  );
}

/**
 * «Dengiz»'s `Sahna` (spec §8, ADR-0133): a dive in three zones by the unit,
 * the walls following the scroll, bubbles, fish and swaying fronds. A weak
 * device draws about half, «Kam harakat» a still picture, and it holds still
 * while hidden.
 */
export function DengizSahna({ unitTartibi }: SahnaProps) {
  const kam = useKamHarakat();
  const yengil = useYengilRejim();
  const ildiz = React.useRef<HTMLDivElement>(null);
  const tinch = useSahnaPauza(ildiz);
  const plan = React.useMemo(() => dengizPlan({ reduced: kam, light: yengil }), [kam, yengil]);
  // The six strips are always drawn (only their decor count changes), so the list of moving layers never changes.
  useParallaks(ildiz, { faol: plan.parallax, tinch, tile: TILE, kalit: "devor" });
  return <DengizSahnaChizma ref={ildiz} unitTartibi={unitTartibi} plan={plan} kam={kam} tinch={tinch} />;
}
