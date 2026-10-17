import { cookies } from "next/headers";
import { LOCALE_COOKIE, localeOrDefault, type UiLocale } from "./locales";

/** The device's language from its cookie; Uzbek when there is none or it is unknown. */
export async function currentLocale(): Promise<UiLocale> {
  const store = await cookies();
  return localeOrDefault(store.get(LOCALE_COOKIE)?.value);
}
