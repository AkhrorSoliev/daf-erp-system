import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatChipProps {
  icon: React.ReactNode;
  value: React.ReactNode;
  label?: string;
  className?: string;
}

// White rounded capsule: colored icon + Baloo value (+ optional label). Used
// for quick stats on the home dashboard.
export function StatChip({ icon, value, label, className }: StatChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1.5 shadow-lumio-sm",
        className,
      )}
    >
      <span className="inline-flex text-xl">{icon}</span>
      <span className="font-display text-base font-extrabold leading-none text-ink-900">
        {value}
      </span>
      {label ? (
        <span className="text-sm font-semibold text-ink-500">{label}</span>
      ) : null}
    </span>
  );
}
