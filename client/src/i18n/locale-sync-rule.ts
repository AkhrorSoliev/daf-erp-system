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

/**
 * One run of the sync effect. The decision is made ONCE per account value
 * (`handledKey` is that value): the person's own pick switches the page before
 * the save is answered, while the account still holds the old language, and a
 * key that included the device's language would read that as a new case and
 * fight the pick (a second save, or a flip back). Pass the returned `handledKey`
 * into the next run. Signed out: nothing to do, and nothing is remembered.
 */
export function localeSyncStep(input: {
  signedIn: boolean;
  accountLocale: string | null | undefined;
  deviceLocale: UiLocale;
  handledKey: string | null;
}): { action: LocaleSyncAction; handledKey: string | null } {
  const { signedIn, accountLocale, deviceLocale, handledKey } = input;
  if (!signedIn) return { action: { kind: "none" }, handledKey: null };
  const key = accountLocale ?? "none";
  if (handledKey === key) return { action: { kind: "none" }, handledKey: key };
  return { action: localeSyncAction({ accountLocale, deviceLocale }), handledKey: key };
}
