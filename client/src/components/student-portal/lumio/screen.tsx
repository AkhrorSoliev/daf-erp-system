"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CaretLeft } from "@phosphor-icons/react";

export interface ScreenProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Caps the column at a comfortable reading width on desktop. The shell gives
   * every screen up to 980px; text-and-rows screens (Settings, Profile) look
   * stretched at that width, so they opt into a narrower column.
   */
  narrow?: boolean;
}

// Vertical page container — stacks sections with the Lumio gap.
export function Screen({
  className,
  narrow = false,
  children,
  ...rest
}: ScreenProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        narrow && "md:max-w-[600px]",
        className,
      )}
      {...rest}
    >
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
        // From md up the student navigates from the persistent side rail, and
        // `/portal/more` is not even on it — a back chevron there would push
        // them to a screen they never came from. Mobile keeps it.
        className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink-900 shadow-lumio-sm transition-colors hover:bg-tint md:hidden"
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
