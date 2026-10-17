import { DEFAULT_LOCALE, isUiLocale, type UiLocale } from "./locales";

export type LocaleSyncAction =
  | { kind: "none" }
  | { kind: "adopt-account"; locale: UiLocale }
  | { kind: "save-device"; locale: UiLocale };

/**
 * What to do once a signed-in user's language is known: the account wins over
 * the device (a language chosen on another device follows the person here); an
 * account that never chose one takes the device's language once, unless that is
 * just the default.
 */
export function localeSyncAction(input: {
  accountLocale: string | null | undefined;
  deviceLocale: UiLocale;
}): LocaleSyncAction {
  const { accountLocale, deviceLocale } = input;
  if (isUiLocale(accountLocale)) {
    return accountLocale === deviceLocale ? { kind: "none" } : { kind: "adopt-account", locale: accountLocale };
  }
  return deviceLocale === DEFAULT_LOCALE ? { kind: "none" } : { kind: "save-device", locale: deviceLocale };
}
