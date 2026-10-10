import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Tone } from "./salary-page-model";

// A tinted background carries the tone and the text stays the theme's own
// colour, so the pill reads in both themes without per-theme overrides.
const TONE: Record<Tone, string> = {
  muted: "bg-muted text-muted-foreground",
  amber: "bg-amber-500/15 text-foreground",
  blue: "bg-blue-500/15 text-foreground",
  green: "bg-green-500/15 text-foreground",
};

/** The month-state pill and the «Holat» cell. */
export function SalaryToneBadge({
  tone,
  className,
  children,
}: {
  tone: Tone;
  className?: string;
  children: ReactNode;
}) {
  return <Badge className={cn("font-normal", TONE[tone], className)}>{children}</Badge>;
}
