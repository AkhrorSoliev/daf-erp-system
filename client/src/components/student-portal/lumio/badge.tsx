import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Lumio pill badge — status chips ("Keldi", "Tez orada", "Qarz"). Translucent
// tint of the tone color so it works in light and dark.
const lumioBadge = cva(
  "inline-flex items-center gap-1 rounded-pill font-display font-bold leading-none whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-ink-500/12 text-ink-700",
        coral: "bg-coral-500/12 text-coral-600",
        teal: "bg-teal-500/12 text-teal-600",
        amber: "bg-amber-500/15 text-amber-600",
        grape: "bg-grape-500/15 text-grape-500",
        sky: "bg-sky-500/12 text-sky-600",
        success: "bg-success/12 text-success",
        warning: "bg-warning/15 text-amber-600",
        danger: "bg-danger/12 text-danger",
      },
      size: {
        sm: "h-6 px-2 text-[11px]",
        md: "h-7 px-2.5 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof lumioBadge> {}

export function Badge({ className, tone, size, ...rest }: BadgeProps) {
  return <span className={cn(lumioBadge({ tone, size }), className)} {...rest} />;
}
