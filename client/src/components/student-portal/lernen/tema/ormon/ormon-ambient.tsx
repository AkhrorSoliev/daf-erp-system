import type * as React from "react";
import type { ScenePlan } from "./ormon-sahna-rejasi";
import { leafSpecs, mistSpecs, sparkSpecs } from "./ormon-shakllar";

/** Inline style with the custom properties the CSS animations read (`--ormon-*`). */
const vars = (o: Record<string, string>) => o as React.CSSProperties;

/**
 * The scene's moving light (ormon2.html `.rays`, `.mist`, `.ff`, `.leaf`):
 * the light shafts and the mist always (held still under «Kam harakat»), the
 * fireflies and the falling leaves only as many as the plan allows. globals.css
 * moves them with transform and opacity only.
 */
export function OrmonAmbient({ plan, glow }: { plan: ScenePlan; glow: string }) {
  return (
    <div className="absolute inset-0" style={vars({ "--ormon-glow": glow })}>
      <div className="ormon-rays" />
      {mistSpecs(plan.mists).map((m, i) => (
        <div key={`m${i}`} className="ormon-mist" style={{ top: `${m.top}%`, animationDelay: `-${m.delay}s` }} />
      ))}
      {sparkSpecs(plan.sparks).map((s, i) => (
        <span
          key={`s${i}`}
          className="ormon-spark"
          style={vars({
            left: `${s.left}%`,
            top: `${s.top}%`,
            "--ormon-dx": `${s.dx}px`,
            "--ormon-dy": `${s.dy}px`,
            "--ormon-t": `${s.drift}s`,
            "--ormon-b": `${s.blink}s`,
          })}
        />
      ))}
      {leafSpecs(plan.leaves).map((l, i) => (
        <svg
          key={`l${i}`}
          className="ormon-leaf"
          viewBox="0 0 16 16"
          aria-hidden="true"
          style={vars({ left: `${l.left}%`, "--ormon-t": `${l.fall}s`, animationDelay: `-${l.delay}s` })}
        >
          <path d="M8 1C3 4 2 10 8 15c6-5 5-11 0-14z" fill="#d9a441" />
        </svg>
      ))}
    </div>
  );
}
