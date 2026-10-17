import { evaluateCenter } from './center-metrics';
import type { CenterFacts, GroupFact, RoomFact } from './center-activity.types';

const d = (s: string) => new Date(s);
const W = { start: '08:00', end: '22:30' };
const AT = d('2026-09-30T18:59:59.999Z');

const room = (id: string, over: Partial<RoomFact> = {}): RoomFact => ({
  id,
  name: `${id}-xona`,
  branchId: 1,
  branchName: "Farg'ona",
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
  roomId: string | null,
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
    end: '11:30',
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

describe('evaluateCenter', () => {
  it('counts distinct half-hours: two groups at the same time are one lesson', () => {
    const ev = evaluateCenter(
      facts([room('r1')], [group('g1', 'r1'), group('g2', 'r1')]),
      AT,
      false,
    );
    const [r] = ev.rooms;
    // 2 days x 3 half-hours x 0.5 h = 3 h
    expect(r.lessonHours).toBe(3);
    expect(r.groupCount).toBe(2);
    // working hours: 14.5 h x 6 days = 87
    expect(r.workHours).toBe(87);
    expect(r.occupancyPct).toBeCloseTo(3.4, 1);
  });

  it('seats are per group; an overfull group counts as full', () => {
    const ev = evaluateCenter(
      facts(
        [room('r1', { capacityNow: 10 })],
        [
          group('g1', 'r1', { enrollments: enr(4) }),
          group('g2', 'r1', { enrollments: enr(12) }),
        ],
      ),
      AT,
      false,
    );
    const [a, b] = ev.groups;
    expect([a.enrolled, a.capacity, a.free, a.overfull]).toEqual([
      4,
      10,
      6,
      false,
    ]);
    expect([b.enrolled, b.capacity, b.free, b.overfull]).toEqual([
      12,
      10,
      0,
      true,
    ]);
    expect(a.monthlyPrice).toBe(450_000);
  });

  it('a group deleted after `at` is still counted, and noted', () => {
    const ev = evaluateCenter(
      facts(
        [room('r1')],
        [group('g1', 'r1', { deletedAt: d('2026-10-05T00:00:00Z') })],
      ),
      AT,
      false,
    );
    expect(ev.groups).toHaveLength(1);
    expect(ev.deletedLater).toBe(1);
  });

  it('a group without a room or a capacity is unplaced, not a seat', () => {
    const ev = evaluateCenter(
      facts(
        [room('r1', { capacityNow: null })],
        [group('g1', null), group('g2', 'r1')],
      ),
      AT,
      false,
    );
    expect(ev.groups).toHaveLength(0);
    expect(ev.unplaced).toBe(2);
    // g2 still takes the room's hours
    expect(ev.rooms[0].lessonHours).toBe(3);
  });

  it('reads the capacity and the schedule valid at `at`', () => {
    const r = room('r1', {
      capacityNow: 20,
      capacityHistory: [
        {
          validFrom: d('2026-05-01T00:00:00Z'),
          validTo: d('2026-08-01T00:00:00Z'),
          value: 12,
        },
      ],
    });
    const g = group('g1', 'r1', {
      scheduleHistory: [
        {
          validFrom: d('2026-05-01T00:00:00Z'),
          validTo: d('2026-08-01T00:00:00Z'),
          value: {
            exactDays: ['friday'],
            start: '15:00',
            end: '16:00',
            courseId: 'c1',
          },
        },
      ],
    });
    const early = evaluateCenter(
      facts([r], [g]),
      d('2026-07-15T00:00:00Z'),
      false,
    );
    expect(early.groups[0].capacity).toBe(12);
    expect(early.groups[0].days).toEqual(['friday']);
    expect(early.rooms[0].lessonHours).toBe(1);
    const late = evaluateCenter(facts([r], [g]), AT, false);
    expect(late.groups[0].capacity).toBe(20);
    expect(late.groups[0].days).toEqual(['monday', 'wednesday']);
  });

  it('only monthly courses carry a price', () => {
    const f = facts([room('r1')], [group('g1', 'r1')]);
    f.courses.set('c1', {
      id: 'c1',
      name: 'Paket',
      monthly: false,
      priceNow: 900_000,
      priceHistory: [],
    });
    expect(evaluateCenter(f, AT, false).groups[0].monthlyPrice).toBeNull();
  });

  it('a room that does not exist yet is left out; Sunday lessons are ignored', () => {
    const f = facts(
      [room('r1', { createdAt: d('2026-12-01T00:00:00Z') }), room('r2')],
      [
        group('g1', 'r2', {
          scheduleNow: {
            exactDays: ['sunday', 'monday'],
            start: '10:00',
            end: '11:00',
            courseId: 'c1',
          },
        }),
      ],
    );
    const ev = evaluateCenter(f, AT, false);
    expect(ev.rooms.map((r) => r.id)).toEqual(['r2']);
    expect(ev.rooms[0].lessonHours).toBe(1);
  });
});
