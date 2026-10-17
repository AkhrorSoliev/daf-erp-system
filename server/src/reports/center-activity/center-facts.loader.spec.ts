import { CenterFactsLoader } from './center-facts.loader';

const d = (s: string) => new Date(s);

function prismaMock() {
  return {
    room: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'r1',
          name: '1-xona',
          capacity: 16,
          status: 'ACTIVE',
          branchId: 1,
          createdAt: d('2026-05-01T00:00:00Z'),
          deletedAt: null,
          branch: {
            name: "Farg'ona",
            startOfWorkingDay: '08:00',
            endOfWorkingDay: '22:30',
          },
        },
        {
          id: 'r2',
          name: '2-xona',
          capacity: null,
          status: 'ACTIVE',
          branchId: 1,
          createdAt: d('2026-05-01T00:00:00Z'),
          deletedAt: null,
          branch: {
            name: "Farg'ona",
            startOfWorkingDay: '23:00',
            endOfWorkingDay: '07:00',
          },
        },
      ]),
    },
    group: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'g1',
          name: 'A1-04',
          roomId: 'r1',
          branchId: 1,
          courseId: 'c1',
          exactDays: ['monday'],
          lessonStartTime: '10:00',
          lessonEndTime: '11:30',
          startDate: null,
          endDate: null,
          createdAt: d('2026-05-01T00:00:00Z'),
          deletedAt: d('2026-09-10T00:00:00Z'),
          enrollments: [
            {
              id: 'e1',
              createdAt: d('2026-05-02T00:00:00Z'),
              statusChangedAt: d('2026-09-10T00:00:00Z'),
              status: 'DROPPED',
            },
          ],
        },
      ]),
    },
    roomCapacitySnapshot: {
      findMany: jest.fn().mockResolvedValue([
        {
          roomId: 'r1',
          capacity: 12,
          validFrom: d('2026-05-01T00:00:00Z'),
          validTo: d('2026-07-01T00:00:00Z'),
        },
      ]),
    },
    groupScheduleSnapshot: {
      findMany: jest.fn().mockResolvedValue([
        {
          groupId: 'g1',
          exactDays: ['friday'],
          lessonStartTime: '15:00',
          lessonEndTime: '16:00',
          courseId: 'c1',
          validFrom: d('2026-05-01T00:00:00Z'),
          validTo: d('2026-08-01T00:00:00Z'),
        },
      ]),
    },
    coursePriceSnapshot: {
      findMany: jest.fn().mockResolvedValue([
        {
          courseId: 'c1',
          price: 400_000,
          validFrom: d('2026-05-01T00:00:00Z'),
          validTo: null,
        },
      ]),
    },
    course: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'c1',
          name: 'Standart',
          paymentModel: 'MONTHLY',
          price: 450_000,
        },
      ]),
    },
    statusHistory: {
      findMany: jest.fn().mockResolvedValue([
        {
          entityId: 'g1',
          toStatus: 'PAUSED',
          createdAt: d('2026-07-01T00:00:00Z'),
        },
      ]),
    },
    enrollmentStateLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          enrollmentId: 'e1',
          status: 'DROPPED',
          transitionAt: d('2026-09-10T00:00:00Z'),
        },
      ]),
    },
  };
}

const FIRST = d('2026-05-01T00:00:00Z');
const LAST = d('2026-09-30T00:00:00Z');

describe('CenterFactsLoader', () => {
  it('reads deleted groups and their enrollments: no deletedAt filter', async () => {
    const prisma = prismaMock();
    await new CenterFactsLoader(prisma as never).load(1001, [1], FIRST, LAST);
    const groupArgs = prisma.group.findMany.mock.calls[0][0];
    expect(groupArgs.where).toEqual({
      companyId: 1001,
      branchId: { in: [1] },
      createdAt: { lte: LAST },
    });
    expect(groupArgs.select.enrollments.where).toBeUndefined();
    expect(prisma.room.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1001,
      branchId: { in: [1] },
      createdAt: { lte: LAST },
    });
  });

  it('reads nothing for an empty scope', async () => {
    const prisma = prismaMock();
    await new CenterFactsLoader(prisma as never).load(1001, [], FIRST, LAST);
    expect(prisma.group.findMany.mock.calls[0][0].where.branchId).toEqual({
      in: [],
    });
    expect(prisma.room.findMany.mock.calls[0][0].where.branchId).toEqual({
      in: [],
    });
  });

  it('builds rooms with a normalized window and a capacity history', async () => {
    const facts = await new CenterFactsLoader(prismaMock() as never).load(
      1001,
      null,
      FIRST,
      LAST,
    );
    expect(facts.rooms[0].window).toEqual({ start: '08:00', end: '22:30' });
    expect(facts.rooms[1].window).toEqual({ start: '09:00', end: '21:00' }); // reversed → default
    expect(facts.rooms[0].capacityHistory).toEqual([
      {
        validFrom: d('2026-05-01T00:00:00Z'),
        validTo: d('2026-07-01T00:00:00Z'),
        value: 12,
      },
    ]);
    expect(facts.rooms[0].capacityNow).toBe(16);
  });

  it('builds groups with schedule history, status log and completed enrollment logs', async () => {
    const facts = await new CenterFactsLoader(prismaMock() as never).load(
      1001,
      null,
      FIRST,
      LAST,
    );
    const g = facts.groups[0];
    expect(g.scheduleNow).toEqual({
      exactDays: ['monday'],
      start: '10:00',
      end: '11:30',
      courseId: 'c1',
    });
    expect(g.scheduleHistory[0].value).toEqual({
      exactDays: ['friday'],
      start: '15:00',
      end: '16:00',
      courseId: 'c1',
    });
    expect(g.statusLog).toEqual([
      { status: 'PAUSED', at: d('2026-07-01T00:00:00Z') },
    ]);
    // opening row supplied: the log started with DROPPED, created earlier
    expect(g.enrollments[0].log).toEqual([
      { status: 'ACTIVE', transitionAt: d('2026-05-02T00:00:00Z') },
      { status: 'DROPPED', transitionAt: d('2026-09-10T00:00:00Z') },
    ]);
  });

  it('supplies a closing row the log never recorded', async () => {
    const prisma = prismaMock();
    prisma.group.findMany.mockResolvedValue([
      {
        ...(await prisma.group.findMany())[0],
        enrollments: [
          {
            id: 'e1',
            createdAt: d('2026-05-02T00:00:00Z'),
            statusChangedAt: d('2026-08-01T00:00:00Z'),
            status: 'FROZEN',
          },
        ],
      },
    ]);
    prisma.enrollmentStateLog.findMany.mockResolvedValue([
      {
        enrollmentId: 'e1',
        status: 'ACTIVE',
        transitionAt: d('2026-05-02T00:00:00Z'),
      },
    ]);
    const facts = await new CenterFactsLoader(prisma as never).load(
      1001,
      null,
      FIRST,
      LAST,
    );
    expect(facts.groups[0].enrollments[0].log).toEqual([
      { status: 'ACTIVE', transitionAt: d('2026-05-02T00:00:00Z') },
      { status: 'FROZEN', transitionAt: d('2026-08-01T00:00:00Z') },
    ]);
  });

  it('asks for both logs ascending by time, then id', async () => {
    const prisma = prismaMock();
    await new CenterFactsLoader(prisma as never).load(1001, null, FIRST, LAST);
    expect(prisma.statusHistory.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    expect(prisma.enrollmentStateLog.findMany.mock.calls[0][0].orderBy).toEqual(
      [{ transitionAt: 'asc' }, { id: 'asc' }],
    );
  });

  it('maps courses: monthly flag, now-price and price history', async () => {
    const facts = await new CenterFactsLoader(prismaMock() as never).load(
      1001,
      null,
      FIRST,
      LAST,
    );
    expect(facts.courses.get('c1')).toEqual({
      id: 'c1',
      name: 'Standart',
      monthly: true,
      priceNow: 450_000,
      priceHistory: [
        {
          validFrom: d('2026-05-01T00:00:00Z'),
          validTo: null,
          value: 400_000,
        },
      ],
    });
  });

  it('asks the snapshots only for the ids it read', async () => {
    const prisma = prismaMock();
    await new CenterFactsLoader(prisma as never).load(1001, null, FIRST, LAST);
    expect(
      prisma.roomCapacitySnapshot.findMany.mock.calls[0][0].where.roomId,
    ).toEqual({ in: ['r1', 'r2'] });
    expect(
      prisma.groupScheduleSnapshot.findMany.mock.calls[0][0].where.groupId,
    ).toEqual({ in: ['g1'] });
    expect(prisma.statusHistory.findMany.mock.calls[0][0].where).toEqual({
      entityType: 'Group',
      entityId: { in: ['g1'] },
    });
    expect(
      prisma.enrollmentStateLog.findMany.mock.calls[0][0].where.enrollmentId,
    ).toEqual({ in: ['e1'] });
  });
});
