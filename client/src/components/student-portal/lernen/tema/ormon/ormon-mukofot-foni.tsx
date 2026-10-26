import type { MukofotFoniProps } from "../tema-turlari";

/**
 * «O'rmon»: the reward stands in a forest clearing (ormon2.html `.rew`) — a
 * soft radial light, a hill at the bottom and, for a celebration, a slow
 * sunburst (`.ormon-burst`: rotation only, still under «Kam harakat»). The
 * colours are `.lumio` tokens — pale in light mode, deep in dark mode — so the
 * result's ink-900 heading and ink-600 line keep 4.5:1. The sound, the
 * confetti and Dafi are not the theme's.
 */
export function OrmonMukofotFoni({ bayram, children }: MukofotFoniProps) {
  return (
    <div
      data-mukofot="ormon"
      className="relative overflow-hidden rounded-[28px] px-4 py-6"
      style={{
        background: "radial-gradient(circle at 50% 30%, var(--ormon-mukofot-ust), var(--ormon-mukofot-ost) 75%)",
      }}
    >
      {bayram ? (
        <div
          aria-hidden
          className="ormon-burst pointer-events-none absolute size-[640px]"
          style={{
            left: "calc(50% - 320px)",
            top: "calc(30% - 320px)",
            background:
              "repeating-conic-gradient(from 0deg, var(--ormon-mukofot-nur) 0deg 10deg, transparent 10deg 30deg)",
            maskImage: "radial-gradient(closest-side, #000, transparent)",
            WebkitMaskImage: "radial-gradient(closest-side, #000, transparent)",
          }}
        />
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: "radial-gradient(ellipse at 50% 100%, var(--ormon-tepalik), transparent 70%)" }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
