import { anyMediaPlaying } from "../../lib/media-registry";
import { ovozChalinsinmi, type OvozHodisa } from "./ovoz-qoidalari";
import { ovozYoqilganmi } from "./ovoz-sozlama";

export type { OvozHodisa } from "./ovoz-qoidalari";

/**
 * Plays one Ta'lim effect. Never throws and never blocks: Web Audio can be
 * missing or silent (the Telegram Mini App WebView), and a sound must never
 * break a lesson.
 */
export function ovozChal(hodisa: OvozHodisa): void {
  try {
    if (typeof window === "undefined") return;
    if (!ovozChalinsinmi({ yoqilgan: ovozYoqilganmi(), ijroEtilmoqda: anyMediaPlaying(), hodisa })) return;
    void import("./ovoz-motor").then((m) => m.motorChal(hodisa)).catch(() => {});
  } catch {
    /* silent by design */
  }
}

/** Call from a first tap so the browser lets the context start. */
export function ovozniUygot(): void {
  try {
    if (typeof window === "undefined") return;
    void import("./ovoz-motor").then((m) => m.motorniUygot()).catch(() => {});
  } catch {
    /* silent by design */
  }
}
