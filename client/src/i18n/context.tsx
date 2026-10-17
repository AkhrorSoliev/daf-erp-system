"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { changeUiLocale, type LocaleState } from "./change-ui-locale";
import { bindDocumentLanguage } from "./document-language";
import { loadDictionary } from "./load-dictionary";
import { writeLocaleCookie } from "./locale-cookie";
import { DEFAULT_LOCALE, type UiLocale } from "./locales";
import { translate, type Dictionary, type Params } from "./translate";

interface SetLocaleOptions {
  /** false: the change came from the account, so do not write it back. Default true. */
  save?: boolean;
}

interface I18nValue extends LocaleState {
  setLocale(next: UiLocale, options?: SetLocaleOptions): Promise<boolean>;
}

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  dictionary: {},
  setLocale: async () => false,
});

/**
 * The page's interface language. The dashboard layout reads the device cookie on
 * the server and hands the language and its dictionary here, so the first paint
 * is already in the right language. `setLocale` switches without a reload.
 */
export function I18nProvider({
  initialLocale,
  initialDictionary,
  children,
}: {
  initialLocale: UiLocale;
  initialDictionary: Dictionary;
  children: ReactNode;
}) {
  const [state, setState] = useState<LocaleState>({ locale: initialLocale, dictionary: initialDictionary });
  // What the page holds right now. `apply` is its only writer, so a late render
  // never puts an older state over a newer one.
  const stateRef = useRef(state);

  // The cleanup puts "uz" back, so a client navigation out of the dashboard
  // group (the staff Mini App signing out to /tg) keeps no stale language.
  useEffect(() => bindDocumentLanguage(document.documentElement, state.locale), [state.locale]);

  const setLocale = useCallback(
    (next: UiLocale, options?: SetLocaleOptions) =>
      changeUiLocale(next, {
        current: () => stateRef.current,
        load: loadDictionary,
        apply: (locale, dictionary) => {
          stateRef.current = { locale, dictionary };
          setState({ locale, dictionary });
          writeLocaleCookie(locale);
        },
        persist: async (locale) => {
          if (options?.save === false) return;
          const { user, patchUser } = useAuth.getState();
          if (!user) return;
          await api.patch("/users/ui-locale", { locale });
          // A newer pick may have taken the page while this save was in flight;
          // its own answer will write the account.
          if (stateRef.current.locale === locale) patchUser({ uiLocale: locale });
        },
        fail: (error, stage) =>
          toast.error(
            stage === "load"
              ? "Tilni yuklab bo'lmadi"
              : getErrorMessage(error, "Tilni saqlab bo'lmadi"),
          ),
      }),
    [],
  );

  const value = useMemo(() => ({ ...state, setLocale }), [state, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `t("Uzbek text", { n: 5 })` in the page's language; the Uzbek text when it has no translation. */
export function useT(): (source: string, params?: Params) => string {
  const { locale, dictionary } = useContext(I18nContext);
  return useCallback((source: string, params?: Params) => translate(locale, dictionary, source, params), [locale, dictionary]);
}

export function useLocale(): { locale: UiLocale; setLocale: I18nValue["setLocale"] } {
  const { locale, setLocale } = useContext(I18nContext);
  return { locale, setLocale };
}
