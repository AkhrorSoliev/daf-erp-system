import { toCyrillic } from "./translit-cyrl";
import type { UiLocale } from "./locales";

/** Uzbek source text → text in the dictionary's language. */
export type Dictionary = Readonly<Record<string, string>>;

export type Params = Record<string, string | number>;

/** Fills `{name}` placeholders from `params`; an unknown placeholder stays as written. */
export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/**
 * The text for `source` in `locale`. Uzbek is the source itself; Uzbek Cyrillic
 * is derived from it unless the dictionary holds an override; ru, de and en read
 * their dictionary. A missing translation shows the Uzbek source, so a page that
 * is not translated yet still works.
 */
export function translate(locale: UiLocale, dictionary: Dictionary, source: string, params?: Params): string {
  let text: string;
  if (locale === "uz") text = source;
  else if (locale === "uz-Cyrl") text = dictionary[source] ?? toCyrillic(source);
  else text = dictionary[source] ?? source;
  return interpolate(text, params);
}
