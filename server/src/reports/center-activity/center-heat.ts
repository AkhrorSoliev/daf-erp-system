import { WEEK_DAYS, type WeekDay } from './center-activity.types';
import type { RoomResult } from './center-metrics';
import { toMinutes } from './center-points';

export type HeatTone = 'green' | 'light' | 'yellow' | 'red';
export interface HeatCell {
  free: number;
  tone: HeatTone;
  /**
   * The rooms that hold a lesson in this whole hour: `room` indexes
   * `Heat.roomList`, `groups` are the deduped names of the groups holding it.
   * The free rooms are the indices NOT listed here (`free` = roomList.length − busy.length).
   */
  busy: { room: number; groups: string[] }[];
}
export interface Heat {
  rooms: number;
  /** The branch's rooms, in the order the cells' `busy[].room` index them. */
  roomList: { id: string; name: string; capacity: number | null }[];
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
    return {
      rooms: 0,
      roomList: [],
      days: [...WEEK_DAYS],
      hours: [],
      cells: [],
    };
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
    hours.map((h): HeatCell => {
      const busy: HeatCell['busy'] = [];
      rooms.forEach((r, room) => {
        const first = r.slotGroups[day].get(h * 2);
        const second = r.slotGroups[day].get(h * 2 + 1);
        if (first || second)
          busy.push({
            room,
            groups: [...new Set([...(first ?? []), ...(second ?? [])])],
          });
      });
      const free = rooms.length - busy.length;
      return { free, tone: heatTone(free, rooms.length), busy };
    }),
  );
  return {
    rooms: rooms.length,
    roomList: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
    })),
    days: [...WEEK_DAYS],
    hours,
    cells,
  };
}
