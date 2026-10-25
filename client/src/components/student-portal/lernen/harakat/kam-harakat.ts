/** Device setting: "reduce motion" chosen by the student (ADR-0125). */
export const HARAKAT_KALITI = "daf.lernen.harakat";

/** Same-tab signal sent by `harakatniSaqla`; `useKamHarakat` listens to it next to `storage`. */
export const HARAKAT_OZGARDI = "daf-lernen-harakat";

/** The system "reduce motion" media query, shared by the decision and the hook. */
export const KAM_HARAKAT_MEDIA = "(prefers-reduced-motion: reduce)";

/** `true` = the student asked for less motion, `false` = chose full, `null` = never chose. */
export function qurilmaHarakatSozlamasi(): boolean | null {
  try {
    const v = localStorage.getItem(HARAKAT_KALITI);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function harakatniSaqla(kam: boolean): void {
  try {
    localStorage.setItem(HARAKAT_KALITI, kam ? "1" : "0");
    // The `storage` event fires only in OTHER tabs, so tell this tab's mounted hooks ourselves.
    if (typeof window !== "undefined") window.dispatchEvent(new Event(HARAKAT_OZGARDI));
  } catch {
    /* the choice is just not remembered */
  }
}

/**
 * Whether to reduce motion. The system setting can never be overridden to MORE
 * motion: a student who asked their phone for less must not get a parallax
 * because they once ticked the app's switch off.
 */
export function kamHarakatQarori(qurilma: boolean | null, tizim: boolean): boolean {
  return qurilma === true || tizim;
}

/** Weak-device fallback: fewer layers and ambient elements (spec §9). */
export function yengilRejimmi(q: { yadro?: number; xotira?: number }): boolean {
  return (q.yadro != null && q.yadro <= 4) || (q.xotira != null && q.xotira <= 2);
}

/** Reads the browser; safe to call during an effect, not during render on the server. */
export function kamHarakatHozir(): boolean {
  try {
    const tizim = window.matchMedia(KAM_HARAKAT_MEDIA).matches;
    return kamHarakatQarori(qurilmaHarakatSozlamasi(), tizim);
  } catch {
    return false;
  }
}
