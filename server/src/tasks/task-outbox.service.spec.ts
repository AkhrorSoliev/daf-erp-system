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

  it('schedule writes REMINDER for assignees and OVERDUE for assignees + author, only in the future', async () => {
    const dueAt = new Date(Date.now() + 3 * 3600_000);
    await svc.schedule(prisma, {
      id: 't1',
      dueAt,
      authorId: 30,
      participants: [
        { userId: 40, role: 'ASSIGNEE' },
        { userId: 50, role: 'WATCHER' },
      ],
    });
    const rows = prisma.taskOutbox.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.userId, r.kind])).toEqual([
      [40, 'REMINDER'],
      [40, 'OVERDUE'],
      [30, 'OVERDUE'],
    ]);
    expect(rows[0].sendAfter.getTime()).toBe(dueAt.getTime() - 3600_000);
  });

  it('schedule clears every earlier row, sent ones included, so a moved deadline notifies again', async () => {
    await svc.schedule(prisma, {
      id: 't1',
      dueAt: new Date(Date.now() + 3 * 3600_000),
      authorId: 30,
      participants: [{ userId: 40, role: 'ASSIGNEE' }],
    });
    expect(prisma.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
    });
  });

  it('schedule without a due date only clears', async () => {
    await svc.schedule(prisma, {
      id: 't1',
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
      dueAt: new Date(),
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

  it('drain with nothing due does not look anyone up', async () => {
    expect(await svc.drain()).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
