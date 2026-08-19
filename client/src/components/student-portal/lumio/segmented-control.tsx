"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Icon-only: labels are dropped and become each button's aria-label. */
  compact?: boolean;
  className?: string;
}

// Pill track with a sliding white selected segment. Drives the Settings theme
// picker (Tizim / Yorug' / Qorong'i).
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  className,
}: SegmentedControlProps<T>) {
  const n = options.length || 1;
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div
      className={cn(
        "inset-well relative grid rounded-pill bg-sunk p-1.5",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
    >
      <span
        aria-hidden
        className="absolute bottom-1.5 top-1.5 rounded-pill bg-surface shadow-lumio-sm transition-[left] duration-200 ease-out"
        style={{
          left: `calc(${(idx * 100) / n}% + 6px)`,
          width: `calc(${100 / n}% - 12px)`,
        }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-label={compact ? o.label : undefined}
            aria-pressed={active}
            className={cn(
              "relative z-10 flex items-center justify-center font-display text-sm font-bold transition-colors",
              compact ? "h-8" : "h-10 gap-1.5",
              active ? "text-coral-600" : "text-ink-500",
            )}
          >
            {o.icon}
            {compact ? null : o.label}
          </button>
        );
      })}
    </div>
  );
}
