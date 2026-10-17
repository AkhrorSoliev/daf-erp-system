"use client";

// The read side of the language context. It imports nothing heavy (no api,
// auth store or toast), so a page without a login (the public form) can use
// `useT` through `ui/date-picker.tsx` without pulling those into its bundle.
import { createContext, useCallback, useContext } from "react";
import type { LocaleState } from "./change-ui-locale";
import { DEFAULT_LOCALE, type UiLocale } from "./locales";
import { translate, type Params } from "./translate";

export interface SetLocaleOptions {
  /** false: the change came from the account, so do not write it back. Default true. */
  save?: boolean;
}

export interface I18nValue extends LocaleState {
  setLocale(next: UiLocale, options?: SetLocaleOptions): Promise<boolean>;
}

export const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  dictionary: {},
  setLocale: async () => false,
});

/** `t("Uzbek text", { n: 5 })` in the page's language; the Uzbek text when it has no translation. */
export function useT(): (source: string, params?: Params) => string {
  const { locale, dictionary } = useContext(I18nContext);
  return useCallback((source: string, params?: Params) => translate(locale, dictionary, source, params), [locale, dictionary]);
}

export function useLocale(): { locale: UiLocale; setLocale: I18nValue["setLocale"] } {
  const { locale, setLocale } = useContext(I18nContext);
  return { locale, setLocale };
}
