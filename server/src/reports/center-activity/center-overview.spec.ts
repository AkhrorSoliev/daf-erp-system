import { buildOverview } from './center-overview';
import type { CenterFacts, GroupFact, RoomFact } from './center-activity.types';

const d = (s: string) => new Date(s);
const W = { start: '08:00', end: '22:30' };
const NOW = d('2026-10-17T05:00:00Z');

const room = (
  id: string,
  branchId = 1,
  over: Partial<RoomFact> = {},
): RoomFact => ({
  id,
  name: `${id}-xona`,
  branchId,
  branchName: branchId === 1 ? "Farg'ona" : 'Namangan',
  createdAt: d('2026-05-01T00:00:00Z'),
  deletedAt: null,
  status: 'ACTIVE',
  capacityNow: 16,
  capacityHistory: [],
  window: W,
  ...over,
});
const enr = (n: number) =>
  Array.from({ length: n }, () => ({
    createdAt: d('2026-05-01T00:00:00Z'),
    statusChangedAt: null,
    status: 'ACTIVE',
    log: [],
  }));
const group = (
  id: string,
  roomId: string,
  over: Partial<GroupFact> = {},
): GroupFact => ({
  id,
  name: id,
  roomId,
  branchId: 1,
  createdAt: d('2026-05-01T00:00:00Z'),
  startDate: null,
  endDate: null,
  deletedAt: null,
  scheduleNow: {
    exactDays: ['monday', 'wednesday'],
    start: '10:00',
    end: '12:00',
    courseId: 'c1',
  },
  scheduleHistory: [],
  statusLog: [],
  enrollments: enr(8),
  ...over,
});
const facts = (rooms: RoomFact[], groups: GroupFact[]): CenterFacts => ({
  rooms,
  groups,
  courses: new Map([
    [
      'c1',
      {
        id: 'c1',
        name: 'Standart',
        monthly: true,
        priceNow: 450_000,
        priceHistory: [],
      },
    ],
  ]),
});

describe('buildOverview', () => {
  const f = facts(
    [room('r1'), room('r2'), room('r3', 2)],
    [
      group('g1', 'r1'),
      group('g2', 'r2', { enrollments: enr(16) }),
      group('g3', 'r3', { branchId: 2, deletedAt: d('2026-10-01T00:00:00Z') }),
    ],
  );

  it('the cards add up to the tables (parity)', () => {
    const o = buildOverview(f, '2026-09', NOW);
    const hours = o.rooms.reduce((s, r) => s + r.lessonHours, 0);
    expect(o.cards.lessonHoursPerWeek).toBeCloseTo(hours, 5);
    // g2 is full so it is not listed; its 16 seats are still in the card.
    expect(o.cards.seats.enrolled).toBe(8 + 16 + 8);
    expect(o.cards.seats.capacity).toBe(48);
    expect(o.cards.free.seats).toBe(o.groups.reduce((s, g) => s + g.free, 0));
    expect(o.cards.free.seats).toBe(
      o.cards.seats.capacity - o.cards.seats.enrolled,
    );
  });

  it('counts an overfull group at its capacity, never above', () => {
    const over = facts(
      [room('r1')],
      [group('g1', 'r1', { enrollments: enr(20) })],
    );
    const o = buildOverview(over, '2026-09', NOW);
    expect(o.cards.seats).toEqual({ pct: 100, enrolled: 16, capacity: 16 });
    expect(o.cards.free.seats).toBe(0);
  });

  it('the last month bar equals the card (same instant, same function)', () => {
    const o = buildOverview(f, '2026-09', NOW);
    expect(o.months[o.months.length - 1]).toEqual({
      month: '2026-09',
      pct: o.cards.occupancyPct,
    });
    expect(o.months.map((m) => m.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('lists only groups with free seats, emptiest first, and notes the deleted one', () => {
    const o = buildOverview(f, '2026-09', NOW);
    expect(o.groups.map((g) => g.id)).toEqual(['g1', 'g3']); // g2 is full
    expect(o.groups[0].free).toBeGreaterThanOrEqual(o.groups[1].free);
    expect(o.notes.deletedLater).toBe(1);
  });

  it('revenue = free seats × monthly price', () => {
    const o = buildOverview(f, '2026-09', NOW);
    const expected = o.groups.reduce((s, g) => s + g.free, 0) * 450_000;
    expect(o.cards.free.revenue).toBe(expected);
  });

  it('draws the heat for the first branch by name, or the requested one', () => {
    expect(buildOverview(f, '2026-09', NOW).heat?.branchId).toBe(1);
    expect(buildOverview(f, '2026-09', NOW, 2).heat?.branchId).toBe(2);
    expect(buildOverview(f, '2026-09', NOW).branches).toEqual([
      { id: 1, name: "Farg'ona", rooms: 2 },
      { id: 2, name: 'Namangan', rooms: 1 },
    ]);
  });

  it('refuses a branch that is not in the answer', () => {
    expect(() => buildOverview(f, '2026-09', NOW, 99)).toThrow(RangeError);
  });

  it('no rooms means nulls, not zeros', () => {
    const o = buildOverview(facts([], []), '2026-09', NOW);
    expect(o.cards.occupancyPct).toBeNull();
    expect(o.cards.seats.pct).toBeNull();
    expect(o.heat).toBeNull();
  });

  it('the work window is null when branches differ', () => {
    const o = buildOverview(
      facts(
        [
          room('r1'),
          room('r3', 2, { window: { start: '09:00', end: '21:00' } }),
        ],
        [],
      ),
      '2026-09',
      NOW,
    );
    expect(o.cards.workWindow).toBeNull();
    expect(
      buildOverview(facts([room('r1')], []), '2026-09', NOW).cards.workWindow,
    ).toEqual(W);
  });
});
