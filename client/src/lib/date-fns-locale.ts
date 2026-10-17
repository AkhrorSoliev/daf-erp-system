import type { Locale } from "date-fns";
import { de } from "date-fns/locale/de";
import { enUS } from "date-fns/locale/en-US";
import { ru } from "date-fns/locale/ru";
import { uz } from "date-fns/locale/uz";
import { uzCyrl } from "date-fns/locale/uz-Cyrl";
import type { UiLocale } from "@/i18n/locales";

const BY_LOCALE: Record<UiLocale, Locale> = {
  uz,
  "uz-Cyrl": uzCyrl,
  ru,
  de,
  en: enUS,
};

/** The date-fns locale (month and weekday names) for the page's interface language. */
export function dateFnsLocale(locale: UiLocale): Locale {
  return BY_LOCALE[locale];
}
