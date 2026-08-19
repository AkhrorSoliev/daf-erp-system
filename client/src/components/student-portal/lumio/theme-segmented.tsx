"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Desktop, Sun, Moon } from "./icon";
import { SegmentedControl, type SegmentOption } from "./segmented-control";

export type ThemeMode = "system" | "light" | "dark";

// The portal's single source of truth for the theme choice. Rendered with
// labels on the Settings screen and icon-only in the desktop rail footer, so
// both places drive `next-themes` through the same three-way pick instead of
// the old cycle-button / segmented-control split.
const THEME_OPTIONS: SegmentOption<ThemeMode>[] = [
  { value: "system", label: "Tizim", icon: <Desktop size={16} weight="bold" /> },
  { value: "light", label: "Yorug'", icon: <Sun size={16} weight="bold" /> },
  { value: "dark", label: "Qorong'i", icon: <Moon size={16} weight="bold" /> },
];

export interface ThemeSegmentedProps {
  /** "full" — labelled (Settings), "compact" — icon-only (rail footer). */
  variant?: "full" | "compact";
  /** Stacked instead of side-by-side — for the collapsed 72px rail. */
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function ThemeSegmented({
  variant = "full",
  orientation = "horizontal",
  className,
}: ThemeSegmentedProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const compact = variant === "compact";
  const vertical = orientation === "vertical";

  // `theme` is undefined until next-themes has read localStorage. Rendering the
  // control before that would both mismatch hydration and flash the wrong
  // segment, so hold a same-size placeholder: track padding (2 x 6px) plus the
  // button height — 52px full, 44px compact, 108px stacked (3 x 32px + 12px).
  if (!mounted) {
    return (
      <div
        aria-hidden
        className={cn(
          "rounded-pill bg-sunk",
          vertical ? "h-[108px]" : compact ? "h-[44px]" : "h-[52px]",
          className,
        )}
      />
    );
  }

  return (
    <SegmentedControl<ThemeMode>
      options={THEME_OPTIONS}
      value={(theme as ThemeMode) ?? "system"}
      onChange={setTheme}
      compact={compact}
      orientation={orientation}
      className={className}
    />
  );
}
