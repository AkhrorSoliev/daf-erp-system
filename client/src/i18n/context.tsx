"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { changeUiLocale, type LocaleState } from "./change-ui-locale";
import { getDictionary, rememberDictionary } from "./dictionary-cache";
import { bindDocumentLanguage } from "./document-language";
import { loadDictionary } from "./load-dictionary";
import { writeLocaleCookie } from "./locale-cookie";
import type { UiLocale } from "./locales";
import type { Dictionary } from "./translate";
import { I18nContext, type SetLocaleOptions } from "./use-t";

// The readers live in ./use-t (no heavy imports); re-exported so callers and
// tests that use or mock `@/i18n/context` are unchanged.
export { useT, useLocale } from "./use-t";

/**
 * The page's interface language. The layout reads the device cookie on the
 * server and hands only the language here; the provider reads its dictionary
 * with `use()` from the cached chunk (`dictionary-cache.ts`). The server render
 * waits for it, so the first paint is already in the right language, and the
 * dictionary never travels in the page payload. `initialDictionary` (tests)
 * skips the load. `setLocale` switches without a reload.
 */
export function I18nProvider({
  initialLocale,
  initialDictionary,
  children,
}: {
  initialLocale: UiLocale;
  initialDictionary?: Dictionary;
  children: ReactNode;
}) {
  const dictionary = initialDictionary ?? use(getDictionary(initialLocale));
  const [state, setState] = useState<LocaleState>({ locale: initialLocale, dictionary });
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
          rememberDictionary(locale, dictionary);
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
