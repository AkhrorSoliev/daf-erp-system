"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CaretLeft } from "@phosphor-icons/react";

// Vertical page container — stacks sections with the Lumio gap.
export function Screen({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-4", className)} {...rest}>
      {children}
    </div>
  );
}

export interface ScreenHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

// Large screen title with an optional eyebrow subtitle and a right slot.
export function ScreenHeader({
  title,
  subtitle,
  right,
  className,
}: ScreenHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {subtitle ? (
          <p className="text-sm font-bold text-ink-500">{subtitle}</p>
        ) : null}
        <h1 className="truncate font-display text-[27px] font-extrabold leading-tight text-ink-900">
          {title}
        </h1>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export interface StackHeaderProps {
  title: React.ReactNode;
  right?: React.ReactNode;
  /** Fallback route if there's no history to go back to. */
  backHref?: string;
  className?: string;
}

// Sub-page header with a back chevron. Used by pushed detail screens.
export function StackHeader({
  title,
  right,
  backHref = "/portal",
  className,
}: StackHeaderProps) {
  const router = useRouter();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        aria-label="Orqaga"
        onClick={() => {
          if (window.history.length > 1) router.back();
          else router.push(backHref);
        }}
        className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink-900 shadow-lumio-sm transition-colors hover:bg-tint"
      >
        <CaretLeft size={20} weight="bold" />
      </button>
      <h1 className="min-w-0 flex-1 truncate font-display text-[22px] font-extrabold text-ink-900">
        {title}
      </h1>
      {right}
    </div>
  );
}
