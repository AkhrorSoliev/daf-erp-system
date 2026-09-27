import { EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  currentStopStart,
  loadTeacherChangeDepartures,
} from './teacher-change-departures';

const at = (iso: string) => new Date(iso);
const logRow = (status: EnrollmentStatus, when: string) => ({
  status,
  transitionAt: at(when),
});

describe('currentStopStart', () => {
  it('dates a freeze that was closed later by the freeze, not by the closing', () => {
    expect(
      currentStopStart({
        status: 'DROPPED',
        statusChangedAt: at('2026-09-20T07:00:00Z'),
        stateLog: [
          logRow('ACTIVE', '2026-08-01T07:00:00Z'),
          logRow('FROZEN', '2026-09-05T07:00:00Z'),
          logRow('DROPPED', '2026-09-20T07:00:00Z'),
        ],
      }),
    ).toEqual({ at: at('2026-09-05T07:00:00Z'), status: 'FROZEN' });
  });

  it('dates a stop after a return by that stop, not by the stop before the return', () => {
    expect(
      currentStopStart({
        status: 'DROPPED',
        statusChangedAt: at('2026-09-12T07:00:00Z'),
        stateLog: [
          logRow('ACTIVE', '2026-08-01T07:00:00Z'),
          logRow('FROZEN', '2026-08-10T07:00:00Z'),
          logRow('ACTIVE', '2026-08-25T07:00:00Z'),
          logRow('DROPPED', '2026-09-12T07:00:00Z'),
        ],
      }),
    ).toEqual({ at: at('2026-09-12T07:00:00Z'), status: 'DROPPED' });
  });

  it('dates an enrollment without log rows by statusChangedAt and its current status', () => {
    expect(
      currentStopStart({
        status: 'FROZEN',
        statusChangedAt: at('2026-09-04T07:00:00Z'),
        stateLog: [],
      }),
    ).toEqual({ at: at('2026-09-04T07:00:00Z'), status: 'FROZEN' });
  });

  it('gives an enrollment that is ACTIVE again no current stop, whatever its log ends with', () => {
    expect(
      currentStopStart({
        status: 'ACTIVE',
        statusChangedAt: at('2026-09-07T07:00:00Z'),
        stateLog: [
          logRow('ACTIVE', '2026-08-01T07:00:00Z'),
          logRow('FROZEN', '2026-09-03T07:00:00Z'),
        ],
      }),
    ).toBeNull();
  });

  it('dates a closing the log never recorded by statusChangedAt, not by the stop before the return', () => {
    expect(
      currentStopStart({
        status: 'DROPPED',
        statusChangedAt: at('2026-09-12T07:00:00Z'),
        stateLog: [
          logRow('ACTIVE', '2026-08-01T07:00:00Z'),
          logRow('FROZEN', '2026-08-10T07:00:00Z'),
          logRow('ACTIVE', '2026-08-25T07:00:00Z'),
        ],
      }),
    ).toEqual({ at: at('2026-09-12T07:00:00Z'), status: 'DROPPED' });
  });

  it('cannot date a stop that statusChangedAt puts before the return the log recorded', () => {
    expect(
      currentStopStart({
        status: 'DROPPED',
        statusChangedAt: at('2026-08-20T07:00:00Z'),
        stateLog: [
          logRow('ACTIVE', '2026-08-01T07:00:00Z'),
          logRow('FROZEN', '2026-08-10T07:00:00Z'),
          logRow('ACTIVE', '2026-08-25T07:00:00Z'),
        ],
      }),
    ).toBeNull();
  });

  it('cannot date a stop with neither a log row nor statusChangedAt', () => {
    expect(
      currentStopStart({
        status: 'DROPPED',
        statusChangedAt: null,
        stateLog: [],
      }),
    ).toBeNull();
  });

  it('reads the log in time order whatever order its rows arrive in', () => {
    expect(
      currentStopStart({
        status: 'DROPPED',
        statusChangedAt: at('2026-09-20T07:00:00Z'),
        stateLog: [
          logRow('DROPPED', '2026-09-20T07:00:00Z'),
          logRow('FROZEN', '2026-09-05T07:00:00Z'),
          logRow('ACTIVE', '2026-08-01T07:00:00Z'),
        ],
      }),
    ).toEqual({ at: at('2026-09-05T07:00:00Z'), status: 'FROZEN' });
  });

  it('dates a log that opens with a stop (enrollment older than the log) by its first stop', () => {
    expect(
      currentStopStart({
        status: 'DROPPED',
        statusChangedAt: at('2026-09-20T07:00:00Z'),
        stateLog: [
          logRow('FROZEN', '2026-09-05T07:00:00Z'),
          logRow('DROPPED', '2026-09-20T07:00:00Z'),
        ],
      }),
    ).toEqual({ at: at('2026-09-05T07:00:00Z'), status: 'FROZEN' });
  });
});

// ---------------------------------------------------------------------------
// loadTeacherChangeDepartures — against a fake Prisma that applies the query
// the way the database would (where / select / orderBy / distinct / take), so
// the tests assert who ends up counted, not the shape of the query. It throws
// on any filter or argument it does not understand rather than ignoring it.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface ChangeFixture {
  id: string;
  groupId: string;
  createdAt: Date;
  previousTeacherIds: number[];
  newTeacherIds: number[];
  group: { companyId: number; branchId: number; deletedAt: Date | null };
}

interface EnrollmentFixture {
  id: string;
  studentId: number;
  groupId: string;
  status: EnrollmentStatus;
  createdAt: Date;
  statusChangedAt: Date | null;
  deletedAt: Date | null;
  student: {
    companyId: number;
    deletedAt: Date | null;
    firstName: string;
    lastName: string;
  };
  group: { name: string; branch: { name: string } };
  departureReason: { name: string } | null;
  stateLog: { status: EnrollmentStatus; transitionAt: Date }[];
}

interface Fixture {
  changes: ChangeFixture[];
  lessons: { groupId: string; date: Date }[];
  enrollments: EnrollmentFixture[];
}

const OPERATORS = new Set(['in', 'gte', 'gt', 'lt', 'lte']);

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  return a === b;
}

function applyOperator(op: string, value: unknown, arg: unknown): boolean {
  if (op === 'in') return (arg as unknown[]).some((v) => sameValue(v, value));
  if (!(value instanceof Date) || !(arg instanceof Date)) {
    throw new Error(`fake prisma: "${op}" is only modelled for dates`);
  }
  const [v, a] = [value.getTime(), arg.getTime()];
  if (op === 'gte') return v >= a;
  if (op === 'gt') return v > a;
  if (op === 'lt') return v < a;
  return v <= a; // lte
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (!(key in row)) throw new Error(`fake prisma: no field "${key}"`);
    const value = row[key];
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
      return sameValue(value, cond);
    }
    const keys = Object.keys(cond);
    if (keys.every((k) => OPERATORS.has(k))) {
      return keys.every((op) => applyOperator(op, value, (cond as Row)[op]));
    }
    if (keys.some((k) => OPERATORS.has(k))) {
      throw new Error(`fake prisma: mixed filter on "${key}"`);
    }
    return matches(value as Row, cond as Row); // relation filter
  });
}

function sortBy(rows: Row[], orderBy: Row): Row[] {
  const [[field, dir]] = Object.entries(orderBy);
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort(
    (a, b) =>
      sign * ((a[field] as Date).getTime() - (b[field] as Date).getTime()),
  );
}

function project(row: Row, select: Row): Row {
  const out: Row = {};
  for (const [key, spec] of Object.entries(select)) {
    if (!(key in row)) throw new Error(`fake prisma: no field "${key}"`);
    const value = row[key];
    if (spec === true) {
      out[key] = value;
      continue;
    }
    const { select: nested, orderBy, ...rest } = spec as Row;
    if (Object.keys(rest).length > 0 || !nested) {
      throw new Error(`fake prisma: unsupported relation args on "${key}"`);
    }
    if (Array.isArray(value)) {
      const rows = orderBy ? sortBy(value as Row[], orderBy as Row) : value;
      out[key] = (rows as Row[]).map((r) => project(r, nested as Row));
    } else {
      out[key] = value === null ? null : project(value as Row, nested as Row);
    }
  }
  return out;
}

function runQuery(table: Row[], args: Row): Row[] {
  const { where, select, orderBy, distinct, take, ...rest } = args;
  if (Object.keys(rest).length > 0) {
    throw new Error(
      `fake prisma: unsupported args ${Object.keys(rest).join()}`,
    );
  }
  let rows = table.filter((r) => matches(r, (where ?? {}) as Row));
  if (orderBy) rows = sortBy(rows, orderBy as Row);
  if (distinct) {
    const [field] = distinct as string[];
    const seen = new Set<number>();
    rows = rows.filter((r) => {
      const t = (r[field] as Date).getTime();
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
  }
  if (take !== undefined) rows = rows.slice(0, take as number);
  return select ? rows.map((r) => project(r, select as Row)) : rows;
}

function fakePrisma(f: Fixture) {
  const table = (rows: object[]) =>
    jest.fn((args: Row) => Promise.resolve(runQuery(rows as Row[], args)));
  return {
    groupTeacherHistory: { findMany: table(f.changes) },
    attendance: { findMany: table(f.lessons) },
    enrollment: { findMany: table(f.enrollments) },
  };
}

const COMPANY = 1001;
const BRANCH = 1;
// Picked range: Tashkent 2026-09-01 .. 2026-09-30 (end exclusive).
const RANGE = {
  scope: null,
  start: at('2026-08-31T19:00:00Z'),
  end: at('2026-09-30T19:00:00Z'),
};
// 10:00 Tashkent. Lessons after it: 02, 04, 06, 08, 10, 12 September, so the
// window closes on the 5th lesson, 2026-09-10.
const CHANGE_AT = '2026-09-01T05:00:00Z';
const LESSON_DAYS = ['02', '04', '06', '08', '10', '12'];

const change = (
  id: string,
  groupId: string,
  createdAt: string,
  group: Partial<ChangeFixture['group']> = {},
): ChangeFixture => ({
  id,
  groupId,
  createdAt: at(createdAt),
  previousTeacherIds: [30001],
  newTeacherIds: [30002],
  group: { companyId: COMPANY, branchId: BRANCH, deletedAt: null, ...group },
});

const lessons = (groupId: string, days = LESSON_DAYS) =>
  days.map((d) => ({ groupId, date: at(`2026-09-${d}T00:00:00Z`) }));

const enrollment = (
  id: string,
  props: {
    status: EnrollmentStatus;
    log: [EnrollmentStatus, string][];
    statusChangedAt?: string | null;
    createdAt?: string;
    groupId?: string;
    deletedAt?: string | null;
    studentDeletedAt?: string | null;
  },
): EnrollmentFixture => {
  const lastLog = props.log[props.log.length - 1];
  const statusChangedAt =
    props.statusChangedAt !== undefined
      ? props.statusChangedAt
      : (lastLog?.[1] ?? null);
  return {
    id,
    studentId: 10000 + Number(id.replace(/\D/g, '')),
    groupId: props.groupId ?? 'g1',
    status: props.status,
    createdAt: at(props.createdAt ?? '2026-08-01T07:00:00Z'),
    statusChangedAt: statusChangedAt ? at(statusChangedAt) : null,
    deletedAt: props.deletedAt ? at(props.deletedAt) : null,
    student: {
      companyId: COMPANY,
      deletedAt: props.studentDeletedAt ? at(props.studentDeletedAt) : null,
      firstName: 'Talaba',
      lastName: id,
    },
    group: { name: 'B1-01', branch: { name: 'Bosh' } },
    departureReason: null,
    stateLog: props.log.map(([status, when]) => logRow(status, when)),
  };
};

async function departuresOf(
  f: Fixture,
  params: Parameters<typeof loadTeacherChangeDepartures>[2] = RANGE,
) {
  const prisma = fakePrisma(f);
  const { departures } = await loadTeacherChangeDepartures(
    prisma as unknown as PrismaService,
    COMPANY,
    params,
  );
  return departures.map((d) => ({
    enrollmentId: d.enrollment.id,
    changeId: d.change.id,
    departedAt: d.departedAt.toISOString(),
    departureStatus: d.departureStatus,
    lessonNumber: d.lessonNumber,
  }));
}

describe('loadTeacherChangeDepartures', () => {
  it('counts a freeze inside the window even after the freeze was closed later', async () => {
    const rows = await departuresOf({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: lessons('g1'),
      enrollments: [
        // Its group closed on 20 September, after the window.
        enrollment('e1', {
          status: 'DROPPED',
          log: [
            ['ACTIVE', '2026-08-01T07:00:00Z'],
            ['FROZEN', '2026-09-05T07:00:00Z'],
            ['DROPPED', '2026-09-20T07:00:00Z'],
          ],
        }),
      ],
    });

    expect(rows).toEqual([
      {
        enrollmentId: 'e1',
        changeId: 'ch1',
        departedAt: '2026-09-05T07:00:00.000Z',
        departureStatus: 'FROZEN',
        lessonNumber: 3,
      },
    ]);
  });

  it('does not count a freeze from before the change whose group closed inside the window', async () => {
    const rows = await departuresOf({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: lessons('g1'),
      enrollments: [
        enrollment('e2', {
          status: 'DROPPED',
          log: [
            ['ACTIVE', '2026-08-01T07:00:00Z'],
            ['FROZEN', '2026-08-20T07:00:00Z'],
            ['DROPPED', '2026-09-05T07:00:00Z'],
          ],
        }),
      ],
    });

    expect(rows).toEqual([]);
  });

  it('counts a stop inside the window when the student had come back before the change', async () => {
    const rows = await departuresOf({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: lessons('g1'),
      enrollments: [
        enrollment('e3', {
          status: 'DROPPED',
          log: [
            ['ACTIVE', '2026-08-01T07:00:00Z'],
            ['FROZEN', '2026-08-10T07:00:00Z'],
            ['ACTIVE', '2026-08-25T07:00:00Z'],
            ['DROPPED', '2026-09-03T07:00:00Z'],
          ],
        }),
      ],
    });

    expect(rows).toEqual([
      {
        enrollmentId: 'e3',
        changeId: 'ch1',
        departedAt: '2026-09-03T07:00:00.000Z',
        departureStatus: 'DROPPED',
        lessonNumber: 2,
      },
    ]);
  });

  it('does not count a student who froze inside the window and studies again', async () => {
    const rows = await departuresOf({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: lessons('g1'),
      enrollments: [
        enrollment('e4', {
          status: 'ACTIVE',
          log: [
            ['ACTIVE', '2026-08-01T07:00:00Z'],
            ['FROZEN', '2026-09-03T07:00:00Z'],
            ['ACTIVE', '2026-09-07T07:00:00Z'],
          ],
        }),
      ],
    });

    expect(rows).toEqual([]);
  });

  it('dates a student who froze inside the window, came back and froze again after it by the new freeze', async () => {
    const rows = await departuresOf({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: lessons('g1'),
      enrollments: [
        enrollment('e5', {
          status: 'FROZEN',
          log: [
            ['ACTIVE', '2026-08-01T07:00:00Z'],
            ['FROZEN', '2026-09-03T07:00:00Z'],
            ['ACTIVE', '2026-09-05T07:00:00Z'],
            ['FROZEN', '2026-09-20T07:00:00Z'],
          ],
        }),
      ],
    });

    expect(rows).toEqual([]);
  });

  it('dates an enrollment without log rows by statusChangedAt', async () => {
    const rows = await departuresOf({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: lessons('g1'),
      enrollments: [
        enrollment('e6', {
          status: 'FROZEN',
          log: [],
          statusChangedAt: '2026-09-04T07:00:00Z',
        }),
      ],
    });

    expect(rows).toEqual([
      {
        enrollmentId: 'e6',
        changeId: 'ch1',
        departedAt: '2026-09-04T07:00:00.000Z',
        departureStatus: 'FROZEN',
        lessonNumber: 3,
      },
    ]);
  });

  it('does not count a stop after the fifth lesson', async () => {
    const rows = await departuresOf({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: lessons('g1'),
      enrollments: [
        enrollment('e7', {
          status: 'DROPPED',
          log: [
            ['ACTIVE', '2026-08-01T07:00:00Z'],
            ['DROPPED', '2026-09-11T07:00:00Z'],
          ],
        }),
      ],
    });

    expect(rows).toEqual([]);
  });

  it('counts a change with no lesson after it, but nobody left after it', async () => {
    const prisma = fakePrisma({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: [],
      enrollments: [
        enrollment('e8', {
          status: 'DROPPED',
          log: [
            ['ACTIVE', '2026-08-01T07:00:00Z'],
            ['DROPPED', '2026-09-03T07:00:00Z'],
          ],
        }),
      ],
    });

    const result = await loadTeacherChangeDepartures(
      prisma as unknown as PrismaService,
      COMPANY,
      RANGE,
    );

    expect(result.changes.map((c) => c.id)).toEqual(['ch1']);
    expect(result.departures).toEqual([]);
  });

  it('does not count an enrollment that joined the group after the change', async () => {
    const rows = await departuresOf({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: lessons('g1'),
      enrollments: [
        enrollment('e9', {
          status: 'DROPPED',
          createdAt: '2026-09-02T07:00:00Z',
          log: [
            ['ACTIVE', '2026-09-02T07:00:00Z'],
            ['DROPPED', '2026-09-04T07:00:00Z'],
          ],
        }),
      ],
    });

    expect(rows).toEqual([]);
  });

  it("counts a stop inside two changes' windows once, for the earlier change", async () => {
    const rows = await departuresOf({
      changes: [
        change('ch-later', 'g1', '2026-09-03T05:00:00Z'),
        change('ch-earlier', 'g1', CHANGE_AT),
      ],
      lessons: lessons('g1'),
      enrollments: [
        enrollment('e10', {
          status: 'FROZEN',
          log: [
            ['ACTIVE', '2026-08-01T07:00:00Z'],
            ['FROZEN', '2026-09-05T07:00:00Z'],
          ],
        }),
      ],
    });

    expect(rows).toEqual([
      {
        enrollmentId: 'e10',
        changeId: 'ch-earlier',
        departedAt: '2026-09-05T07:00:00.000Z',
        departureStatus: 'FROZEN',
        lessonNumber: 3,
      },
    ]);
  });

  it('reads only the teacher changes of the branches in scope', async () => {
    const stoppedIn = (id: string, groupId: string) =>
      enrollment(id, {
        groupId,
        status: 'DROPPED',
        log: [
          ['ACTIVE', '2026-08-01T07:00:00Z'],
          ['DROPPED', '2026-09-03T07:00:00Z'],
        ],
      });

    const rows = await departuresOf(
      {
        changes: [
          change('ch1', 'g1', CHANGE_AT),
          change('ch2', 'g2', CHANGE_AT, { branchId: 2 }),
        ],
        lessons: [...lessons('g1'), ...lessons('g2')],
        enrollments: [stoppedIn('e11', 'g1'), stoppedIn('e12', 'g2')],
      },
      { ...RANGE, scope: [BRANCH] },
    );

    expect(rows.map((r) => r.enrollmentId)).toEqual(['e11']);
  });

  it('does not count the enrollment of a deleted student', async () => {
    const rows = await departuresOf({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: lessons('g1'),
      enrollments: [
        enrollment('e13', {
          status: 'DROPPED',
          studentDeletedAt: '2026-09-15T07:00:00Z',
          log: [
            ['ACTIVE', '2026-08-01T07:00:00Z'],
            ['DROPPED', '2026-09-03T07:00:00Z'],
          ],
        }),
      ],
    });

    expect(rows).toEqual([]);
  });

  it('does not count a deleted enrollment', async () => {
    const rows = await departuresOf({
      changes: [change('ch1', 'g1', CHANGE_AT)],
      lessons: lessons('g1'),
      enrollments: [
        enrollment('e14', {
          status: 'DROPPED',
          deletedAt: '2026-09-15T07:00:00Z',
          log: [
            ['ACTIVE', '2026-08-01T07:00:00Z'],
            ['DROPPED', '2026-09-03T07:00:00Z'],
          ],
        }),
      ],
    });

    expect(rows).toEqual([]);
  });
});
