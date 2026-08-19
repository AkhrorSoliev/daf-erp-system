import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionProps {
  /** Caps eyebrow above the group, e.g. "Mavzu". Omit for an unlabelled group. */
  title?: string;
  children: React.ReactNode;
  className?: string;
}

// A labelled group of rows or cards. The caps eyebrow is the web twin of the
// student-app's `<Text variant="caps">` section header, so a settings screen
// reads as grouped settings instead of a flat stack of unrelated cards.
export function Section({ title, children, className }: SectionProps) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      {title ? (
        <h2 className="px-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-ink-500">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
