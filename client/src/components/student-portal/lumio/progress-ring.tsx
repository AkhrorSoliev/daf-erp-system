import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressRingProps {
  value: number;
  size?: number;
  stroke?: number;
  /** Wrapper text color drives the arc via `currentColor` (theme-adaptive). */
  className?: string;
  label?: React.ReactNode;
  sublabel?: React.ReactNode;
}

// Circular progress ring with a centered label. The arc uses `currentColor`
// (set a `text-*` class on the wrapper) so it adapts to light/dark and avoids
// the `hsl(var(--…))`-in-SVG pitfall; the track uses the sunk surface var.
export function ProgressRing({
  value,
  size = 96,
  stroke = 10,
  className,
  label,
  sublabel,
}: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const offset = c * (1 - pct / 100);
  return (
    <span
      className={cn("relative inline-flex text-coral-500", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--bg-sunk)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-extrabold leading-none text-ink-900" style={{ fontSize: size * 0.26 }}>
          {label ?? `${Math.round(pct)}%`}
        </span>
        {sublabel ? (
          <span className="mt-0.5 text-xs font-semibold text-ink-500">
            {sublabel}
          </span>
        ) : null}
      </span>
    </span>
  );
}
