import { buildHeat, heatTone } from './center-heat';
import { heatInsight } from './heat-insight';
import type { RoomResult } from './center-metrics';
import { WEEK_DAYS, type WeekDay } from './center-activity.types';

const W = { start: '08:00', end: '22:30' };
/** slot → group names, per day; a bare number list means one group "G" holds those slots. */
type Held = Partial<Record<WeekDay, number[] | Record<number, string[]>>>;
const slotGroups = (m: Held = {}) => {
  const out = {} as RoomResult['slotGroups'];
  for (const d of WEEK_DAYS) {
    const v = m[d] ?? [];
    out[d] = new Map(
      Array.isArray(v)
        ? v.map((s): [number, string[]] => [s, ['G']])
        : Object.entries(v).map(([s, n]): [number, string[]] => [Number(s), n]),
    );
  }
  return out;
};
const room = (id: string, m: Held = {}, name = id): RoomResult => {
  const sg = slotGroups(m);
  const slots = {} as RoomResult['slots'];
  for (const d of WEEK_DAYS) slots[d] = new Set(sg[d].keys());
  return roomOf(id, name, slots, sg);
};
const roomOf = (
  id: string,
  name: string,
  slots: RoomResult['slots'],
  sg: RoomResult['slotGroups'],
): RoomResult => ({
  id,
  name,
  branchId: 1,
  branchName: 'F',
  capacity: 16,
  groupCount: 1,
  lessonHours: 0,
  workHours: 87,
  occupancyPct: 0,
  window: W,
  slots,
  slotGroups: sg,
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
    const h = buildHeat([]);
    expect(h.hours).toEqual([]);
    expect(h.roomList).toEqual([]);
  });

  it('roomList keeps the order given, with name and capacity', () => {
    const h = buildHeat([room('a', {}, '1-xona'), room('b', {}, '2-xona')]);
    expect(h.roomList).toEqual([
      { id: 'a', name: '1-xona', capacity: 16 },
      { id: 'b', name: '2-xona', capacity: 16 },
    ]);
  });

  it('lists the busy rooms with deduped group names (two groups in one hour)', () => {
    // Monday hour 10 = slots 20, 21: A holds both slots, B only the second, so A appears once
    const h = buildHeat([
      room('a', { monday: { 20: ['A'], 21: ['A', 'B'] } }),
      room('free'),
      room('c', { monday: { 20: ['C'] } }),
    ]);
    const cell = h.cells[0][h.hours.indexOf(10)];
    expect(cell.busy).toEqual([
      { room: 0, groups: ['A', 'B'] },
      { room: 2, groups: ['C'] },
    ]);
    expect(cell.free).toBe(1);
    // the free room is the one index not listed
    expect(
      h.roomList
        .map((_, i) => i)
        .filter((i) => !cell.busy.some((b) => b.room === i)),
    ).toEqual([1]);
  });

  it('a half-hour lesson touching one slot still marks the room busy for that hour only', () => {
    const h = buildHeat([room('a', { tuesday: { 23: ['Short'] } })]);
    const day = WEEK_DAYS.indexOf('tuesday');
    expect(h.cells[day][h.hours.indexOf(11)].busy).toEqual([
      { room: 0, groups: ['Short'] },
    ]);
    expect(h.cells[day][h.hours.indexOf(10)].busy).toEqual([]);
    expect(h.cells[day][h.hours.indexOf(12)].busy).toEqual([]);
  });

  it('free === roomList.length − busy.length in every cell, and busy rooms are unique', () => {
    const h = buildHeat([
      room('a', { monday: [20, 21, 22], friday: [30] }),
      room('b', { monday: [21], saturday: [40, 41] }),
      room('c', { monday: [20, 21], wednesday: [25] }),
    ]);
    for (const row of h.cells) {
      for (const c of row) {
        expect(c.free).toBe(h.roomList.length - c.busy.length);
        expect(new Set(c.busy.map((b) => b.room)).size).toBe(c.busy.length);
        expect(c.tone).toBe(heatTone(c.free, h.rooms));
      }
    }
    expect(h.cells[0][h.hours.indexOf(10)].free).toBe(0);
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
