import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressSegment {
  value: number;
  /** Any CSS color (hex or `var(--…)`). */
  color: string;
}

export interface ProgressBarProps {
  /** Segmented mode (attendance: present/late/absent/excused). */
  segments?: ProgressSegment[];
  /** Single-fill mode (0–100). */
  value?: number;
  color?: string;
  height?: number;
  className?: string;
}

// Rounded inset track with rounded fill(s). Supply `segments` for a stacked
// attendance bar, or `value`+`color` for a single progress fill.
export function ProgressBar({
  segments,
  value = 0,
  color = "var(--coral-500)",
  height = 12,
  className,
}: ProgressBarProps) {
  const track = (
    <div
      className="inset-well flex w-full overflow-hidden rounded-pill bg-sunk"
      style={{ height }}
    >
      {segments ? (
        (() => {
          const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
          if (total <= 0) return null;
          return segments.map((seg, i) =>
            seg.value > 0 ? (
              <span
                key={i}
                className="h-full transition-[width] duration-300"
                style={{
                  width: `${(seg.value / total) * 100}%`,
                  backgroundColor: seg.color,
                }}
              />
            ) : null,
          );
        })()
      ) : (
        <span
          className="h-full rounded-pill transition-[width] duration-300"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            backgroundColor: color,
          }}
        />
      )}
    </div>
  );

  return <div className={cn("w-full", className)}>{track}</div>;
}
