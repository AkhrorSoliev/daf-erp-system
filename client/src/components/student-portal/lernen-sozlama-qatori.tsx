"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "./lumio";

export interface SozlamaQatoriProps {
  icon: React.ReactNode;
  label: string;
  /** What the switch is now, drawn under the label («Yoqilgan» / «O'chiq»). */
  holat: string;
  yoqilgan: boolean;
  onToggle: () => void;
}

/**
 * A switch row: icon, name, «Yoqilgan» / «O'chiq» and the switch itself.
 */
export function SozlamaQatori({ icon, label, holat, yoqilgan, onToggle }: SozlamaQatoriProps) {
  return (
    <Card pad="sm" className="flex min-h-[79px] items-center">
      <button
        type="button"
        role="switch"
        aria-checked={yoqilgan}
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-2xl text-left"
      >
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sunk text-xl text-ink-700">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-extrabold text-ink-900">{label}</span>
          <span className="block text-xs font-semibold text-ink-500">{holat}</span>
        </span>
        <span
          aria-hidden
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-pill transition-colors",
            yoqilgan ? "bg-coral-500" : "bg-ink-500/30",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-6 rounded-full bg-white shadow-lumio-sm transition-[left] motion-reduce:transition-none",
              yoqilgan ? "left-[22px]" : "left-0.5",
            )}
          />
        </span>
      </button>
    </Card>
  );
}
