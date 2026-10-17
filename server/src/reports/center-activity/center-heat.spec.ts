import { buildHeat, heatTone } from './center-heat';
import { heatInsight } from './heat-insight';
import type { RoomResult } from './center-metrics';
import { WEEK_DAYS, type WeekDay } from './center-activity.types';

const W = { start: '08:00', end: '22:30' };
const slots = (m: Partial<Record<WeekDay, number[]>> = {}) => {
  const out = {} as RoomResult['slots'];
  for (const d of WEEK_DAYS) out[d] = new Set(m[d] ?? []);
  return out;
};
const room = (
  id: string,
  m: Partial<Record<WeekDay, number[]>> = {},
): RoomResult => ({
  id,
  name: id,
  branchId: 1,
  branchName: 'F',
  capacity: 16,
  groupCount: 1,
  lessonHours: 0,
  workHours: 87,
  occupancyPct: 0,
  window: W,
  slots: slots(m),
});

describe('heatTone', () => {
  it('matches the mock-up for 9 rooms: 7–9 / 4–6 / 2–3 / 0–1 free', () => {
    expect([9, 7].map((f) => heatTone(f, 9))).toEqual(['green', 'green']);
    expect([6, 4].map((f) => heatTone(f, 9))).toEqual(['light', 'light']);
    expect([3, 2].map((f) => heatTone(f, 9))).toEqual(['yellow', 'yellow']);
    expect([1, 0].map((f) => heatTone(f, 9))).toEqual(['red', 'red']);
  });
});

describe('buildHeat', () => {
  it('lists whole hours inside the window (08..21 for 08:00–22:30)', () => {
    const h = buildHeat([room('a')]);
    expect(h.days).toEqual([...WEEK_DAYS]);
    expect(h.hours[0]).toBe(8);
    expect(h.hours[h.hours.length - 1]).toBe(21);
    expect(h.rooms).toBe(1);
  });

  it('a room is busy in an hour when any half of it holds a lesson', () => {
    // Monday 10:30–11:00 = slot 21 → busy for hour 10 only
    const h = buildHeat([room('a', { monday: [21] }), room('b')]);
    const at = (day: WeekDay, hour: number) =>
      h.cells[WEEK_DAYS.indexOf(day)][h.hours.indexOf(hour)];
    expect(at('monday', 10).free).toBe(1);
    expect(at('monday', 11).free).toBe(2);
    expect(at('tuesday', 10).free).toBe(2);
  });

  it('no rooms gives an empty matrix', () => {
    expect(buildHeat([]).hours).toEqual([]);
  });
});

describe('heatInsight', () => {
  it('finds the quiet evening of the days that share it and the busiest afternoon', () => {
    // 9 rooms; Mon/Wed/Fri busy 15:00–17:00 with 8 rooms (1 free); Tue/Thu/Sat free
    const rooms = Array.from({ length: 9 }, (_, i) =>
      room(
        `r${i}`,
        i < 8
          ? {
              monday: [30, 31, 32, 33],
              wednesday: [30, 31, 32, 33],
              friday: [30, 31, 32, 33],
            }
          : {},
      ),
    );
    const ins = heatInsight(buildHeat(rooms));
    expect(ins.busy).toEqual({
      days: ['monday', 'wednesday', 'friday'],
      fromHour: 15,
      toHour: 17,
      freeMin: 1,
      freeMax: 1,
    });
    expect(ins.quiet[0].days).toContain('tuesday');
    expect(ins.quiet.length).toBeLessThanOrEqual(2);
  });

  it('an empty matrix has nothing to say', () => {
    expect(heatInsight(buildHeat([]))).toEqual({ quiet: [], busy: null });
  });
});
