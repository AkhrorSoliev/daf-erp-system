"use client";

import { CaretDown, Check, Translate } from "@phosphor-icons/react";
import { useLocale, useT } from "@/i18n/use-t";
import { LOCALES, isUiLocale, type UiLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

type SetLocale = (next: UiLocale, options?: { save?: boolean }) => Promise<boolean>;

/**
 * The only way the portal changes its language. A student has no account
 * language (`PATCH /users/ui-locale` is a staff route), so the pick lives on
 * the device alone: the cookie, never a save.
 */
export function pickPortalLocale(next: string, current: UiLocale, setLocale: SetLocale): void {
  if (!isUiLocale(next) || next === current) return;
  void setLocale(next, { save: false });
}

export interface LanguagePickerProps {
  /** "list" — a row per language (Settings), "compact" — a small menu (sign-in page). */
  variant?: "list" | "compact";
  className?: string;
}

// The portal's language picker (Lumio twin of `LanguageRadioGroup`). Each name
// is written in its own language and carries its own `lang` (WCAG 3.1.2).
export function LanguagePicker({ variant = "list", className }: LanguagePickerProps) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const pick = (next: string) => pickPortalLocale(next, locale, setLocale);

  if (variant === "compact") {
    // A native select: on a phone it opens the system's own list.
    return (
      <span className={cn("relative inline-flex items-center", className)}>
        <Translate size={16} weight="bold" aria-hidden className="pointer-events-none absolute left-3 text-ink-500" />
        <select
          aria-label={t("Til")}
          value={locale}
          onChange={(e) => pick(e.target.value)}
          className="h-9 appearance-none rounded-pill border border-line bg-surface pl-9 pr-8 font-display text-sm font-bold text-ink-700 shadow-lumio-sm outline-none focus-visible:ring-4 focus-visible:ring-coral-500/30"
        >
          {LOCALES.map(({ id, label }) => (
            <option key={id} value={id} lang={id}>
              {label}
            </option>
          ))}
        </select>
        <CaretDown size={12} weight="bold" aria-hidden className="pointer-events-none absolute right-3 text-ink-500" />
      </span>
    );
  }

  return (
    <div role="radiogroup" aria-label={t("Til")} className={cn("inset-well flex flex-col gap-1 rounded-[22px] bg-sunk p-1.5", className)}>
      {LOCALES.map(({ id, label }) => {
        const active = id === locale;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            lang={id}
            onClick={() => pick(id)}
            className={cn(
              "flex h-11 items-center justify-between rounded-pill px-4 font-display text-base font-bold transition-colors",
              active ? "bg-surface text-coral-600 shadow-lumio-sm" : "text-ink-500 hover:text-ink-700",
            )}
          >
            {label}
            {active ? <Check size={18} weight="bold" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
