"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconTile } from "./icon-tile";
import type { LumioTone } from "./tones";

export interface SelectFieldOption<T extends string> {
  value: T;
  label: string;
  /** The option's own language (WCAG 3.1.2), e.g. a language name. */
  lang?: string;
}

export interface SelectFieldProps<T extends string> {
  options: readonly SelectFieldOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  icon?: React.ReactNode;
  /** Colour of the icon tile, as on `ListRow`. */
  tone?: LumioTone;
  className?: string;
}

// The project's own `Select` (Radix) drawn as a settings row: the trigger IS the
// card, the same size and look as `ListRow` (icon tile, bold value, chevron), so
// a dropdown does not read as a smaller, lesser control next to its neighbours.
// The list is portalled to <body>, outside the page's `.lumio` scope, so the
// `lumio` class goes on the content itself, as with the portal's dialogs.
export function SelectField<T extends string>({
  options,
  value,
  onChange,
  label,
  icon,
  tone = "grape",
  className,
}: SelectFieldProps<T>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          // `data-[size=default]:h-auto` beats the base trigger's fixed 36px height.
          "w-full gap-3.5 rounded-card border-line bg-surface px-4 py-3.5 shadow-lumio-sm transition-colors hover:bg-tint focus-visible:border-line focus-visible:ring-4 focus-visible:ring-coral-500/30 data-[size=default]:h-auto data-[size=default]:min-h-[79px] dark:bg-surface dark:hover:bg-tint [&>svg]:size-5 [&>svg]:text-ink-400",
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3.5">
          {icon ? (
            <IconTile icon={icon} tone={tone} className="[&_svg]:size-5" />
          ) : null}
          <span className="min-w-0 truncate font-display text-lg font-bold text-ink-900">
            <SelectValue />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent
        position="popper"
        sideOffset={6}
        className="lumio rounded-2xl border border-line bg-surface p-1.5 text-ink-900 shadow-lumio-card ring-0"
      >
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            lang={o.lang}
            className="min-h-11 rounded-xl py-2.5 pr-9 pl-3 font-display text-base font-bold text-ink-700 focus:bg-tint focus:text-ink-900 data-[state=checked]:text-coral-600"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
