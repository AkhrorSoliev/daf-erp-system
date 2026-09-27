"use client";

import Script from "next/script";
import { useIsMiniApp } from "@/hooks/use-is-mini-app";
import { TELEGRAM_WEB_APP_SCRIPT } from "@/lib/telegram-mini-app";

/**
 * Keeps `window.Telegram.WebApp` on every portal page of the Mini App
 * (ADR-0040) — the payment page opens Payme and Click through it.
 *
 * `/tg` loads Telegram's script and moves on to `/portal` without reloading
 * the page, so it is normally there already, and `next/script` never loads
 * one `src` twice. A reload inside the Mini App (Telegram's menu has one)
 * opens the portal page directly, without `/tg`: this loads the script again.
 * It takes its launch parameters back from `sessionStorage`, where it saved
 * them on the first load.
 */
export function MiniAppScript() {
  const inMiniApp = useIsMiniApp();
  if (!inMiniApp) return null;
  return <Script src={TELEGRAM_WEB_APP_SCRIPT} strategy="afterInteractive" />;
}
