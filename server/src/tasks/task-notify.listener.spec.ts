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

describe('TaskNotifyListener', () => {
  let listener: TaskNotifyListener;
  let prisma: any;
  let notif: any;
  let gateway: any;
  let push: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 30, firstName: 'Soliyev', lastName: 'A.' },
          { id: 40, firstName: 'Rahimov', lastName: 'A.' },
          { id: 41, firstName: 'Azizova', lastName: 'M.' },
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
    expect(where).toMatchObject({ deletedAt: null, isActive: true });

    expect(notif.create).toHaveBeenCalledTimes(1);
    expect(notif.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 41,
        type: 'TASK_ASSIGNED',
        taskId: 't1',
        relatedEntityType: 'Task',
        relatedEntityId: 't1',
        companyId: 1,
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

  it('reassigned: the leaver and the new assignees are loaded for names', async () => {
    await listener.onReassigned({
      task,
      fromUserId: 50,
      toUserIds: [41],
    } as any);
    const ids = prisma.user.findMany.mock.calls[0][0].where.id.in;
    expect(ids).toEqual(expect.arrayContaining([50, 41]));
  });

  it('a recipient who is no longer active gets no bell, no push', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 30, firstName: 'Soliyev', lastName: 'A.' },
    ]);
    await listener.onAssigned({
      task,
      actorId: 30,
      userIds: [41],
    } as any);
    expect(notif.create).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('never throws into the emitter', async () => {
    prisma.user.findMany.mockRejectedValue(new Error('db down'));
    await expect(
      listener.onCommented({ task, actorId: 40, text: 'x' } as any),
    ).resolves.toBeUndefined();
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
