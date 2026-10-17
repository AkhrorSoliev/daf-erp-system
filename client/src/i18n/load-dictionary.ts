import type { UiLocale } from "./locales";
import type { Dictionary } from "./translate";

/**
 * The dictionary of a language, loaded on demand (one chunk per language, so a
 * reader of Uzbek downloads none). Uzbek needs none; Uzbek Cyrillic only the
 * overrides of the transliterator.
 */
export async function loadDictionary(locale: UiLocale): Promise<Dictionary> {
  switch (locale) {
    case "uz-Cyrl":
      return (await import("./dictionaries/uz-cyrl")).default;
    case "ru":
      return (await import("./dictionaries/ru")).default;
    case "de":
      return (await import("./dictionaries/de")).default;
    case "en":
      return (await import("./dictionaries/en")).default;
    default:
      return {};
  }
}
