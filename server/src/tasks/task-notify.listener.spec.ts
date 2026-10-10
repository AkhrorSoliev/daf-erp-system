import { Test } from '@nestjs/testing';
import { TaskNotifyListener } from './task-notify.listener';
import { TASK_EVENTS, type TaskEventTask } from './task-events';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';

const task: TaskEventTask = {
  id: 't1',
  companyId: 1,
  title: 'Oktabr banneri',
  kind: 'MANUAL',
  authorId: 30,
  dueAt: null,
  status: 'NEW',
  participants: [{ userId: 40, role: 'ASSIGNEE' }],
};

const user = (id: number, first: string, over: object = {}) => ({
  id,
  firstName: first,
  lastName: 'A.',
  deletedAt: null,
  isActive: true,
  status: 'ACTIVE',
  ...over,
});

describe('TaskNotifyListener', () => {
  let listener: TaskNotifyListener;
  let prisma: any;
  let notif: any;
  let gateway: any;
  let push: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            user(30, 'Soliyev'),
            user(40, 'Rahimov'),
            user(41, 'Azizova'),
          ]),
      },
    };
    notif = { create: jest.fn().mockResolvedValue({ id: 'n1' }) };
    gateway = { sendToUser: jest.fn() };
    push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const mod = await Test.createTestingModule({
      providers: [
        TaskNotifyListener,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notif },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: PushService, useValue: push },
      ],
    }).compile();
    listener = mod.get(TaskNotifyListener);
  });

  it('assigned: loads the added users too, writes bell + SSE + push, then pings every participant', async () => {
    await listener.onAssigned({
      task,
      actorId: 30,
      userIds: [41],
    } as any);

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect([...where.id.in].sort()).toEqual([30, 40, 41]);

    expect(notif.create).toHaveBeenCalledTimes(1);
    expect(notif.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 41,
        type: 'TASK_ASSIGNED',
        taskId: 't1',
        relatedEntityType: 'Task',
        relatedEntityId: 't1',
        companyId: 1,
        actionRequired: true,
      }),
    );
    expect(gateway.sendToUser).toHaveBeenCalledWith(41, {
      type: 'notification',
      notification: { id: 'n1' },
    });
    expect(push.sendToUser).toHaveBeenCalledWith(
      41,
      expect.objectContaining({ url: '/tasks?task=t1' }),
    );
    for (const uid of [30, 40, 41]) {
      expect(gateway.sendToUser).toHaveBeenCalledWith(uid, {
        type: 'task.updated',
        taskId: 't1',
      });
    }
  });

  it("passes the plan's actionRequired: a watcher is told, not asked", async () => {
    await listener.onAssigned({
      task: {
        ...task,
        participants: [
          { userId: 40, role: 'ASSIGNEE' },
          { userId: 41, role: 'WATCHER' },
        ],
      },
      actorId: 30,
      userIds: [41],
    } as any);

    expect(notif.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 41,
        title: 'Kuzatuvchi qilindingiz',
        actionRequired: false,
      }),
    );
  });

  it('reassigned: the leaver is named even though he is no longer active', async () => {
    prisma.user.findMany.mockResolvedValue([
      user(30, 'Soliyev'),
      user(41, 'Azizova'),
      user(50, 'Karimov', { status: 'TERMINATED', isActive: false }),
    ]);
    await listener.onReassigned({
      task,
      fromUserId: 50,
      toUserIds: [41],
    } as any);

    const ids = prisma.user.findMany.mock.calls[0][0].where.id.in;
    expect(ids).toEqual(expect.arrayContaining([50, 41]));
    expect(notif.create).toHaveBeenCalledTimes(1);
    expect(notif.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 41,
        message: expect.stringContaining('Karimov A.'),
      }),
    );
  });

  it('the actor is named even when he is neither author nor participant', async () => {
    prisma.user.findMany.mockResolvedValue([
      user(30, 'Soliyev'),
      user(40, 'Rahimov'),
      user(1, 'Direktor'),
    ]);
    await listener.onCancelled({ task, actorId: 1, reason: null } as any);
    expect(prisma.user.findMany.mock.calls[0][0].where.id.in).toContain(1);
    expect(notif.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 40,
        message: expect.stringContaining('Direktor A.'),
      }),
    );
  });

  it.each([
    ['not active', { isActive: false }],
    ['suspended', { status: 'SUSPENDED' }],
    ['archived', { deletedAt: new Date() }],
  ])('a recipient who is %s gets no bell and no push', async (_l, over) => {
    prisma.user.findMany.mockResolvedValue([
      user(30, 'Soliyev'),
      user(41, 'Azizova', over),
    ]);
    await listener.onAssigned({
      task,
      actorId: 30,
      userIds: [41],
    } as any);
    expect(notif.create).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('one failing recipient does not cost the others their notice, and the pings still go out', async () => {
    notif.create.mockRejectedValueOnce(new Error('boom'));
    await listener.onAssigned({
      task,
      actorId: 30,
      userIds: [40, 41],
    } as any);

    expect(notif.create).toHaveBeenCalledTimes(2);
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(push.sendToUser).toHaveBeenCalledWith(41, expect.anything());
    for (const uid of [30, 40, 41]) {
      expect(gateway.sendToUser).toHaveBeenCalledWith(uid, {
        type: 'task.updated',
        taskId: 't1',
      });
    }
  });

  it('never throws into the emitter, and still pings the task page when the lookup fails', async () => {
    prisma.user.findMany.mockRejectedValue(new Error('db down'));
    await expect(
      listener.onCommented({ task, actorId: 40, text: 'x' } as any),
    ).resolves.toBeUndefined();
    expect(gateway.sendToUser).toHaveBeenCalledWith(30, {
      type: 'task.updated',
      taskId: 't1',
    });
  });

  it('a self task notifies nobody but still refreshes the open page', async () => {
    const selfTask = {
      ...task,
      participants: [{ userId: 30, role: 'ASSIGNEE' as const }],
    };
    await listener.onAssigned({
      task: selfTask,
      actorId: 30,
      userIds: [30],
    } as any);
    expect(notif.create).not.toHaveBeenCalled();
    expect(gateway.sendToUser).toHaveBeenCalledWith(30, {
      type: 'task.updated',
      taskId: 't1',
    });
  });

  it('listens to every task event', () => {
    const listened = Object.getOwnPropertyNames(TaskNotifyListener.prototype)
      .flatMap(
        (name) =>
          (Reflect.getMetadata(
            'EVENT_LISTENER_METADATA',
            (TaskNotifyListener.prototype as any)[name],
          ) ?? []) as { event: string }[],
      )
      .map((m) => m.event)
      .sort();
    expect(listened).toEqual(Object.values(TASK_EVENTS).sort());
  });
});
