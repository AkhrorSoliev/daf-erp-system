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
  className?: string;
}

// The project's own `Select` (Radix) in the Lumio look. The list is portalled to
// <body>, outside the page's `.lumio` scope, so the `lumio` class goes on the
// content itself, as with the portal's dialogs.
export function SelectField<T extends string>({
  options,
  value,
  onChange,
  label,
  icon,
  className,
}: SelectFieldProps<T>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger
        aria-label={label}
        className={cn(
          "h-12 w-full gap-3 rounded-pill border-line bg-surface px-4 font-display text-base font-bold text-ink-900 shadow-lumio-sm focus-visible:border-line focus-visible:ring-4 focus-visible:ring-coral-500/30 dark:bg-surface dark:hover:bg-surface [&_svg]:text-ink-500",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          {icon ? (
            <span aria-hidden className="flex shrink-0 text-xl text-ink-500">
              {icon}
            </span>
          ) : null}
          <SelectValue />
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
