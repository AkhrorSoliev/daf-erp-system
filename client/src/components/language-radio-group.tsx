"use client";

import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { useLocale } from "@/i18n/context";
import { LOCALES, type UiLocale } from "@/i18n/locales";

/**
 * The five languages as a radio group for a dropdown menu: the «Til» submenu of
 * the user menu and the sign-in page's language menu. Each name is written in
 * its own language, and `lang` makes a screen reader speak it with that voice
 * (WCAG 3.1.2).
 */
export function LanguageRadioGroup() {
  const { locale, setLocale } = useLocale();
  return (
    <DropdownMenuRadioGroup
      value={locale}
      onValueChange={(value) => {
        if (value !== locale) void setLocale(value as UiLocale);
      }}
    >
      {LOCALES.map(({ id, label }) => (
        <DropdownMenuRadioItem key={id} value={id} lang={id}>
          {label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
