import * as React from "react";
import { cn } from "@/lib/utils";

export interface FadeInProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger index — each step delays the entrance by ~55ms. */
  index?: number;
}

// Staggered entrance wrapper. Sets the `--i` custom property consumed by the
// `.lumio-fade-up` animation in globals.css (respects prefers-reduced-motion).
export function FadeIn({ index = 0, className, style, children, ...rest }: FadeInProps) {
  return (
    <div
      className={cn("lumio-fade-up", className)}
      style={{ ["--i" as string]: index, ...style } as React.CSSProperties}
      {...rest}
    >
      {children}
    </div>
  );
}
