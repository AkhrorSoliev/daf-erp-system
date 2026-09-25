import { PrismaService } from '../../prisma/prisma.service';
import { DEPARTURE_GRACE_DAYS } from '../../students/shared/departure-episodes';
import { loadDepartures } from './departures.loader';

const at = (s: string) => new Date(s);
const NOW = at('2026-11-20T12:00:00Z');
const MAY = '2026-05-01T09:00:00.000Z';

interface Fixture {
  students?: { id: number; status: string; statusChangedAt: Date | null }[];
  enrollments?: {
    id: string;
    studentId: number;
    status: string;
    createdAt: Date;
    statusChangedAt: Date | null;
  }[];
  logs?: { enrollmentId: string; status: string; transitionAt: Date }[];
  history?: {
    entityId: string;
    fromStatus: string | null;
    toStatus: string;
    createdAt: Date;
  }[];
  systemStartDate?: Date | null;
}

function fakePrisma(f: Fixture) {
  return {
    company: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ systemStartDate: f.systemStartDate ?? null }),
    },
    student: { findMany: jest.fn().mockResolvedValue(f.students ?? []) },
    enrollment: { findMany: jest.fn().mockResolvedValue(f.enrollments ?? []) },
    enrollmentStateLog: { findMany: jest.fn().mockResolvedValue(f.logs ?? []) },
    statusHistory: { findMany: jest.fn().mockResolvedValue(f.history ?? []) },
  };
}

const student = (
  id: number,
  status = 'ACTIVE',
  statusChangedAt: string | null = null,
) => ({
  id,
  status,
  statusChangedAt: statusChangedAt ? at(statusChangedAt) : null,
});
const enrollment = (
  id: string,
  studentId: number,
  status: string,
  statusChangedAt: string | null,
  createdAt = MAY,
) => ({
  id,
  studentId,
  status,
  createdAt: at(createdAt),
  statusChangedAt: statusChangedAt ? at(statusChangedAt) : null,
});
const log = (enrollmentId: string, status: string, when: string) => ({
  enrollmentId,
  status,
  transitionAt: at(when),
});
const history = (
  studentId: number,
  fromStatus: string | null,
  toStatus: string,
  when: string,
) => ({
  entityId: String(studentId),
  fromStatus,
  toStatus,
  createdAt: at(when),
});

async function episodesOf(f: Fixture) {
  const prisma = fakePrisma(f);
  const result = await loadDepartures(
    prisma as unknown as PrismaService,
    1001,
    null,
    { now: NOW },
  );
  return result.episodes.map((e) => ({
    studentId: e.studentId,
    startedAt: e.startedAt.toISOString(),
    stopKind: e.stopKind,
    state: e.state,
  }));
}

describe('loadDepartures', () => {
  it('reads students through the branch scope, never PROSPECT or deleted cards', async () => {
    const prisma = fakePrisma({});
    await loadDepartures(prisma as unknown as PrismaService, 1001, [3, 7], {
      now: NOW,
    });
    expect(prisma.student.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 1001,
        deletedAt: null,
        status: { not: 'PROSPECT' },
        branches: { some: { branchId: { in: [3, 7] } } },
      },
      select: { id: true, status: true, statusChangedAt: true },
    });
  });

  it('stops after the student query when nobody is in scope', async () => {
    const prisma = fakePrisma({});
    const result = await loadDepartures(
      prisma as unknown as PrismaService,
      1001,
      null,
      { now: NOW },
    );
    expect(result).toEqual({
      episodes: [],
      activeAtStart: 0,
      floor: null,
      graceDays: DEPARTURE_GRACE_DAYS,
    });
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    expect(prisma.statusHistory.findMany).not.toHaveBeenCalled();
  });

  it('chains every later query to the students it found', async () => {
    const prisma = fakePrisma({ students: [student(10001), student(10002)] });
    await loadDepartures(prisma as unknown as PrismaService, 1001, [3], {
      now: NOW,
    });
    expect(prisma.enrollment.findMany.mock.calls[0][0].where).toEqual({
      studentId: { in: [10001, 10002] },
      deletedAt: null,
    });
    expect(prisma.enrollmentStateLog.findMany.mock.calls[0][0].where).toEqual({
      enrollment: { studentId: { in: [10001, 10002] }, deletedAt: null },
    });
    expect(prisma.statusHistory.findMany.mock.calls[0][0].where).toEqual({
      entityType: 'Student',
      entityId: { in: ['10001', '10002'] },
    });
  });

  it('turns leaving the last group into a departure', async () => {
    expect(
      await episodesOf({
        students: [student(10001)],
        enrollments: [
          enrollment('e1', 10001, 'DROPPED', '2026-08-01T09:00:00Z'),
        ],
        logs: [
          log('e1', 'ACTIVE', MAY),
          log('e1', 'DROPPED', '2026-08-01T09:00:00Z'),
        ],
      }),
    ).toEqual([
      {
        studentId: 10001,
        startedAt: '2026-08-01T09:00:00.000Z',
        stopKind: 'LEFT_GROUP',
        state: 'confirmed',
      },
    ]);
  });

  it('does not treat a transfer as leaving', async () => {
    expect(
      await episodesOf({
        students: [student(10001)],
        enrollments: [
          enrollment('e1', 10001, 'TRANSFERRED', '2026-06-01T09:00:00.000Z'),
          enrollment('e2', 10001, 'ACTIVE', null, '2026-06-01T09:00:00.005Z'),
        ],
        logs: [
          log('e1', 'ACTIVE', MAY),
          log('e1', 'TRANSFERRED', '2026-06-01T09:00:00.000Z'),
          log('e2', 'ACTIVE', '2026-06-01T09:00:00.005Z'),
        ],
      }),
    ).toEqual([]);
  });

  it('does not treat a finished group or archiving a graduate as leaving', async () => {
    expect(
      await episodesOf({
        students: [student(10001, 'ARCHIVED')],
        enrollments: [
          enrollment('e1', 10001, 'COMPLETED', '2026-07-01T09:00:00Z'),
        ],
        logs: [
          log('e1', 'ACTIVE', MAY),
          log('e1', 'COMPLETED', '2026-07-01T09:00:00Z'),
        ],
        history: [
          history(10001, 'ACTIVE', 'GRADUATED', '2026-07-01T09:00:01Z'),
          history(10001, 'GRADUATED', 'ARCHIVED', '2026-08-01T09:00:00Z'),
        ],
      }),
    ).toEqual([]);
  });

  it('names an expulsion by the status, not by the enrollment it closed', async () => {
    expect(
      await episodesOf({
        students: [student(10001, 'EXPELLED')],
        enrollments: [
          enrollment('e1', 10001, 'DROPPED', '2026-09-10T09:00:00.000Z'),
        ],
        logs: [
          log('e1', 'ACTIVE', MAY),
          log('e1', 'DROPPED', '2026-09-10T09:00:00.000Z'),
        ],
        history: [
          history(10001, 'ACTIVE', 'EXPELLED', '2026-09-10T09:00:00.100Z'),
        ],
      }),
    ).toEqual([
      {
        studentId: 10001,
        startedAt: '2026-09-10T09:00:00.000Z',
        stopKind: 'EXPELLED',
        state: 'confirmed',
      },
    ]);
  });

  it('forgets a freeze the student came back from within the grace period', async () => {
    expect(
      await episodesOf({
        students: [student(10001)],
        enrollments: [
          enrollment('e1', 10001, 'ACTIVE', '2026-08-06T09:00:00Z'),
        ],
        logs: [
          log('e1', 'ACTIVE', MAY),
          log('e1', 'FROZEN', '2026-08-01T09:00:00Z'),
          log('e1', 'ACTIVE', '2026-08-06T09:00:00Z'),
        ],
        history: [
          history(10001, 'ACTIVE', 'FROZEN', '2026-08-01T09:00:00Z'),
          history(10001, 'FROZEN', 'ACTIVE', '2026-08-06T09:00:00Z'),
        ],
      }),
    ).toEqual([]);
  });

  it('completes a log that never recorded the closing from the row', async () => {
    expect(
      await episodesOf({
        students: [student(10001)],
        enrollments: [
          enrollment('e1', 10001, 'DROPPED', '2026-08-01T09:00:00Z'),
        ],
        logs: [log('e1', 'ACTIVE', MAY)],
      }),
    ).toEqual([
      {
        studentId: 10001,
        startedAt: '2026-08-01T09:00:00.000Z',
        stopKind: 'LEFT_GROUP',
        state: 'confirmed',
      },
    ]);
  });

  it('reads an enrollment with no log rows from its columns', async () => {
    expect(
      await episodesOf({
        students: [student(10001)],
        enrollments: [
          enrollment('e1', 10001, 'DROPPED', '2026-08-01T09:00:00Z'),
        ],
      }),
    ).toEqual([
      {
        studentId: 10001,
        startedAt: '2026-08-01T09:00:00.000Z',
        stopKind: 'LEFT_GROUP',
        state: 'confirmed',
      },
    ]);
  });

  it('reads a legacy expulsion from the card when StatusHistory has no row', async () => {
    expect(
      await episodesOf({
        students: [student(10001, 'EXPELLED', '2026-08-01T09:00:00Z')],
        enrollments: [
          enrollment('e1', 10001, 'DROPPED', '2026-08-01T09:00:00Z'),
        ],
      }),
    ).toEqual([
      {
        studentId: 10001,
        startedAt: '2026-08-01T09:00:00.000Z',
        stopKind: 'EXPELLED',
        state: 'confirmed',
      },
    ]);
  });

  it('ignores a status change of a student who never joined a group', async () => {
    expect(
      await episodesOf({
        students: [student(10001, 'ARCHIVED')],
        history: [history(10001, 'ACTIVE', 'ARCHIVED', '2026-08-01T09:00:00Z')],
      }),
    ).toEqual([]);
  });

  it('never turns a groupless freeze into a departure', async () => {
    expect(
      await episodesOf({
        students: [student(10002)],
        history: [
          history(10002, 'ACTIVE', 'FROZEN', '2026-08-01T09:00:00Z'),
          history(10002, 'FROZEN', 'ACTIVE', '2026-08-04T09:00:00Z'),
        ],
      }),
    ).toEqual([]);
  });

  it('does not read a legacy ARCHIVED card as a departure', async () => {
    expect(
      await episodesOf({
        students: [student(10001, 'ARCHIVED', '2026-08-01T09:00:00Z')],
      }),
    ).toEqual([]);
  });

  it('counts who was in a group at the start, moved up to the reporting floor', async () => {
    const prisma = fakePrisma({
      systemStartDate: at('2026-06-01T00:00:00Z'),
      students: [student(10001), student(10002)],
      enrollments: [
        enrollment('e1', 10001, 'DROPPED', '2026-06-10T09:00:00Z'),
        enrollment('e2', 10002, 'ACTIVE', null, '2026-05-20T09:00:00Z'),
      ],
      logs: [
        log('e1', 'ACTIVE', MAY),
        log('e1', 'DROPPED', '2026-06-10T09:00:00Z'),
        log('e2', 'ACTIVE', '2026-05-20T09:00:00Z'),
      ],
    });
    const result = await loadDepartures(
      prisma as unknown as PrismaService,
      1001,
      null,
      {
        now: NOW,
        activeAt: at('2026-05-15T00:00:00Z'),
      },
    );
    // At the floor (01.06) both students are in a group; on 15.05 only 10001 was,
    // so the clamp moves activeAt to the floor and captures the additional student.
    expect(result.activeAtStart).toBe(2);
    expect(result.floor).toEqual(at('2026-06-01T00:00:00Z'));
  });
});
