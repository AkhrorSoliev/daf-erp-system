import { WEEK_DAYS, type WeekDay } from './center-activity.types';
import type { Heat, HeatTone } from './center-heat';

export interface InsightSlot {
  days: WeekDay[];
  fromHour: number;
  /** Exclusive: 17 means up to 17:00. */
  toHour: number;
  freeMin: number;
  freeMax: number;
}
export interface HeatInsight {
  quiet: InsightSlot[];
  busy: InsightSlot | null;
}

/** Maximal runs of consecutive hours with `tone`, one list per weekday, merged across days that share the same run. */
function slotsOfTone(heat: Heat, tone: HeatTone): InsightSlot[] {
  const merged = new Map<string, InsightSlot>();
  heat.days.forEach((day, di) => {
    let hi = 0;
    while (hi < heat.hours.length) {
      if (heat.cells[di][hi].tone !== tone) {
        hi++;
        continue;
      }
      let end = hi;
      let min = Infinity;
      let max = -Infinity;
      while (end < heat.hours.length && heat.cells[di][end].tone === tone) {
        min = Math.min(min, heat.cells[di][end].free);
        max = Math.max(max, heat.cells[di][end].free);
        end++;
      }
      const key = `${heat.hours[hi]}-${heat.hours[end - 1] + 1}`;
      const found = merged.get(key);
      if (found) {
        found.days.push(day);
        found.freeMin = Math.min(found.freeMin, min);
        found.freeMax = Math.max(found.freeMax, max);
      } else {
        merged.set(key, {
          days: [day],
          fromHour: heat.hours[hi],
          toHour: heat.hours[end - 1] + 1,
          freeMin: min,
          freeMax: max,
        });
      }
      hi = end;
    }
  });
  const order = (d: WeekDay) => WEEK_DAYS.indexOf(d);
  for (const s of merged.values()) s.days.sort((a, b) => order(a) - order(b));
  return [...merged.values()];
}

const weight = (s: InsightSlot) => s.days.length * (s.toHour - s.fromHour);

/**
 * The quietest and the busiest times, for the sentence under the table: up to
 * two green stretches (widest across days and hours first, then the freest) and
 * the one red stretch that is widest, then the emptiest.
 */
export function heatInsight(heat: Heat): HeatInsight {
  if (heat.hours.length === 0) return { quiet: [], busy: null };
  const quiet = slotsOfTone(heat, 'green')
    .sort((a, b) => weight(b) - weight(a) || b.freeMin - a.freeMin)
    .slice(0, 2);
  const busy =
    slotsOfTone(heat, 'red').sort(
      (a, b) => weight(b) - weight(a) || a.freeMax - b.freeMax,
    )[0] ?? null;
  return { quiet, busy };
}
