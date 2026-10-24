import { isUiLocale, type UiLocale } from "./locales";

/**
 * The language the sign-in page must switch to once a person signs in, or null
 * to leave it. The account's language wins over the one picked on the page
 * (ADR-0106); an account that never chose (`null`) leaves the page's language,
 * which `LocaleSync` then saves onto the account (ADR-0102).
 */
export function localeToAdopt(accountLocale: unknown, current: UiLocale): UiLocale | null {
  if (!isUiLocale(accountLocale)) return null;
  return accountLocale === current ? null : accountLocale;
}

export interface AdoptDeps {
  /** The page's language right now. */
  current: UiLocale;
  setLocale(next: UiLocale, options?: { save?: boolean }): Promise<boolean>;
}

/**
 * Switch the page to the account's language (cookie included, nothing saved
 * back). Never throws: a failed switch must not hold the greeting back.
 */
export async function adoptAccountLocale(accountLocale: unknown, deps: AdoptDeps): Promise<boolean> {
  const target = localeToAdopt(accountLocale, deps.current);
  if (!target) return false;
  try {
    return await deps.setLocale(target, { save: false });
  } catch {
    return false;
  }
}
