import { Logger } from '@nestjs/common';
import { editExtra, renderLiveCard } from './task-telegram-text';
import { loadTaskView } from './task-telegram-view';
import { TaskTelegramLive } from './task-telegram-live';

jest.mock('./task-telegram-view', () => ({
  ...jest.requireActual('./task-telegram-view'),
  loadTaskView: jest.fn(),
}));

const view = () => ({
  id: 't1',
  companyId: 1,
  kind: 'MANUAL',
  title: 'Banner',
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  dueAt: null,
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
  steps: [],
  history: [],
});
const rows = [
  { id: 'r40', chatId: '700', messageId: 11, userId: 40 },
  { id: 'r30', chatId: '800', messageId: 12, userId: 30 },
];
const tgError = (
  error_code: number,
  description: string,
  retry_after?: number,
) =>
  Object.assign(new Error(description), {
    response: {
      error_code,
      description,
      parameters: retry_after === undefined ? undefined : { retry_after },
    },
  });

function setup(bot: boolean = true) {
  const edit = jest.fn().mockResolvedValue({});
  const prisma = {
    taskTelegramMessage: {
      findMany: jest.fn().mockResolvedValue(rows),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 40, roles: [{ roleId: 4 }] },
        { id: 30, roles: [{ roleId: 1 }] },
      ]),
    },
  };
  const telegram = {
    getBot: jest
      .fn()
      .mockReturnValue(
        bot ? { telegram: { editMessageText: edit } } : undefined,
      ),
  };
  const sender = {
    openUrl: jest.fn(
      (roleIds: number[], taskId: string) =>
        `https://x.uz/${taskId}?r=${roleIds.join(',')}`,
    ),
  };
  (loadTaskView as jest.Mock).mockResolvedValue(view());
  const sleep = jest.fn().mockResolvedValue(undefined);
  return {
    live: new TaskTelegramLive(prisma as any, telegram as any, sender as any),
    prisma,
    edit,
    sleep,
  };
}

describe('TaskTelegramLive.refresh', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('edits every CARD row of the task with that viewer own card', async () => {
    const { live, prisma, edit, sleep } = setup();
    await live.refresh('t1', sleep);
    expect(prisma.taskTelegramMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taskId: 't1', purpose: 'CARD' } }),
    );
    expect(edit).toHaveBeenCalledTimes(2);
    const now = new Date(); // the view has no due date and no history, so the text does not depend on it
    const m40 = renderLiveCard(view() as any, 40, {
      now,
      openUrl: 'https://x.uz/t1?r=4',
    });
    const m30 = renderLiveCard(view() as any, 30, {
      now,
      openUrl: 'https://x.uz/t1?r=1',
    });
    expect(edit).toHaveBeenNthCalledWith(
      1,
      '700',
      11,
      undefined,
      m40.text,
      editExtra(m40.buttons),
    );
    expect(edit).toHaveBeenNthCalledWith(
      2,
      '800',
      12,
      undefined,
      m30.text,
      editExtra(m30.buttons),
    );
    expect(edit.mock.calls[0][4]).toEqual({
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: expect.any(Array) },
    });
    expect(prisma.taskTelegramMessage.deleteMany).not.toHaveBeenCalled();
  });

  it('«message is not modified» is fine: no delete, no warning', async () => {
    const { live, prisma, edit, sleep } = setup();
    edit.mockRejectedValueOnce(
      tgError(400, 'Bad Request: message is not modified'),
    );
    await live.refresh('t1', sleep);
    expect(edit).toHaveBeenCalledTimes(2);
    expect(prisma.taskTelegramMessage.deleteMany).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('a card that is gone (400) loses its row; the next card is still edited', async () => {
    const { live, prisma, edit, sleep } = setup();
    edit.mockRejectedValueOnce(
      tgError(400, 'Bad Request: message to edit not found'),
    );
    await live.refresh('t1', sleep);
    expect(prisma.taskTelegramMessage.deleteMany).toHaveBeenCalledWith({
      where: { id: 'r40' },
    });
    expect(edit).toHaveBeenCalledTimes(2);
  });

  it('a blocked bot (403) loses the row', async () => {
    const { live, prisma, edit, sleep } = setup();
    edit.mockRejectedValueOnce(tgError(403, 'Forbidden: bot was blocked'));
    await live.refresh('t1', sleep);
    expect(prisma.taskTelegramMessage.deleteMany).toHaveBeenCalledWith({
      where: { id: 'r40' },
    });
    expect(edit).toHaveBeenCalledTimes(2);
  });

  it('429: waits retry_after and retries once; a second 429 stops the loop', async () => {
    const { live, edit, sleep } = setup();
    edit.mockRejectedValueOnce(tgError(429, 'Too Many Requests', 2));
    await live.refresh('t1', sleep);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(edit).toHaveBeenCalledTimes(3); // r40, r40 again, r30
    expect(edit.mock.calls[1][1]).toBe(11);
    expect(warn).not.toHaveBeenCalled();

    jest.clearAllMocks();
    const second = setup();
    second.edit
      .mockRejectedValueOnce(tgError(429, 'Too Many Requests', 2))
      .mockRejectedValueOnce(tgError(429, 'Too Many Requests', 5));
    await second.live.refresh('t1', second.sleep);
    expect(second.sleep).toHaveBeenCalledTimes(1);
    expect(second.edit).toHaveBeenCalledTimes(2); // r30 never tried
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('no task or no bot: resolves without a call', async () => {
    const gone = setup();
    (loadTaskView as jest.Mock).mockResolvedValue(null);
    await gone.live.refresh('t1', gone.sleep);
    expect(gone.edit).not.toHaveBeenCalled();

    const off = setup(false);
    await off.live.refresh('t1', off.sleep);
    expect(off.edit).not.toHaveBeenCalled();
    expect(off.prisma.taskTelegramMessage.findMany).not.toHaveBeenCalled();
  });

  it('any other error is logged, the next card is still edited, and refresh resolves', async () => {
    const { live, edit, sleep, prisma } = setup();
    edit.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    await expect(live.refresh('t1', sleep)).resolves.toBeUndefined();
    expect(edit).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(prisma.taskTelegramMessage.deleteMany).not.toHaveBeenCalled();

    prisma.taskTelegramMessage.findMany.mockRejectedValueOnce(
      new Error('db down'),
    );
    await expect(live.refresh('t1', sleep)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
  });
});
