import { interpolate, type Params } from "@/i18n/translate";

/** The page's `t` from `useT()`; without it the Uzbek source is read as written. */
type Translate = (source: string, params?: Params) => string;

/**
 * «N daqiqa kechikdi» — the minutes the server recorded when an
 * administrator marked a student present after the lesson's first save
 * (ADR-0048). Null when nothing was recorded.
 */
export function lateMinutesText(
  minutes: number | null | undefined,
  t: Translate = interpolate,
): string | null {
  return minutes && minutes > 0 ? t("{n} daqiqa kechikdi", { n: minutes }) : null;
}
