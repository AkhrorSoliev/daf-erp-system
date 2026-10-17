/**
 * The staff portals' interface languages (ADR-0098). The ids mirror
 * `server/src/common/ui-locales.ts` (locales.test.ts compares them); a label is
 * always written in its own language, so a person finds theirs in any language.
 */
export const LOCALES = [
  { id: "uz", label: "O'zbekcha" },
  { id: "uz-Cyrl", label: "Ўзбекча" },
  { id: "ru", label: "Русский" },
  { id: "de", label: "Deutsch" },
  { id: "en", label: "English" },
] as const;

export type UiLocale = (typeof LOCALES)[number]["id"];

export const LOCALE_IDS: readonly UiLocale[] = LOCALES.map((l) => l.id);

export const DEFAULT_LOCALE: UiLocale = "uz";

/** The device's language, readable by the server layout and by the browser. */
export const LOCALE_COOKIE = "daf-locale";

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === "string" && (LOCALE_IDS as readonly string[]).includes(value);
}

export function localeOrDefault(value: unknown): UiLocale {
  return isUiLocale(value) ? value : DEFAULT_LOCALE;
}
