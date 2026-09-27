"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsMiniApp } from "@/hooks/use-is-mini-app";
import { MINI_APP_ENTRY_PATH } from "@/lib/telegram-mini-app";

/**
 * Inside the Telegram Mini App the password form is never shown (ADR-0040):
 * sign-in there is Telegram's alone.
 *
 * A session that ends inside the Mini App — the refresh token expired, the
 * password was changed on another device — lands on `/login` like everywhere
 * else (the middleware and the API client both send it there). This sends it
 * back to `/tg`, which signs in through Telegram again, and covers the form
 * until the navigation happens.
 */
export function MiniAppLoginGuard() {
  const router = useRouter();
  const inMiniApp = useIsMiniApp();

  useEffect(() => {
    if (inMiniApp) router.replace(MINI_APP_ENTRY_PATH);
  }, [inMiniApp, router]);

  if (!inMiniApp) return null;
  return <div aria-hidden className="fixed inset-0 z-50 bg-background" />;
}
