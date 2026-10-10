import { Logger } from '@nestjs/common';
import { loadTaskView } from './task-telegram-view';
import { TaskTelegramOutbox } from './task-telegram-outbox.service';

jest.mock('./task-telegram-view', () => ({
  ...jest.requireActual('./task-telegram-view'),
  loadTaskView: jest.fn(),
}));

const NOW = new Date('2026-10-13T03:00:30.000Z'); // 08:00:30 Tashkent
const LATE_EVENING = new Date('2026-10-13T16:59:30.000Z'); // 21:59:30 Tashkent
const NEXT_MORNING = new Date('2026-10-14T03:00:00.000Z'); // 08:00 Tashkent
const view = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  companyId: 1,
  kind: 'MANUAL',
  title: 'Banner',
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  dueAt: new Date('2026-10-13T05:00:00.000Z'),
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
  steps: [],
  ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  taskId: 't1',
  userId: 40,
  kind: 'NOTICE',
  payload: { kind: 'ASSIGNED' },
  attempts: 0,
  ...over,
});

function setup(rows: unknown[]) {
  const prisma = {
    taskOutbox: {
      findMany: jest.fn().mockResolvedValue(rows),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const sender = {
    send: jest.fn().mockResolvedValue({ status: 'sent', messageId: 5 }),
  };
  (loadTaskView as jest.Mock).mockResolvedValue(view());
  return {
    outbox: new TaskTelegramOutbox(prisma as any, sender as any),
    prisma,
    sender,
  };
}
const updateOf = (prisma: any, i = 0) =>
  prisma.taskOutbox.update.mock.calls[i][0];

describe('TaskTelegramOutbox.drain', () => {
  let error: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks(); // the module mock keeps its calls between tests
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('reads only due Telegram rows that have not failed three times', async () => {
    const { outbox, prisma } = setup([]);
    await outbox.drain(NOW);
    expect(prisma.taskOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channel: 'TELEGRAM',
          sendAfter: { lte: NOW },
          sentAt: null,
          attempts: { lt: 3 },
        },
        orderBy: { sendAfter: 'asc' },
      }),
    );
  });

  it('claims a row before it sends, so a second instance cannot send it too', async () => {
    const { outbox, prisma, sender } = setup([row()]);
    await outbox.drain(NOW);
    expect(prisma.taskOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', sentAt: null, sendAfter: { lte: NOW } },
      data: { sendAfter: new Date(NOW.getTime() + 5 * 60_000) },
    });
    expect(
      prisma.taskOutbox.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(sender.send.mock.invocationCallOrder[0]);
  });

  it('a row another instance claimed first is left alone', async () => {
    const { outbox, prisma, sender } = setup([row(), row({ id: 'o2' })]);
    prisma.taskOutbox.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(outbox.drain(NOW)).resolves.toBe(1);
    expect(loadTaskView).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(updateOf(prisma).where).toEqual({ id: 'o2' });
  });

  it('sends a held notice with its planned text and marks it sent', async () => {
    const { outbox, prisma, sender } = setup([row()]);
    await expect(outbox.drain(NOW)).resolves.toBe(1);
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
      40,
      { kind: 'ASSIGNED' },
    );
    expect(updateOf(prisma)).toEqual({
      where: { id: 'o1' },
      data: { sentAt: NOW, lastError: null },
    });
  });

  it('a reminder or overdue row goes only while the task is open and the person is on it', async () => {
    const cases: [Record<string, unknown>, Record<string, unknown>, string][] =
      [
        [{ kind: 'REMINDER' }, { status: 'DONE' }, 'task closed'],
        [{ kind: 'OVERDUE' }, { status: 'CANCELLED' }, 'task closed'],
        [{ kind: 'REMINDER', userId: 41 }, {}, 'not on task'],
        [{ kind: 'OVERDUE', userId: 41 }, {}, 'not on task'],
        [
          { kind: 'REMINDER' },
          { dueAt: new Date('2026-10-13T03:00:00.000Z') },
          'stale reminder',
        ],
        [{ kind: 'REMINDER' }, { dueAt: null }, 'stale reminder'],
      ];
    for (const [r, v, reason] of cases) {
      const { outbox, prisma, sender } = setup([row({ payload: null, ...r })]);
      (loadTaskView as jest.Mock).mockResolvedValue(view(v));
      await outbox.drain(NOW);
      expect(sender.send).not.toHaveBeenCalled();
      expect(updateOf(prisma).data).toEqual({ sentAt: NOW, lastError: reason });
    }
  });

  it('the author gets the overdue row; a closed task still gets its «Bekor qilindi» notice', async () => {
    const a = setup([row({ kind: 'OVERDUE', userId: 30, payload: null })]);
    await a.outbox.drain(NOW);
    expect(a.sender.send).toHaveBeenCalledWith(expect.anything(), 30, {
      kind: 'OVERDUE',
    });
    const b = setup([
      row({ userId: 50, payload: { kind: 'CANCELLED', by: 'Soliyev A.' } }),
    ]);
    (loadTaskView as jest.Mock).mockResolvedValue(
      view({ status: 'CANCELLED' }),
    );
    await b.outbox.drain(NOW);
    expect(b.sender.send).toHaveBeenCalledWith(expect.anything(), 50, {
      kind: 'CANCELLED',
      by: 'Soliyev A.',
    });
  });

  it('a task that is gone, or a person with no chat, closes the row for good', async () => {
    const gone = setup([row()]);
    (loadTaskView as jest.Mock).mockResolvedValue(null);
    await gone.outbox.drain(NOW);
    expect(updateOf(gone.prisma).data).toEqual({
      sentAt: NOW,
      lastError: 'task gone',
    });
    const noChat = setup([row()]);
    noChat.sender.send.mockResolvedValue({
      status: 'skipped',
      reason: 'no chat',
    });
    await noChat.outbox.drain(NOW);
    expect(updateOf(noChat.prisma).data).toEqual({
      sentAt: NOW,
      lastError: 'no chat',
    });
  });

  it('a bot that is off makes the row dead, not retried for ever', async () => {
    const { outbox, prisma, sender } = setup([row()]);
    sender.send.mockResolvedValue({ status: 'skipped', reason: 'bot off' });
    await outbox.drain(NOW);
    expect(updateOf(prisma).data).toEqual({
      attempts: 3,
      lastError: 'bot off',
    });
  });

  it('429: waits retry_after and ends the run', async () => {
    const { outbox, prisma, sender } = setup([row(), row({ id: 'o2' })]);
    sender.send.mockResolvedValue({
      status: 'failed',
      kind: 'transient',
      retryAfter: 30,
      reason: 'Too Many Requests',
    });
    await outbox.drain(NOW);
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(updateOf(prisma)).toEqual({
      where: { id: 'o1' },
      data: {
        sendAfter: new Date(NOW.getTime() + 30_000),
        lastError: 'Too Many Requests',
      },
    });
  });

  it('403 and a malformed message kill the row; a network error counts an attempt and backs off', async () => {
    const blocked = setup([row()]);
    blocked.sender.send.mockResolvedValue({
      status: 'failed',
      kind: 'permanent',
      retryAfter: null,
      reason: 'blocked',
    });
    await blocked.outbox.drain(NOW);
    expect(updateOf(blocked.prisma).data).toEqual({
      attempts: 3,
      lastError: 'blocked',
    });
    expect(error).not.toHaveBeenCalled();

    const bad = setup([row()]);
    bad.sender.send.mockResolvedValue({
      status: 'failed',
      kind: 'content',
      retryAfter: null,
      reason: "can't parse entities",
    });
    await bad.outbox.drain(NOW);
    expect(updateOf(bad.prisma).data).toEqual({
      attempts: 3,
      lastError: "can't parse entities",
    });
    expect(error).toHaveBeenCalledTimes(1); // our own bug is loud

    const net = setup([row({ attempts: 1 })]);
    net.sender.send.mockResolvedValue({
      status: 'failed',
      kind: 'transient',
      retryAfter: null,
      reason: 'ETIMEDOUT',
    });
    await net.outbox.drain(NOW);
    expect(updateOf(net.prisma).data).toEqual({
      attempts: { increment: 1 },
      sendAfter: new Date(NOW.getTime() + 120_000), // 60 s doubled per attempt
      lastError: 'ETIMEDOUT',
    });
  });

  it('a retry that would land in the night waits for 08:00; an URGENT one does not', async () => {
    const failed = {
      status: 'failed',
      kind: 'transient',
      retryAfter: null,
      reason: 'ETIMEDOUT',
    };
    const night = setup([row()]);
    night.sender.send.mockResolvedValue(failed);
    await night.outbox.drain(LATE_EVENING);
    expect(updateOf(night.prisma).data.sendAfter).toEqual(NEXT_MORNING);

    const limited = setup([row()]);
    limited.sender.send.mockResolvedValue({ ...failed, retryAfter: 45 });
    await limited.outbox.drain(LATE_EVENING);
    expect(updateOf(limited.prisma).data.sendAfter).toEqual(NEXT_MORNING);

    const urgent = setup([row()]);
    (loadTaskView as jest.Mock).mockResolvedValue(view({ priority: 'URGENT' }));
    urgent.sender.send.mockResolvedValue(failed);
    await urgent.outbox.drain(LATE_EVENING);
    expect(updateOf(urgent.prisma).data.sendAfter).toEqual(
      new Date(LATE_EVENING.getTime() + 60_000),
    );
  });

  it('a row that throws counts an attempt and the next row still goes', async () => {
    const { outbox, prisma, sender } = setup([row(), row({ id: 'o2' })]);
    sender.send.mockRejectedValueOnce(new Error('boom'));
    await expect(outbox.drain(NOW)).resolves.toBe(1);
    expect(updateOf(prisma, 0).data).toEqual({
      attempts: { increment: 1 },
      sendAfter: new Date(NOW.getTime() + 60_000),
      lastError: 'boom',
    });
    expect(updateOf(prisma, 1).where).toEqual({ id: 'o2' });
  });

  it('never stores a bot token in lastError', async () => {
    const token = 'bot123456789:AAE-secret_Token';
    const failed = setup([row()]);
    failed.sender.send.mockResolvedValue({
      status: 'failed',
      kind: 'permanent',
      retryAfter: null,
      reason: `request to https://api.telegram.org/${token}/sendMessage failed`,
    });
    await failed.outbox.drain(NOW);
    const thrown = setup([row()]);
    thrown.sender.send.mockRejectedValueOnce(new Error(`ECONNRESET ${token}`));
    await thrown.outbox.drain(NOW);
    for (const { prisma } of [failed, thrown]) {
      const { lastError } = updateOf(prisma).data;
      expect(lastError).toContain('bot***');
      expect(lastError).not.toContain('AAE-secret_Token');
    }
  });

  it('a run still busy is not started twice', async () => {
    const { outbox, prisma } = setup([]);
    let release!: () => void;
    prisma.taskOutbox.findMany.mockReturnValueOnce(
      new Promise((r) => (release = () => r([]))),
    );
    const first = outbox.drain(NOW);
    await expect(outbox.drain(NOW)).resolves.toBe(0);
    release();
    await first;
  });
});
