import * as React from "react";
import { cn } from "@/lib/utils";

type ClayTone = "neutral" | "coral" | "amber" | "teal" | "grape" | "sky";

const CLAY_CLASS: Record<ClayTone, string> = {
  neutral: "clay-white",
  coral: "clay-coral",
  amber: "clay-amber",
  teal: "clay-teal",
  grape: "clay-grape",
  sky: "clay-sky",
};

export interface LumioCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Extruded clay lip instead of the flat ambient card shadow. */
  clay?: boolean;
  /** Lip color when `clay`. */
  tone?: ClayTone;
  /** Padding preset. */
  pad?: "none" | "sm" | "md" | "lg";
}

const PAD: Record<NonNullable<LumioCardProps["pad"]>, string> = {
  none: "p-0",
  sm: "p-3.5",
  md: "p-5",
  lg: "p-6",
};

// Lumio Card — soft rounded surface, the base for everything. `clay` swaps the
// flat ambient shadow for the extruded bottom lip in the given tone.
export const Card = React.forwardRef<HTMLDivElement, LumioCardProps>(
  function Card(
    { className, clay = false, tone = "neutral", pad = "md", children, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-card bg-surface",
          PAD[pad],
          clay ? CLAY_CLASS[tone] : "border border-line shadow-lumio-card",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
