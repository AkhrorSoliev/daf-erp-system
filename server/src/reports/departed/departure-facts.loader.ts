import { PrismaService } from '../../prisma/prisma.service';
import { ReportBranchIds } from '../../common/finance/report-branch-scope';
import {
  departuresInRange,
  pendingInRange,
  type DepartureEpisode,
  type GraceDays,
} from '../../students/shared/departure-episodes';
import { loadDepartures } from '../shared/departures.loader';
import {
  buildFact,
  buildStartMember,
  type FactContext,
  type StudentInput,
  type TeacherChangeRow,
} from './departure-facts';
import type {
  DepartedFilter,
  DepartureFact,
  Placement,
  StartMember,
} from './departed.types';

export interface FactsRequest {
  range: { gte: Date; lt: Date };
  previous?: { gte: Date; lt: Date };
  months?: { key: string; gte: Date; lt: Date; provisional: boolean }[];
  withStartMembers?: boolean;
  withPendingToday?: boolean;
  now?: Date;
}

export interface FactSets {
  /** `departuresInRange(range)`. */
  current: DepartureFact[];
  /** `pendingInRange(range)`. */
  pendingInRange: DepartureFact[];
  previous: DepartureFact[];
  months: { key: string; provisional: boolean; facts: DepartureFact[] }[];
  /** Every pending episode today. */
  pendingToday: DepartureFact[];
  startMembers: StartMember[];
  floor: Date | null;
  graceDays: GraceDays;
}

/**
 * Departure facts for one request, loaded in one pass: the episodes come from
 * `loadDepartures` (ADR-0035) and the definition of a departure stays in
 * `departure-episodes.ts`; here every episode the page needs is turned into a
 * fact with ONE student query, one teacher-history query and one user query.
 *
 * Branch scoping is a chain: only `loadDepartures`' student query carries the
 * branch predicate; the queries below read the ids it returned.
 */
export async function loadDepartureFacts(
  prisma: PrismaService,
  companyId: number,
  scope: ReportBranchIds,
  req: FactsRequest,
): Promise<FactSets> {
  const now = req.now ?? new Date();
  const dep = await loadDepartures(prisma, companyId, scope, {
    activeAt: req.withStartMembers ? req.range.gte : undefined,
    now,
  });
  const { episodes, floor, graceDays } = dep;

  const currentEp = departuresInRange(episodes, req.range, floor);
  const pendingRangeEp = pendingInRange(episodes, req.range, floor);
  const previousEp = req.previous
    ? departuresInRange(episodes, req.previous, floor)
    : [];
  const monthEps = (req.months ?? []).map((m) => ({
    key: m.key,
    provisional: m.provisional,
    eps: departuresInRange(episodes, { gte: m.gte, lt: m.lt }, floor),
  }));
  const pendingTodayEp = req.withPendingToday
    ? episodes.filter((e) => e.state === 'pending')
    : [];

  const studentIds = new Set<number>();
  for (const e of [
    ...currentEp,
    ...pendingRangeEp,
    ...previousEp,
    ...pendingTodayEp,
    ...monthEps.flatMap((m) => m.eps),
  ]) {
    studentIds.add(e.studentId);
  }
  for (const m of dep.activeAtStartMembers) studentIds.add(m.studentId);

  if (studentIds.size === 0) {
    return {
      current: [],
      pendingInRange: [],
      previous: [],
      months: monthEps.map((m) => ({
        key: m.key,
        provisional: m.provisional,
        facts: [],
      })),
      pendingToday: [],
      startMembers: [],
      floor,
      graceDays,
    };
  }

  const rows = await prisma.student.findMany({
    where: { id: { in: [...studentIds] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      balance: true,
      status: true,
      statusChangeReason: true,
      statusExitReason: { select: { id: true, name: true } },
      enrollments: {
        where: { deletedAt: null },
        select: {
          id: true,
          status: true,
          createdAt: true,
          startDate: true,
          statusChangedAt: true,
          statusChangeReason: true,
          departureReason: { select: { id: true, name: true } },
          stateLog: { select: { status: true, transitionAt: true } },
          group: {
            select: {
              id: true,
              name: true,
              branch: { select: { id: true, name: true } },
              course: { select: { id: true, name: true } },
              teachers: { select: { teacherId: true } },
            },
          },
        },
      },
    },
  });

  const groupIds = [
    ...new Set(
      rows.flatMap((r) =>
        r.enrollments.flatMap((e) => (e.group ? [e.group.id] : [])),
      ),
    ),
  ];
  const history = groupIds.length
    ? await prisma.groupTeacherHistory.findMany({
        where: { groupId: { in: groupIds } },
        orderBy: { createdAt: 'asc' },
        select: { groupId: true, createdAt: true, previousTeacherIds: true },
      })
    : [];
  const teacherChangesByGroup = new Map<string, TeacherChangeRow[]>();
  for (const h of history) {
    const row = {
      createdAt: h.createdAt,
      previousTeacherIds: h.previousTeacherIds,
    };
    const list = teacherChangesByGroup.get(h.groupId);
    if (list) list.push(row);
    else teacherChangesByGroup.set(h.groupId, [row]);
  }

  // Names for today's teachers AND the ones a group had before a change:
  // `buildFact` leaves out a teacher whose name it does not know.
  const teacherIds = new Set<number>(
    history.flatMap((h) => h.previousTeacherIds),
  );
  for (const r of rows) {
    for (const e of r.enrollments) {
      for (const t of e.group?.teachers ?? []) teacherIds.add(t.teacherId);
    }
  }
  const users = teacherIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...teacherIds] } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const ctx: FactContext = {
    teacherChangesByGroup,
    teacherName: new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    ),
  };

  const students = new Map<number, StudentInput>(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        balance: r.balance,
        card: {
          status: r.status,
          statusChangeReason: r.statusChangeReason,
          statusExitReason: r.statusExitReason,
        },
        enrollments: r.enrollments.map((e) => ({
          ...e,
          group: e.group
            ? {
                id: e.group.id,
                name: e.group.name,
                course: e.group.course,
                branch: e.group.branch,
                teacherIds: e.group.teachers.map((t) => t.teacherId),
              }
            : null,
        })),
      },
    ]),
  );

  // One episode in two sets (the range and its month column) is one fact.
  const memo = new Map<string, DepartureFact>();
  const factOf = (ep: DepartureEpisode): DepartureFact => {
    const key = `${ep.studentId}:${ep.startedAt.getTime()}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const fact = buildFact(ep, students.get(ep.studentId) as StudentInput, ctx);
    memo.set(key, fact);
    return fact;
  };

  return {
    current: currentEp.map(factOf),
    pendingInRange: pendingRangeEp.map(factOf),
    previous: previousEp.map(factOf),
    months: monthEps.map((m) => ({
      key: m.key,
      provisional: m.provisional,
      facts: m.eps.map(factOf),
    })),
    pendingToday: pendingTodayEp.map(factOf),
    startMembers: dep.activeAtStartMembers.flatMap((m) => {
      const s = students.get(m.studentId);
      return s ? [buildStartMember(m.enrollmentId, s, req.range.gte, ctx)] : [];
    }),
    floor,
    graceDays,
  };
}

/** Keeps what the course and teacher filters allow; no filter returns `sets` itself. */
export function applyFilter(sets: FactSets, f: DepartedFilter): FactSets {
  if (!f.courseIds?.length && !f.teacherIds?.length) return sets;
  const keep = <T extends Placement>(items: T[]) =>
    items.filter((x) => matchesFilter(x, f));
  return {
    ...sets,
    current: keep(sets.current),
    pendingInRange: keep(sets.pendingInRange),
    previous: keep(sets.previous),
    pendingToday: keep(sets.pendingToday),
    months: sets.months.map((m) => ({ ...m, facts: keep(m.facts) })),
    startMembers: keep(sets.startMembers),
  };
}

/**
 * A placement passes when its course is listed and one of the teachers it had
 * at that moment is listed. An unknown group fails once a filter is on.
 */
export function matchesFilter(item: Placement, f: DepartedFilter): boolean {
  if (
    f.courseIds?.length &&
    !(item.course && f.courseIds.includes(item.course.id))
  ) {
    return false;
  }
  if (
    f.teacherIds?.length &&
    !item.teachers.some((t) => (f.teacherIds as number[]).includes(t.id))
  ) {
    return false;
  }
  return true;
}
