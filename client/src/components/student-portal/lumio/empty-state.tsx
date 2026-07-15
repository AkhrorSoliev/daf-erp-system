import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  /** Actionable next step, per the project empty-state rule. */
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

// Centered empty/error state — icon in a sunk circle, title, an actionable
// description, and an optional action button.
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mb-1 inline-flex size-16 items-center justify-center rounded-full bg-sunk text-3xl text-ink-400">
        {icon}
      </span>
      <h3 className="font-display text-xl font-extrabold text-ink-900">
        {title}
      </h3>
      {description ? (
        <p className="max-w-xs text-sm font-semibold text-ink-500">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
