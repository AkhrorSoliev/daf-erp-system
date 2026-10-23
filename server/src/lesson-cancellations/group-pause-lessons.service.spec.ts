import { GroupPauseLessonsService } from './group-pause-lessons.service';

// 23.10.2026 23:15 Tashkent
const NOW = new Date('2026-10-23T18:15:00.000Z');

const group = {
  id: 'g71',
  name: '#071',
  companyId: 1001,
  branchId: 1,
  // Mon, Wed, Fri
  exactDays: ['monday', 'wednesday', 'friday'],
  lessonStartTime: '19:00',
  lessonEndTime: '20:30',
  startDate: new Date('2026-09-21T00:00:00.000Z'),
  endDate: new Date('2027-03-21T00:00:00.000Z'),
  deletedAt: null,
  statusEnum: 'PAUSED',
};

const pause = (over: object = {}) => ({
  id: 'p1',
  groupId: 'g71',
  startedAt: new Date('2026-10-05T07:57:00.000Z'), // 05.10 12:57 Tashkent
  endedAt: null,
  resumeOn: null,
  startedById: 10738,
  endedById: null,
  group,
  ...over,
});

describe('GroupPauseLessonsService', () => {
  let prisma: any;
  let holidays: any;
  let cancellations: any;
  let service: GroupPauseLessonsService;

  beforeEach(() => {
    prisma = {
      groupPause: {
        findMany: jest.fn().mockResolvedValue([pause()]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
      lessonCancellation: { findFirst: jest.fn().mockResolvedValue(null) },
      attendance: { count: jest.fn().mockResolvedValue(0) },
      enrollmentMonthlyCharge: { count: jest.fn().mockResolvedValue(5) },
      group: {
        findUnique: jest.fn().mockResolvedValue({ endDate: group.endDate }),
        update: jest.fn(),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    holidays = { findActiveHolidayCovering: jest.fn().mockResolvedValue(null) };
    cancellations = { create: jest.fn().mockResolvedValue({ id: 'c' }) };
    service = new GroupPauseLessonsService(prisma, holidays, cancellations);
  });

  it('cancels every paid, unheld lesson day from the pause start through today, silently', async () => {
    const r = await service.run(NOW);

    // Mon/Wed/Fri 05.10 .. 23.10: 05, 07, 09, 12, 14, 16, 19, 21, 23
    const days = cancellations.create.mock.calls.map((c: any[]) => c[0].date);
    expect(days).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
      '2026-10-14',
      '2026-10-16',
      '2026-10-19',
      '2026-10-21',
      '2026-10-23',
    ]);
    expect(r).toEqual({ cancelled: 9, failed: 0 });
    const [dto, companyId, actor, roles, options] =
      cancellations.create.mock.calls[0];
    expect(dto.reason).toBe("Guruh pauzada — dars o'tmadi");
    expect([companyId, actor, roles]).toEqual([1001, 10738, []]);
    expect(options).toEqual({ system: true, silent: true });
  });

  it('leaves a day alone that has attendance, a cancellation or no paying student', async () => {
    prisma.attendance.count.mockResolvedValue(1);
    expect((await service.run(NOW)).cancelled).toBe(0);

    prisma.attendance.count.mockResolvedValue(0);
    prisma.lessonCancellation.findFirst.mockResolvedValue({ id: 'x' });
    expect((await service.run(NOW)).cancelled).toBe(0);

    prisma.lessonCancellation.findFirst.mockResolvedValue(null);
    prisma.enrollmentMonthlyCharge.count.mockResolvedValue(0);
    expect((await service.run(NOW)).cancelled).toBe(0);
    expect(cancellations.create).not.toHaveBeenCalled();
  });

  it('does not cancel the lesson of the day the group came back', async () => {
    prisma.groupPause.findMany.mockResolvedValue([
      pause({
        endedAt: new Date('2026-10-19T00:00:00.000Z'),
        resumeOn: new Date('2026-10-19T00:00:00.000Z'),
      }),
    ]);
    const days = (await service.run(NOW)) && cancellations.create.mock.calls;
    expect(days.map((c: any[]) => c[0].date)).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
      '2026-10-12',
      '2026-10-14',
      '2026-10-16',
    ]);
  });

  it('skips a lesson on a branch holiday', async () => {
    holidays.findActiveHolidayCovering.mockResolvedValue({ id: 'h' });
    expect((await service.run(NOW)).cancelled).toBe(0);
  });

  it('counts a failed day and goes on with the next', async () => {
    cancellations.create
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ id: 'c' });
    const r = await service.run(NOW);
    expect(r).toEqual({ cancelled: 8, failed: 1 });
  });

  it('moves the group end date by one lesson day per cancelled lesson', async () => {
    prisma.groupPause.findMany.mockResolvedValue([
      pause({ startedAt: new Date('2026-10-21T00:00:00.000Z') }),
    ]);
    // 21.10 (Wed) and 23.10 (Fri) were cancelled
    await service.run(NOW);

    const moved = prisma.group.update.mock.calls.map((c: any[]) =>
      c[0].data.endDate.toISOString().slice(0, 10),
    );
    // end 21.03.2027 is a Sunday: next lesson days are Mon 22.03, Wed 24.03
    expect(moved).toEqual(['2027-03-22', '2027-03-22']);
  });
});
