"use client";

import { ChevronDown, Languages } from "lucide-react";
import { LanguageRadioGroup } from "@/components/language-radio-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocale, useT } from "@/i18n/context";
import { LOCALES } from "@/i18n/locales";

/**
 * The sign-in page's language picker (ADR-0106): the current language's own
 * name on the button, the five languages in a radio list. Nobody is signed in,
 * so a pick only changes the page and the device cookie.
 */
export function LanguageMenu() {
  const t = useT();
  const { locale } = useLocale();
  const current = LOCALES.find((l) => l.id === locale);
  const name = current?.label ?? locale;
  const til = t("Til");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The accessible name contains the visible text (WCAG 2.5.3). */}
        <button
          type="button"
          aria-label={`${til}: ${name}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Languages className="size-4" aria-hidden />
          <span lang={locale}>{name}</span>
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <LanguageRadioGroup />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
