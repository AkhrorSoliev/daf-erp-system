"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocale } from "./context";
import { localeSyncStep } from "./locale-sync-rule";

/**
 * Brings the page's language in line with the signed-in account (see
 * `localeSyncStep`). It decides once per account value: the effect depends on
 * the account, not on the page's language, so the person's own pick (which
 * switches the page before the save is answered) is never fought, and a failed
 * save does not loop.
 */
export function LocaleSync() {
  const signedIn = useAuth((s) => s.user !== null);
  const accountLocale = useAuth((s) => s.user?.uiLocale);
  const { locale, setLocale } = useLocale();
  // The page's language when the effect runs. Declared (so run) before the
  // sync effect, which reads it without depending on it.
  const deviceLocale = useRef(locale);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    deviceLocale.current = locale;
  }, [locale]);

  useEffect(() => {
    const step = localeSyncStep({
      signedIn,
      accountLocale,
      deviceLocale: deviceLocale.current,
      handledKey: handled.current,
    });
    handled.current = step.handledKey;
    if (step.action.kind === "adopt-account") void setLocale(step.action.locale, { save: false });
    else if (step.action.kind === "save-device") void setLocale(step.action.locale);
  }, [signedIn, accountLocale, setLocale]);

  return null;
}
