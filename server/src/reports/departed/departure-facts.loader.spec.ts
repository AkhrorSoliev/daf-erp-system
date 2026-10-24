import type { DepartureEpisode } from '../../students/shared/departure-episodes';
import { loadDepartures } from '../shared/departures.loader';
import {
  applyFilter,
  loadDepartureFacts,
  matchesFilter,
  type FactSets,
} from './departure-facts.loader';
import type { DepartureFact, StartMember } from './departed.types';

jest.mock('../shared/departures.loader');

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const mockedLoad = loadDepartures as jest.MockedFunction<typeof loadDepartures>;

function ep(over: Partial<DepartureEpisode>): DepartureEpisode {
  return {
    studentId: 1,
    startedAt: d('2026-10-05'),
    stopKind: 'EXPELLED',
    state: 'confirmed',
    confirmedAt: d('2026-10-05'),
    returnedAt: null,
    ...over,
  };
}

function enrollment(id: string, groupId: string, over = {}) {
  return {
    id,
    status: 'ACTIVE',
    createdAt: d('2026-09-01'),
    startDate: null,
    statusChangedAt: null,
    statusChangeReason: null,
    departureReason: null,
    stateLog: [],
    group: {
      id: groupId,
      name: `Group ${groupId}`,
      branch: { id: 1, name: 'Central' },
      course: { id: `c-${groupId}`, name: `Course ${groupId}` },
      teachers: [{ teacherId: 10 }],
    },
    ...over,
  };
}

function studentRow(id: number, groupId: string, over = {}) {
  return {
    id,
    firstName: `Name${id}`,
    lastName: `Last${id}`,
    phone: `90000000${id}`,
    balance: 0,
    status: 'EXPELLED',
    statusChangeReason: null,
    statusExitReason: null,
    enrollments: [enrollment(`e${id}`, groupId)],
    ...over,
  };
}

const RANGE = { gte: d('2026-10-01'), lt: d('2026-11-01') };
const PREVIOUS = { gte: d('2026-09-01'), lt: d('2026-10-01') };

function setup(opts: {
  episodes: DepartureEpisode[];
  members?: { studentId: number; enrollmentId: string }[];
  students?: ReturnType<typeof studentRow>[];
  history?: {
    groupId: string;
    createdAt: Date;
    previousTeacherIds: number[];
  }[];
  users?: { id: number; firstName: string; lastName: string }[];
}) {
  mockedLoad.mockResolvedValue({
    episodes: opts.episodes,
    activeAtStart: opts.members?.length ?? 0,
    activeAtStartMembers: opts.members ?? [],
    floor: null,
    graceDays: { LEFT_GROUP: 21, FROZEN: 60 },
  });
  const prisma = {
    student: { findMany: jest.fn().mockResolvedValue(opts.students ?? []) },
    groupTeacherHistory: {
      findMany: jest.fn().mockResolvedValue(opts.history ?? []),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          opts.users ?? [{ id: 10, firstName: 'Ali', lastName: 'Valiyev' }],
        ),
    },
  };
  return prisma;
}

describe('loadDepartureFacts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds every set from the right episodes, with one student query', async () => {
    const prisma = setup({
      episodes: [
        ep({ studentId: 1, startedAt: d('2026-10-05') }),
        // a second, later confirmed stop of student 1: the earliest wins
        ep({ studentId: 1, startedAt: d('2026-10-20') }),
        ep({ studentId: 2, startedAt: d('2026-09-10') }),
        ep({
          studentId: 3,
          startedAt: d('2026-10-25'),
          stopKind: 'LEFT_GROUP',
          state: 'pending',
          confirmedAt: null,
        }),
        ep({
          studentId: 4,
          startedAt: d('2026-09-28'),
          stopKind: 'FROZEN',
          state: 'pending',
          confirmedAt: null,
        }),
      ],
      members: [
        { studentId: 5, enrollmentId: 'e5' },
        { studentId: 6, enrollmentId: 'e6' },
      ],
      students: [
        studentRow(1, 'g1'),
        studentRow(2, 'g2'),
        studentRow(3, 'g3'),
        studentRow(4, 'g4'),
        studentRow(5, 'g5'),
        studentRow(6, 'g6'),
      ],
    });
    const now = d('2026-10-30');

    const sets = await loadDepartureFacts(prisma as never, 1, null, {
      range: RANGE,
      previous: PREVIOUS,
      months: [
        {
          key: '2026-09',
          gte: PREVIOUS.gte,
          lt: PREVIOUS.lt,
          provisional: false,
        },
        { key: '2026-10', gte: RANGE.gte, lt: RANGE.lt, provisional: true },
      ],
      withStartMembers: true,
      withPendingToday: true,
      now,
    });

    expect(mockedLoad).toHaveBeenCalledWith(prisma, 1, null, {
      activeAt: RANGE.gte,
      now,
    });
    expect(sets.current.map((f) => f.studentId)).toEqual([1]);
    expect(sets.current[0].startedAt).toEqual(d('2026-10-05'));
    expect(sets.previous.map((f) => f.studentId)).toEqual([2]);
    expect(sets.pendingInRange.map((f) => f.studentId)).toEqual([3]);
    expect(sets.pendingToday.map((f) => f.studentId).sort()).toEqual([3, 4]);
    expect(sets.months.map((m) => [m.key, m.provisional])).toEqual([
      ['2026-09', false],
      ['2026-10', true],
    ]);
    expect(sets.months[0].facts.map((f) => f.studentId).sort()).toEqual([2]);
    expect(sets.months[1].facts.map((f) => f.studentId)).toEqual([1]);
    expect(sets.floor).toBeNull();
    expect(sets.graceDays).toEqual({ LEFT_GROUP: 21, FROZEN: 60 });

    // one episode in two sets is the very same fact
    expect(sets.months[1].facts[0]).toBe(sets.current[0]);

    // each start member sits in the group of that enrollment
    expect(sets.startMembers.map((m) => [m.studentId, m.group?.id])).toEqual([
      [5, 'g5'],
      [6, 'g6'],
    ]);

    // no N+1: one student query carrying every needed id
    expect(prisma.student.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.student.findMany.mock.calls[0][0].where;
    expect([...where.id.in].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(prisma.groupTeacherHistory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('asks loadDepartures for no start members unless told to', async () => {
    const prisma = setup({ episodes: [] });
    await loadDepartureFacts(prisma as never, 1, [3], {
      range: RANGE,
      now: d('2026-10-30'),
    });
    expect(mockedLoad).toHaveBeenCalledWith(prisma, 1, [3], {
      activeAt: undefined,
      now: d('2026-10-30'),
    });
  });

  it('returns empty sets without touching the database when nobody is needed', async () => {
    const prisma = setup({ episodes: [ep({ startedAt: d('2026-08-01') })] });
    const sets = await loadDepartureFacts(prisma as never, 1, null, {
      range: RANGE,
      months: [
        { key: '2026-10', gte: RANGE.gte, lt: RANGE.lt, provisional: true },
      ],
      now: d('2026-10-30'),
    });
    expect(sets.current).toEqual([]);
    expect(sets.startMembers).toEqual([]);
    expect(sets.months).toEqual([
      { key: '2026-10', provisional: true, facts: [] },
    ]);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(prisma.groupTeacherHistory.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('names the teachers the group had at the stop, not only today’s', async () => {
    // today the group has teacher 10; teacher 20 left after the stop.
    const prisma = setup({
      episodes: [ep({ studentId: 1, startedAt: d('2026-10-05') })],
      students: [studentRow(1, 'g1')],
      history: [
        {
          groupId: 'g1',
          createdAt: d('2026-10-10'),
          previousTeacherIds: [20],
        },
      ],
      users: [
        { id: 10, firstName: 'Ali', lastName: 'Valiyev' },
        { id: 20, firstName: 'Bobur', lastName: 'Karimov' },
      ],
    });

    const sets = await loadDepartureFacts(prisma as never, 1, null, {
      range: RANGE,
      now: d('2026-10-30'),
    });

    expect(sets.current[0].teachers).toEqual([
      { id: 20, fullName: 'Bobur Karimov' },
    ]);
    const asked = prisma.user.findMany.mock.calls[0][0].where.id.in;
    expect([...asked].sort()).toEqual([10, 20]);
  });
});

function placement(
  courseId: string | null,
  teacherIds: number[],
): Pick<DepartureFact, 'group' | 'course' | 'branch' | 'teachers'> {
  return {
    group: courseId ? { id: `g-${courseId}`, name: 'G' } : null,
    course: courseId ? { id: courseId, name: courseId } : null,
    branch: null,
    teachers: teacherIds.map((id) => ({ id, fullName: `T${id}` })),
  };
}

function fact(studentId: number, p: ReturnType<typeof placement>) {
  return { studentId, key: `${studentId}:1`, ...p } as DepartureFact;
}

describe('matchesFilter / applyFilter', () => {
  const a = fact(1, placement('c1', [10]));
  const b = fact(2, placement('c2', [20, 30]));
  const unknown = fact(3, placement(null, []));
  const m1: StartMember = { studentId: 4, ...placement('c1', [10]) };
  const m2: StartMember = { studentId: 5, ...placement('c2', [20]) };

  const sets: FactSets = {
    current: [a, b, unknown],
    pendingInRange: [b],
    previous: [a, unknown],
    months: [{ key: '2026-10', provisional: true, facts: [a, b, unknown] }],
    pendingToday: [unknown, a],
    startMembers: [m1, m2],
    floor: null,
    graceDays: { LEFT_GROUP: 21, FROZEN: 60 },
  };

  it('keeps a fact whose course is listed', () => {
    expect(matchesFilter(a, { courseIds: ['c1'] })).toBe(true);
    expect(matchesFilter(b, { courseIds: ['c1'] })).toBe(false);
  });

  it('keeps a fact when one of the teachers at the stop is listed', () => {
    expect(matchesFilter(b, { teacherIds: [30] })).toBe(true);
    expect(matchesFilter(a, { teacherIds: [30] })).toBe(false);
  });

  it('drops a fact with an unknown group once a filter is on', () => {
    expect(matchesFilter(unknown, { courseIds: ['c1'] })).toBe(false);
    expect(matchesFilter(unknown, { teacherIds: [10] })).toBe(false);
  });

  it('needs both when both are given', () => {
    expect(matchesFilter(a, { courseIds: ['c1'], teacherIds: [20] })).toBe(
      false,
    );
    expect(matchesFilter(b, { courseIds: ['c2'], teacherIds: [20] })).toBe(
      true,
    );
  });

  it('returns the same sets for an empty filter', () => {
    expect(applyFilter(sets, {})).toBe(sets);
    expect(applyFilter(sets, { courseIds: [], teacherIds: [] })).toBe(sets);
  });

  it('filters every set, start members included', () => {
    const out = applyFilter(sets, { courseIds: ['c1'] });
    expect(out.current).toEqual([a]);
    expect(out.pendingInRange).toEqual([]);
    expect(out.previous).toEqual([a]);
    expect(out.months[0]).toEqual({
      key: '2026-10',
      provisional: true,
      facts: [a],
    });
    expect(out.pendingToday).toEqual([a]);
    expect(out.startMembers).toEqual([m1]);
    expect(out.floor).toBeNull();
    expect(out.graceDays).toEqual(sets.graceDays);
  });
});
