"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocale } from "./context";
import { localeSyncAction } from "./locale-sync-rule";

/**
 * Brings the page's language in line with the signed-in account (see
 * `localeSyncAction`). Runs once per account value, so a failed save does not
 * loop.
 */
export function LocaleSync() {
  const signedIn = useAuth((s) => s.user !== null);
  const accountLocale = useAuth((s) => s.user?.uiLocale);
  const { locale, setLocale } = useLocale();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    const key = `${accountLocale ?? "none"}|${locale}`;
    if (handled.current === key) return;
    handled.current = key;
    const action = localeSyncAction({ accountLocale, deviceLocale: locale });
    if (action.kind === "adopt-account") void setLocale(action.locale, { save: false });
    else if (action.kind === "save-device") void setLocale(action.locale);
  }, [signedIn, accountLocale, locale, setLocale]);

  return null;
}
