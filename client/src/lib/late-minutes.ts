/**
 * «N daqiqa kechikdi» — the minutes the server recorded when an
 * administrator marked a student present after the lesson's first save
 * (ADR-0046). Null when nothing was recorded.
 */
export function lateMinutesText(minutes: number | null | undefined): string | null {
  return minutes && minutes > 0 ? `${minutes} daqiqa kechikdi` : null;
}
