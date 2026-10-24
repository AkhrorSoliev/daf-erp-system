import { aggregateOverview, AggregateInput } from './departed-aggregate';
import { per100 } from './departed-period';
import type {
  CutRow,
  DepartureFact,
  Placement,
  StartMember,
} from './departed.types';

const T = (id: number) => ({ id, fullName: `Ustoz ${id}` });
const G = (id: string) => ({ id, name: `Guruh ${id}` });
const C = (id: string) => ({ id, name: `Kurs ${id}` });
const B = (id: number) => ({ id, name: `Filial ${id}` });

const EMPTY: Placement = {
  group: null,
  course: null,
  branch: null,
  teachers: [],
};

let seq = 0;
function fact(
  over: Partial<DepartureFact> & { studyMonths?: number | null } = {},
): DepartureFact {
  seq += 1;
  return {
    key: `${seq}:1`,
    studentId: seq,
    fullName: `Talaba ${seq}`,
    phone: '900000000',
    balance: 0,
    startedAt: new Date('2026-09-10T05:00:00Z'),
    stopKind: 'LEFT_GROUP',
    state: 'confirmed',
    returnedAt: null,
    reason: { id: 'r1', name: 'Narx' },
    comment: null,
    studyMonths: null,
    ...EMPTY,
    ...over,
  };
}

function member(over: Partial<StartMember> = {}): StartMember {
  seq += 1;
  return { studentId: seq, ...EMPTY, ...over };
}

const sum = (rows: CutRow[]) => rows.reduce((s, r) => s + r.departed, 0);

function input(over: Partial<AggregateInput> = {}): AggregateInput {
  return {
    current: [],
    previous: [],
    months: [],
    pendingToday: [],
    startMembers: [],
    ...over,
  };
}

/** Seven departures, differing in reason, teacher, course, group and branch. */
function sevenFacts(): DepartureFact[] {
  const base = (
    reason: { id: string | null; name: string },
    teachers: number[],
    course: string,
    group: string,
    branch: number,
    studyMonths: number | null,
  ) =>
    fact({
      reason,
      teachers: teachers.map(T),
      course: C(course),
      group: G(group),
      branch: B(branch),
      studyMonths,
    });
  const narx = { id: 'r1', name: 'Narx' };
  const vaqt = { id: 'r2', name: 'Vaqt' };
  const koch = { id: 'r3', name: "Ko'chish" };
  const none = { id: null, name: 'Sabab yozilmagan' };
  return [
    base(narx, [1], 'c1', 'g1', 1, 2),
    base(narx, [1, 2], 'c1', 'g1', 1, 4), // two teachers
    base(vaqt, [2], 'c2', 'g2', 1, 3),
    base(vaqt, [2], 'c2', 'g2', 2, null),
    base(koch, [3], 'c1', 'g3', 2, 5),
    base(none, [3], 'c2', 'g2', 2, 1),
    base(narx, [1], 'c1', 'g1', 1, null),
  ];
}

describe('aggregateOverview', () => {
  it('parity: every block adds up to the same departed count', () => {
    const current = sevenFacts();
    const out = aggregateOverview(input({ current }));

    expect(out.cards.departed).toBe(7);
    expect(out.uniqueDeparted).toBe(7);
    expect(out.reasons.reduce((s, r) => s + r.count, 0)).toBe(7);
    expect(sum(out.cuts.course)).toBe(7);
    expect(sum(out.cuts.group)).toBe(7);
    expect(sum(out.cuts.branch)).toBe(7);
    // two-teacher group counts under both teachers
    expect(sum(out.cuts.teacher)).toBe(8);
    expect(sum(out.cuts.teacher)).toBeGreaterThanOrEqual(out.uniqueDeparted);
  });

  describe('cards', () => {
    it('counts previous, start members, per100 and the study-month mean', () => {
      const current = sevenFacts(); // studyMonths 2,4,3,null,5,1,null -> 15/5 = 3
      const out = aggregateOverview(
        input({
          current,
          previous: [fact(), fact(), fact()],
          startMembers: Array.from({ length: 20 }, () => member()),
        }),
      );
      expect(out.cards.previousDeparted).toBe(3);
      expect(out.cards.atStart).toBe(20);
      expect(out.cards.per100).toBe(per100(7, 20));
      expect(out.cards.avgStudyMonths).toBe(3);
    });

    it('an unknown previous period (before the floor) is null, not 0', () => {
      const out = aggregateOverview(
        input({ current: [fact()], previous: null }),
      );
      expect(out.cards.previousDeparted).toBeNull();
    });

    it('rounds the mean to one decimal', () => {
      const out = aggregateOverview(
        input({
          current: [
            fact({ studyMonths: 1 }),
            fact({ studyMonths: 2 }),
            fact({ studyMonths: 2 }),
          ],
        }),
      );
      expect(out.cards.avgStudyMonths).toBe(1.7);
    });

    it('is null when no fact has study months', () => {
      const out = aggregateOverview(input({ current: [fact(), fact()] }));
      expect(out.cards.avgStudyMonths).toBeNull();
    });
  });

  describe('reasons', () => {
    it('sorts by count desc, then name, with the no-reason row last', () => {
      const r = (id: string | null, name: string) => ({ id, name });
      const none = r(null, 'Sabab yozilmagan');
      const current = [
        fact({ reason: none }),
        fact({ reason: none }),
        fact({ reason: none }),
        fact({ reason: r('b', 'Vaqt') }),
        fact({ reason: r('b', 'Vaqt') }),
        fact({ reason: r('a', 'Narx') }),
        fact({ reason: r('a', 'Narx') }),
        fact({ reason: r('c', 'Aloqa') }),
      ];
      const out = aggregateOverview(input({ current }));
      expect(out.reasons).toEqual([
        { reasonId: 'a', name: 'Narx', count: 2 },
        { reasonId: 'b', name: 'Vaqt', count: 2 },
        { reasonId: 'c', name: 'Aloqa', count: 1 },
        { reasonId: null, name: 'Sabab yozilmagan', count: 3 },
      ]);
    });
  });

  describe('cuts', () => {
    it('counts departed and atStart per key, hides zero-departure buckets', () => {
      const current = [
        fact({ group: G('g1'), course: C('c1'), branch: B(1) }),
        fact({ group: G('g1'), course: C('c1'), branch: B(1) }),
        fact({ group: G('g2'), course: C('c1'), branch: B(1) }),
      ];
      const startMembers = [
        ...Array.from({ length: 6 }, () =>
          member({ group: G('g1'), course: C('c1'), branch: B(1) }),
        ),
        ...Array.from({ length: 2 }, () =>
          member({ group: G('g2'), course: C('c1'), branch: B(1) }),
        ),
        // nobody left g9: not listed
        member({ group: G('g9'), course: C('c9'), branch: B(9) }),
      ];
      const out = aggregateOverview(input({ current, startMembers }));

      expect(out.cuts.group).toEqual([
        { id: 'g1', name: 'Guruh g1', departed: 2, atStart: 6, share: 33.3 },
        { id: 'g2', name: 'Guruh g2', departed: 1, atStart: 2, share: null },
      ]);
      expect(out.cuts.course.map((r) => r.id)).toEqual(['c1']);
      expect(out.cuts.course[0]).toMatchObject({
        departed: 3,
        atStart: 8,
        share: 37.5,
      });
      expect(out.cuts.branch.map((r) => r.id)).toEqual(['1']);
    });

    it('share is null below five students at the start', () => {
      const out = aggregateOverview(
        input({
          current: [fact({ group: G('g1') })],
          startMembers: Array.from({ length: 4 }, () =>
            member({ group: G('g1') }),
          ),
        }),
      );
      expect(out.cuts.group[0].share).toBeNull();
    });

    it('orders by departed desc, then name', () => {
      const out = aggregateOverview(
        input({
          current: [
            fact({ group: G('b') }),
            fact({ group: G('a') }),
            fact({ group: G('c') }),
            fact({ group: G('c') }),
          ],
        }),
      );
      expect(out.cuts.group.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    });

    it("puts unknown placement under a «Noma'lum» row with id '-'", () => {
      const out = aggregateOverview(
        input({
          current: [fact({ ...EMPTY }), fact({ group: G('g1') })],
        }),
      );
      const unknown = { id: '-', name: "Noma'lum" };
      for (const key of ['group', 'course', 'branch', 'teacher'] as const) {
        expect(out.cuts[key]).toEqual(
          expect.arrayContaining([expect.objectContaining(unknown)]),
        );
      }
      expect(out.cuts.group.find((r) => r.id === '-')?.departed).toBe(1);
      // the fact with a group but no teacher is unknown in the teacher cut too
      expect(out.cuts.teacher.find((r) => r.id === '-')?.departed).toBe(2);
    });
  });

  it('months keep the given order and pass provisional through', () => {
    const out = aggregateOverview(
      input({
        months: [
          { key: '2026-08', provisional: false, facts: [fact(), fact()] },
          { key: '2026-09', provisional: false, facts: [] },
          { key: '2026-10', provisional: true, facts: [fact()] },
        ],
      }),
    );
    expect(out.months).toEqual([
      { key: '2026-08', departed: 2, provisional: false },
      { key: '2026-09', departed: 0, provisional: false },
      { key: '2026-10', departed: 1, provisional: true },
    ]);
  });

  it('pendingToday is the length of the pending list', () => {
    const out = aggregateOverview(
      input({ pendingToday: [fact(), fact(), fact()] }),
    );
    expect(out.pendingToday).toBe(3);
  });

  it('empty input gives zeros, null per100 and empty arrays', () => {
    const out = aggregateOverview(input());
    expect(out).toEqual({
      cards: {
        departed: 0,
        previousDeparted: 0,
        atStart: 0,
        per100: null,
        avgStudyMonths: null,
      },
      pendingToday: 0,
      months: [],
      reasons: [],
      cuts: { teacher: [], course: [], group: [], branch: [] },
      uniqueDeparted: 0,
    });
  });
});
