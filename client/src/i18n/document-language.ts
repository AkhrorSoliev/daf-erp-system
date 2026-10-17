import { DEFAULT_LOCALE, type UiLocale } from "./locales";

/**
 * Inline script for the dashboard layout: sets `<html lang>` while the page is
 * still being parsed, so the first paint (and a screen reader that reads it) is
 * not told "uz" over Russian text. The root layout's `<html>` has
 * `suppressHydrationWarning`, so React leaves the attribute alone. `locale` is
 * a `UiLocale` the layout got from `localeOrDefault`, i.e. one of the five ids,
 * so quoting it with `JSON.stringify` cannot carry anything else into the page.
 */
export const languageBootScript = (locale: UiLocale): string =>
  `document.documentElement.lang=${JSON.stringify(locale)}`;

/**
 * Put the page's language on `<html lang>`; the returned function puts the
 * default back. The effect that calls it hands that function to React as its
 * cleanup, so leaving the dashboard by a client navigation (the staff Mini App
 * signing out to /tg) does not leave a stale language behind, and a strict-mode
 * double run ends on the right language.
 */
export function bindDocumentLanguage(root: { lang: string }, locale: UiLocale): () => void {
  root.lang = locale;
  return () => {
    root.lang = DEFAULT_LOCALE;
  };
}
