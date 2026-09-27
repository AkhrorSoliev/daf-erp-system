import { useSyncExternalStore } from "react";
import { isMiniAppSession } from "@/lib/telegram-mini-app";

// The flag only changes on a full navigation (`/tg` sets it), so there is
// nothing to subscribe to.
const noSubscription = () => () => {};

/**
 * Whether this tab is the Telegram Mini App (ADR-0040). `false` on the server
 * and during hydration, so server and client markup agree; the real value
 * arrives on the render after it.
 */
export function useIsMiniApp(): boolean {
  return useSyncExternalStore(noSubscription, isMiniAppSession, () => false);
}
