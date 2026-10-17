import type {
  CutKey,
  CutRow,
  DepartedOverview,
  DepartureFact,
  Placement,
  StartMember,
} from './departed.types';
import { per100, shareOf } from './departed-period';

export interface AggregateInput {
  current: DepartureFact[];
  /** null = the previous period starts before the system start date: not known. */
  previous: DepartureFact[] | null;
  months: { key: string; provisional: boolean; facts: DepartureFact[] }[];
  pendingToday: DepartureFact[];
  startMembers: StartMember[];
}

export type AggregateOutput = Pick<
  DepartedOverview,
  'cards' | 'pendingToday' | 'months' | 'reasons' | 'cuts' | 'uniqueDeparted'
>;

const UNKNOWN = { id: '-', name: "Noma'lum" };
type Keyed = { id: string; name: string };

const KEYS: Record<CutKey, (p: Placement) => Keyed[]> = {
  teacher: (p) =>
    p.teachers.length
      ? p.teachers.map((t) => ({ id: String(t.id), name: t.fullName }))
      : [UNKNOWN],
  course: (p) =>
    p.course ? [{ id: p.course.id, name: p.course.name }] : [UNKNOWN],
  group: (p) =>
    p.group ? [{ id: p.group.id, name: p.group.name }] : [UNKNOWN],
  branch: (p) =>
    p.branch ? [{ id: String(p.branch.id), name: p.branch.name }] : [UNKNOWN],
};

function cut(
  facts: DepartureFact[],
  members: StartMember[],
  keysOf: (p: Placement) => Keyed[],
): CutRow[] {
  const rows = new Map<string, CutRow>();
  for (const f of facts) {
    for (const k of keysOf(f)) {
      const row = rows.get(k.id) ?? {
        id: k.id,
        name: k.name,
        departed: 0,
        atStart: 0,
        share: null,
      };
      row.departed += 1;
      rows.set(k.id, row);
    }
  }
  for (const m of members) {
    for (const k of keysOf(m)) {
      const row = rows.get(k.id);
      if (row) row.atStart += 1; // a bucket with no departures is not listed
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, share: shareOf(r.departed, r.atStart) }))
    .sort(
      (a, b) => b.departed - a.departed || a.name.localeCompare(b.name, 'uz'),
    );
}

function reasonsOf(facts: DepartureFact[]): AggregateOutput['reasons'] {
  const rows = new Map<string, AggregateOutput['reasons'][number]>();
  for (const f of facts) {
    const key = f.reason.id ?? 'none';
    const row = rows.get(key) ?? {
      reasonId: f.reason.id,
      name: f.reason.name,
      count: 0,
    };
    row.count += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      Number(a.reasonId === null) - Number(b.reasonId === null) ||
      b.count - a.count ||
      a.name.localeCompare(b.name, 'uz'),
  );
}

function avgStudyMonths(facts: DepartureFact[]): number | null {
  const known = facts.flatMap((f) =>
    f.studyMonths === null ? [] : [f.studyMonths],
  );
  if (!known.length) return null;
  return (
    Math.round((known.reduce((s, n) => s + n, 0) / known.length) * 10) / 10
  );
}

/** Pure: filtered departure facts in, report blocks out. Every block is a view of `current`. */
export function aggregateOverview(input: AggregateInput): AggregateOutput {
  const { current, previous, months, pendingToday, startMembers } = input;
  return {
    cards: {
      departed: current.length,
      previousDeparted: previous === null ? null : previous.length,
      atStart: startMembers.length,
      per100: per100(current.length, startMembers.length),
      avgStudyMonths: avgStudyMonths(current),
    },
    pendingToday: pendingToday.length,
    months: months.map((m) => ({
      key: m.key,
      departed: m.facts.length,
      provisional: m.provisional,
    })),
    reasons: reasonsOf(current),
    cuts: {
      teacher: cut(current, startMembers, KEYS.teacher),
      course: cut(current, startMembers, KEYS.course),
      group: cut(current, startMembers, KEYS.group),
      branch: cut(current, startMembers, KEYS.branch),
    },
    uniqueDeparted: current.length,
  };
}
