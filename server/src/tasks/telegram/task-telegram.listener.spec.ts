import { Logger } from '@nestjs/common';
import { TASK_EVENTS, type TaskEventTask } from '../task-events';
import { loadTaskView, staffChatOf } from './task-telegram-view';
import { TaskTelegramListener } from './task-telegram.listener';

jest.mock('./task-telegram-view', () => ({
  ...jest.requireActual('./task-telegram-view'),
  loadTaskView: jest.fn(),
  staffChatOf: jest.fn(),
}));

const task: TaskEventTask = {
  id: 't1',
  companyId: 1,
  title: 'Banner',
  kind: 'MANUAL',
  authorId: 30,
  dueAt: null,
  status: 'NEW',
  participants: [
    { userId: 40, role: 'ASSIGNEE' },
    { userId: 50, role: 'WATCHER' },
  ],
};
const view = (priority = 'MEDIUM') => ({
  id: 't1',
  companyId: 1,
  kind: 'MANUAL',
  title: 'Banner',
  status: 'NEW',
  priority,
  dueAt: null,
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [
    { userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' },
    { userId: 50, role: 'WATCHER', name: 'Karimov B.' },
  ],
  steps: [],
});
const DAY = new Date('2026-10-12T06:00:00.000Z'); // 11:00 Tashkent
const NIGHT = new Date('2026-10-12T17:30:00.000Z'); // 22:30 Tashkent
const MORNING = new Date('2026-10-13T03:00:00.000Z'); // 08:00 Tashkent
const assigned = { task, actorId: 30, userIds: [40], created: true };

function setup() {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 30, firstName: 'Ahror', lastName: 'Soliyev' },
        { id: 40, firstName: 'Aziz', lastName: 'Rahimov' },
      ]),
    },
    taskOutbox: { create: jest.fn().mockResolvedValue({}) },
  };
  const sender = {
    send: jest.fn().mockResolvedValue({ status: 'sent', messageId: 1 }),
  };
  (loadTaskView as jest.Mock).mockResolvedValue(view());
  (staffChatOf as jest.Mock).mockResolvedValue({ chatId: '700', roleIds: [4] });
  return {
    listener: new TaskTelegramListener(prisma as any, sender as any),
    prisma,
    sender,
  };
}

describe('TaskTelegramListener', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks(); // the module mocks keep their calls between tests
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it("in the day: sends right away, to the plan's Telegram recipients only", async () => {
    const { listener, sender, prisma } = setup();
    await listener.handle(
      TASK_EVENTS.ASSIGNED,
      { ...assigned, userIds: [40, 50] } as any,
      DAY,
    );
    expect(sender.send).toHaveBeenCalledTimes(1); // 50 is a watcher
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      40,
      { kind: 'ASSIGNED' },
    );
    expect(prisma.taskOutbox.create).not.toHaveBeenCalled();
  });

  it('at 22:30: nothing is sent, the notice waits for 08:00', async () => {
    const { listener, sender, prisma } = setup();
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, NIGHT);
    expect(sender.send).not.toHaveBeenCalled();
    expect(prisma.taskOutbox.create).toHaveBeenCalledWith({
      data: {
        taskId: 't1',
        userId: 40,
        channel: 'TELEGRAM',
        kind: 'NOTICE',
        payload: { kind: 'ASSIGNED' },
        sendAfter: MORNING,
        attempts: 0,
        lastError: null,
      },
    });
  });

  it('at night, nothing is held for somebody the message could not reach', async () => {
    const { listener, sender, prisma } = setup();
    (staffChatOf as jest.Mock).mockResolvedValue(null); // unlinked, inactive or a shared chat
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, NIGHT);
    expect(staffChatOf).toHaveBeenCalledWith(prisma, 40);
    expect(sender.send).not.toHaveBeenCalled();
    expect(prisma.taskOutbox.create).not.toHaveBeenCalled();
  });

  it('an URGENT task goes at night too', async () => {
    const { listener, sender, prisma } = setup();
    (loadTaskView as jest.Mock).mockResolvedValue(view('URGENT'));
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, NIGHT);
    expect(sender.send).toHaveBeenCalled();
    expect(prisma.taskOutbox.create).not.toHaveBeenCalled();
  });

  it('a transient failure is queued for a retry; a permanent one is not', async () => {
    const { listener, sender, prisma } = setup();
    sender.send.mockResolvedValueOnce({
      status: 'failed',
      kind: 'transient',
      retryAfter: 30,
      reason: 'Too Many Requests',
    });
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY);
    expect(prisma.taskOutbox.create.mock.calls[0][0].data).toMatchObject({
      kind: 'NOTICE',
      attempts: 1,
      lastError: 'Too Many Requests',
      sendAfter: new Date(DAY.getTime() + 30_000),
    });
    sender.send.mockResolvedValueOnce({
      status: 'failed',
      kind: 'transient',
      retryAfter: null,
      reason: 'ETIMEDOUT',
    });
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY);
    expect(prisma.taskOutbox.create.mock.calls[1][0].data.sendAfter).toEqual(
      new Date(DAY.getTime() + 60_000),
    );
    sender.send.mockResolvedValueOnce({
      status: 'failed',
      kind: 'permanent',
      retryAfter: null,
      reason: 'blocked',
    });
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY);
    expect(prisma.taskOutbox.create).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a retry that would land in the quiet hours waits for 08:00', async () => {
    const { listener, sender, prisma } = setup();
    const late = new Date('2026-10-12T16:59:30.000Z'); // 21:59:30 Tashkent
    sender.send.mockResolvedValueOnce({
      status: 'failed',
      kind: 'transient',
      retryAfter: null,
      reason: 'ETIMEDOUT',
    });
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, late);
    expect(prisma.taskOutbox.create.mock.calls[0][0].data.sendAfter).toEqual(
      MORNING,
    );
  });

  it('a content failure is our bug: logged as an error, never retried', async () => {
    const { listener, sender, prisma } = setup();
    sender.send.mockResolvedValueOnce({
      status: 'failed',
      kind: 'content',
      retryAfter: null,
      reason: "Bad Request: can't parse entities",
    });
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY);
    expect(prisma.taskOutbox.create).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain("can't parse entities");
    expect(warn).not.toHaveBeenCalled();
  });

  it('a skipped send (no bot, no chat) is neither queued nor logged', async () => {
    const { listener, sender, prisma } = setup();
    sender.send.mockResolvedValueOnce({ status: 'skipped', reason: 'no chat' });
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY);
    expect(prisma.taskOutbox.create).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("«Dars bo'ldimi?» costs not even a query", async () => {
    const { listener, prisma, sender } = setup();
    await listener.handle(
      TASK_EVENTS.REASSIGNED,
      {
        task: { ...task, kind: 'LESSON_QUESTION', authorId: null },
        fromUserId: 41,
        toUserIds: [40],
      } as any,
      DAY,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(loadTaskView).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('an event that tells nobody on Telegram does not even load the task', async () => {
    const { listener, sender } = setup();
    await listener.handle(
      TASK_EVENTS.ASSIGNED,
      { ...assigned, userIds: [50] } as any, // a watcher: the bell only
      DAY,
    );
    expect(loadTaskView).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('a task that is gone sends nothing', async () => {
    const { listener, sender } = setup();
    (loadTaskView as jest.Mock).mockResolvedValue(null);
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('names come in the short form, and the actor is not told', async () => {
    const { listener, sender } = setup();
    await listener.handle(
      TASK_EVENTS.COMMENTED,
      { task, actorId: 40, text: 'Narx?' } as any,
      DAY,
    );
    expect(sender.send.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [30, { kind: 'COMMENT', by: 'Rahimov A.', text: 'Narx?' }],
    ]);
  });

  it('one failing recipient does not cost the others their message', async () => {
    const { listener, sender } = setup();
    sender.send.mockRejectedValueOnce(new Error('boom'));
    await listener.handle(
      TASK_EVENTS.REVIEWED,
      {
        task: {
          ...task,
          participants: [
            ...task.participants,
            { userId: 41, role: 'ASSIGNEE' },
          ],
        },
        actorId: 30,
        accepted: true,
        reason: null,
      } as any,
      DAY,
    );
    expect(sender.send).toHaveBeenCalledTimes(3); // 40, 41 «Qabul qilindi», 50 «Bajarildi»
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('a queue write that fails is logged, and the next recipient still gets theirs', async () => {
    const { listener, sender, prisma } = setup();
    prisma.taskOutbox.create.mockRejectedValueOnce(new Error('db down'));
    await listener.handle(
      TASK_EVENTS.REVIEWED,
      {
        task: {
          ...task,
          participants: [
            ...task.participants,
            { userId: 41, role: 'ASSIGNEE' },
          ],
        },
        actorId: 30,
        accepted: true,
        reason: null,
      } as any,
      NIGHT,
    );
    expect(sender.send).not.toHaveBeenCalled();
    expect(prisma.taskOutbox.create).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('never rejects: a failing read is logged for the other task.* listeners', async () => {
    const { listener, prisma, sender } = setup();
    prisma.user.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(
      listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY),
    ).resolves.toBeUndefined();
    (loadTaskView as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(
      listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY),
    ).resolves.toBeUndefined();
    expect(sender.send).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('a logged error never carries the bot token', async () => {
    const { listener, sender } = setup();
    sender.send.mockRejectedValueOnce(
      new Error(
        'request to https://api.telegram.org/bot123456:ABC-def_ghi/sendMessage failed',
      ),
    );
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).not.toContain('ABC-def_ghi');
  });

  it('listens to every task event', () => {
    const listened = Object.getOwnPropertyNames(TaskTelegramListener.prototype)
      .flatMap(
        (name) =>
          (Reflect.getMetadata(
            'EVENT_LISTENER_METADATA',
            (TaskTelegramListener.prototype as any)[name],
          ) ?? []) as { event: string }[],
      )
      .map((m) => m.event)
      .sort();
    expect(listened).toEqual(Object.values(TASK_EVENTS).sort());
  });
});
