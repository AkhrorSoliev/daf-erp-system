import { WEEK_DAYS, type WeekDay } from './center-activity.types';
import type { RoomResult } from './center-metrics';
import { toMinutes } from './center-points';

export type HeatTone = 'green' | 'light' | 'yellow' | 'red';
export interface HeatCell {
  free: number;
  tone: HeatTone;
}
export interface Heat {
  rooms: number;
  days: WeekDay[];
  hours: number[];
  /** [dayIndex][hourIndex] */
  cells: HeatCell[][];
}

/** Colour by the share of rooms that are free (mock-up: 7–9 / 4–6 / 2–3 / 0–1 of 9). */
export function heatTone(free: number, rooms: number): HeatTone {
  const share = rooms > 0 ? free / rooms : 0;
  if (share >= 0.75) return 'green';
  if (share >= 0.4) return 'light';
  if (share >= 0.15) return 'yellow';
  return 'red';
}

/**
 * Free rooms per weekday and whole hour for ONE branch's rooms (they share a
 * working window). A room is busy in an hour when either of its two half-hour
 * slots holds a lesson. Hours are the whole ones inside the window, so a
 * 22:00–22:30 stub is not a column.
 */
export function buildHeat(rooms: RoomResult[]): Heat {
  if (rooms.length === 0)
    return { rooms: 0, days: [...WEEK_DAYS], hours: [], cells: [] };
  const w = rooms[0].window;
  const hours: number[] = [];
  for (
    let h = Math.ceil(toMinutes(w.start) / 60);
    (h + 1) * 60 <= toMinutes(w.end);
    h++
  ) {
    hours.push(h);
  }
  const cells = WEEK_DAYS.map((day) =>
    hours.map((h) => {
      const busy = rooms.filter(
        (r) => r.slots[day].has(h * 2) || r.slots[day].has(h * 2 + 1),
      ).length;
      const free = rooms.length - busy;
      return { free, tone: heatTone(free, rooms.length) };
    }),
  );
  return { rooms: rooms.length, days: [...WEEK_DAYS], hours, cells };
}
