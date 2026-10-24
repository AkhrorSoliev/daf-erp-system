import { LOCALE_COOKIE, type UiLocale } from "./locales";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Remember the device's language (read by the dashboard layout on the server). */
export function writeLocaleCookie(locale: UiLocale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
