import { Test } from '@nestjs/testing';
import { TaskOutboxService } from './task-outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';

describe('TaskOutboxService', () => {
  let svc: TaskOutboxService;
  let prisma: any;
  let notif: any;
  let push: any;

  beforeEach(async () => {
    prisma = {
      taskOutbox: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 40 }]) },
    };
    notif = { create: jest.fn().mockResolvedValue({ id: 'n1' }) };
    push = { sendToUser: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        TaskOutboxService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notif },
        {
          provide: NotificationsGateway,
          useValue: { sendToUser: jest.fn() },
        },
        { provide: PushService, useValue: push },
      ],
    }).compile();
    svc = mod.get(TaskOutboxService);
  });

  const written = () =>
    prisma.taskOutbox.createMany.mock.calls[0][0].data as any[];
  const inapp = () => written().filter((r) => r.channel === 'INAPP');
  const telegram = () =>
    written()
      .filter((r) => r.channel === 'TELEGRAM')
      .map((r) => [r.userId, r.kind, r.sendAfter.toISOString()]);

  it('schedule writes REMINDER for assignees and OVERDUE for assignees + author, only in the future', async () => {
    const dueAt = new Date(Date.now() + 3 * 3600_000);
    await svc.schedule(prisma, {
      id: 't1',
      kind: 'MANUAL' as const,
      priority: 'MEDIUM' as const,
      dueAt,
      authorId: 30,
      participants: [
        { userId: 40, role: 'ASSIGNEE' },
        { userId: 50, role: 'WATCHER' },
      ],
    });
    const rows = inapp();
    expect(rows.map((r: any) => [r.userId, r.kind])).toEqual([
      [40, 'REMINDER'],
      [40, 'OVERDUE'],
      [30, 'OVERDUE'],
    ]);
    expect(rows[0].sendAfter.getTime()).toBe(dueAt.getTime() - 3600_000);
  });

  it('schedule with a due 30 minutes ahead writes only the OVERDUE rows (the reminder time has passed)', async () => {
    const dueAt = new Date(Date.now() + 30 * 60_000);
    await svc.schedule(prisma, {
      id: 't1',
      kind: 'MANUAL' as const,
      priority: 'MEDIUM' as const,
      dueAt,
      authorId: 30,
      participants: [{ userId: 40, role: 'ASSIGNEE' }],
    });
    const rows = inapp();
    expect(rows.map((r: any) => [r.userId, r.kind])).toEqual([
      [40, 'OVERDUE'],
      [30, 'OVERDUE'],
    ]);
    expect(rows[0].sendAfter.getTime()).toBe(dueAt.getTime());
  });

  it('schedule clears every earlier time row, sent ones included, and keeps queued Telegram notices', async () => {
    await svc.schedule(prisma, {
      id: 't1',
      kind: 'MANUAL' as const,
      priority: 'MEDIUM' as const,
      dueAt: new Date(Date.now() + 3 * 3600_000),
      authorId: 30,
      participants: [{ userId: 40, role: 'ASSIGNEE' }],
    });
    expect(prisma.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', kind: { in: ['REMINDER', 'OVERDUE'] } },
    });
  });

  it('schedule without a due date only clears', async () => {
    await svc.schedule(prisma, {
      id: 't1',
      kind: 'MANUAL' as const,
      priority: 'MEDIUM' as const,
      dueAt: null,
      authorId: 30,
      participants: [{ userId: 40, role: 'ASSIGNEE' }],
    });
    expect(prisma.taskOutbox.deleteMany).toHaveBeenCalled();
    expect(prisma.taskOutbox.createMany).not.toHaveBeenCalled();
  });

  it('schedule with a past due writes nothing (the overdue notice would be noise)', async () => {
    await svc.schedule(prisma, {
      id: 't1',
      kind: 'MANUAL' as const,
      priority: 'MEDIUM' as const,
      dueAt: new Date(Date.now() - 1000),
      authorId: 30,
      participants: [{ userId: 40, role: 'ASSIGNEE' }],
    });
    expect(prisma.taskOutbox.createMany).not.toHaveBeenCalled();
  });

  const row = (id: string, status: string, over: object = {}) => ({
    id,
    userId: 40,
    kind: 'REMINDER',
    task: {
      id: 't-' + id,
      title: 'A',
      status,
      dueAt: new Date(Date.now() + 30 * 60_000),
      companyId: 1,
      author: null,
    },
    ...over,
  });

  it('drain sends open tasks to active users and marks closed ones without sending', async () => {
    prisma.taskOutbox.findMany.mockResolvedValue([
      row('o1', 'NEW'),
      row('o2', 'DONE'),
    ]);
    expect(await svc.drain()).toBe(1);
    expect(notif.create).toHaveBeenCalledTimes(1);
    expect(notif.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 40,
        type: 'TASK_REMINDER',
        taskId: 't-o1',
        relatedEntityType: 'Task',
      }),
    );
    expect(push.sendToUser).toHaveBeenCalledWith(
      40,
      expect.objectContaining({ url: '/tasks?task=t-o1' }),
    );
    expect(prisma.taskOutbox.update).toHaveBeenCalledWith({
      where: { id: 'o2' },
      data: expect.objectContaining({ lastError: 'task closed' }),
    });
  });

  it('drain loads the recipients once and skips an inactive one', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 40 }]);
    prisma.taskOutbox.findMany.mockResolvedValue([
      row('o1', 'NEW'),
      row('o2', 'NEW', { userId: 41, kind: 'OVERDUE' }),
    ]);
    expect(await svc.drain()).toBe(1);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      id: { in: [40, 41] },
      deletedAt: null,
      isActive: true,
      status: 'ACTIVE',
    });
    expect(notif.create).toHaveBeenCalledTimes(1);
    expect(prisma.taskOutbox.update).toHaveBeenCalledWith({
      where: { id: 'o2' },
      data: expect.objectContaining({ lastError: 'user inactive' }),
    });
  });

  it('drain words an overdue row differently', async () => {
    prisma.taskOutbox.findMany.mockResolvedValue([
      row('o1', 'IN_PROGRESS', { kind: 'OVERDUE' }),
    ]);
    await svc.drain();
    expect(notif.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TASK_OVERDUE',
        title: "Muddati o'tdi",
      }),
    );
  });

  it('drain counts a failed send as an attempt and goes on', async () => {
    notif.create.mockRejectedValueOnce(new Error('boom'));
    prisma.taskOutbox.findMany.mockResolvedValue([
      row('o1', 'NEW'),
      row('o2', 'NEW'),
    ]);
    expect(await svc.drain()).toBe(1);
    expect(prisma.taskOutbox.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: {
        attempts: { increment: 1 },
        lastError: 'boom',
      },
    });
  });

  it('drain marks a reminder whose deadline has passed as stale instead of sending it', async () => {
    prisma.taskOutbox.findMany.mockResolvedValue([
      row('o1', 'NEW', {
        task: {
          id: 't-o1',
          title: 'A',
          status: 'NEW',
          dueAt: new Date(Date.now() - 60_000),
          companyId: 1,
          author: null,
        },
      }),
      row('o2', 'NEW', {
        kind: 'OVERDUE',
        task: {
          id: 't-o2',
          title: 'B',
          status: 'NEW',
          dueAt: new Date(Date.now() - 60_000),
          companyId: 1,
          author: null,
        },
      }),
    ]);
    expect(await svc.drain()).toBe(1);
    expect(notif.create).toHaveBeenCalledTimes(1);
    expect(notif.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TASK_OVERDUE' }),
    );
    expect(prisma.taskOutbox.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: expect.objectContaining({ lastError: 'stale reminder' }),
    });
  });

  it('a second drain while one is running does nothing, and the guard is released afterwards', async () => {
    let release!: (v: unknown[]) => void;
    prisma.taskOutbox.findMany.mockReturnValueOnce(
      new Promise<unknown[]>((r) => (release = r)),
    );
    const first = svc.drain();
    expect(await svc.drain()).toBe(0);
    expect(prisma.taskOutbox.findMany).toHaveBeenCalledTimes(1);
    release([]);
    await first;
    await svc.drain();
    expect(prisma.taskOutbox.findMany).toHaveBeenCalledTimes(2);
  });

  it('the guard is released even when a run throws', async () => {
    prisma.taskOutbox.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.drain()).rejects.toThrow('db down');
    await expect(svc.drain()).resolves.toBe(0);
    expect(prisma.taskOutbox.findMany).toHaveBeenCalledTimes(2);
  });

  it('drain with nothing due does not look anyone up', async () => {
    expect(await svc.drain()).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  describe('Telegram time rows (spec §6.4, §9.3)', () => {
    afterEach(() => jest.useRealTimers());
    const base = {
      id: 't1',
      kind: 'MANUAL' as const,
      authorId: 30,
      participants: [{ userId: 40, role: 'ASSIGNEE' as const }],
    };

    it('writes a TELEGRAM row next to every in-app row; a night one waits for 08:00', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-12T05:00:00.000Z'));
      // Due 13.10 08:30 Tashkent: the reminder (07:30) falls in the quiet hours.
      await svc.schedule(prisma, {
        ...base,
        priority: 'MEDIUM',
        dueAt: new Date('2026-10-13T03:30:00.000Z'),
      });
      expect(telegram()).toEqual([
        [40, 'REMINDER', '2026-10-13T03:00:00.000Z'],
        [40, 'OVERDUE', '2026-10-13T03:30:00.000Z'],
        [30, 'OVERDUE', '2026-10-13T03:30:00.000Z'],
      ]);
      expect(inapp()[0].sendAfter.toISOString()).toBe(
        '2026-10-13T02:30:00.000Z',
      );
    });

    it('an URGENT task is told at night too', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-12T05:00:00.000Z'));
      // Due 12.10 22:00 Tashkent.
      await svc.schedule(prisma, {
        ...base,
        priority: 'URGENT',
        dueAt: new Date('2026-10-12T17:00:00.000Z'),
      });
      expect(telegram()).toContainEqual([
        40,
        'OVERDUE',
        '2026-10-12T17:00:00.000Z',
      ]);
    });

    it("«Dars bo'ldimi?» gets no Telegram rows", async () => {
      await svc.schedule(prisma, {
        ...base,
        kind: 'LESSON_QUESTION',
        priority: 'HIGH',
        authorId: null,
        dueAt: new Date(Date.now() + 3 * 3600_000),
      });
      expect(telegram()).toEqual([]);
      expect(inapp()).toHaveLength(2);
    });

    it('skips a duplicate time row instead of failing (partial unique index)', async () => {
      await svc.schedule(prisma, {
        ...base,
        priority: 'MEDIUM',
        dueAt: new Date(Date.now() + 3 * 3600_000),
      });
      expect(prisma.taskOutbox.createMany.mock.calls[0][0].skipDuplicates).toBe(
        true,
      );
    });
  });

  it('purge drops sent rows and dead rows older than 30 days', async () => {
    prisma.taskOutbox.deleteMany.mockResolvedValue({ count: 4 });
    await expect(svc.purge(new Date('2026-11-10T22:00:00.000Z'))).resolves.toBe(
      4,
    );
    const before = new Date('2026-10-11T22:00:00.000Z');
    expect(prisma.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { sentAt: { lt: before } },
          { sentAt: null, attempts: { gte: 3 }, createdAt: { lt: before } },
        ],
      },
    });
  });
});
