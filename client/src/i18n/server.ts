import { cookies } from "next/headers";
import { getDictionary } from "./dictionary-cache";
import { LOCALE_COOKIE, localeOrDefault, type UiLocale } from "./locales";
import { translate, type Params } from "./translate";

/** The device's language from its cookie; Uzbek when there is none or it is unknown. */
export async function currentLocale(): Promise<UiLocale> {
  const store = await cookies();
  return localeOrDefault(store.get(LOCALE_COOKIE)?.value);
}

/**
 * `t` for server code that renders no component (a layout's `generateMetadata`):
 * the device language from the cookie, the same cached dictionary the provider reads.
 */
export async function serverTranslator(): Promise<(source: string, params?: Params) => string> {
  const locale = await currentLocale();
  const dictionary = await getDictionary(locale);
  return (source, params) => translate(locale, dictionary, source, params);
}
