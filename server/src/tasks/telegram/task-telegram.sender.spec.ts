import { Logger } from '@nestjs/common';
import { TaskTelegramSender } from './task-telegram.sender';
import type { TgTaskView } from './task-telegram-text';

const VIEW: TgTaskView = {
  id: 't1',
  companyId: 1,
  kind: 'MANUAL',
  title: 'Banner',
  status: 'NEW',
  priority: 'MEDIUM',
  dueAt: null,
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
  steps: [],
};

function setup(
  opts: {
    chat?: string | null;
    owners?: number;
    bot?: boolean;
    sendMessage?: jest.Mock;
  } = {},
) {
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(
        opts.chat === null
          ? null
          : {
              telegramChatId: opts.chat ?? '700',
              roles: [{ roleId: 4 }],
            },
      ),
      count: jest.fn().mockResolvedValue(opts.owners ?? 1),
    },
    taskTelegramMessage: { create: jest.fn().mockResolvedValue({}) },
  };
  const sendMessage =
    opts.sendMessage ?? jest.fn().mockResolvedValue({ message_id: 77 });
  const telegram = {
    getBot: () =>
      opts.bot === false ? undefined : { telegram: { sendMessage } },
  };
  const config = {
    get: jest.fn().mockReturnValue('https://student.dafzentrum.uz/tg'),
  };
  const sender = new TaskTelegramSender(
    prisma as any,
    telegram as any,
    config as any,
  );
  return { sender, prisma, sendMessage };
}

const tgError = (
  error_code: number,
  description: string,
  retry_after?: number,
) =>
  Object.assign(new Error(description), {
    response: {
      error_code,
      description,
      parameters: retry_after ? { retry_after } : undefined,
    },
  });

describe('TaskTelegramSender', () => {
  it('sends HTML with buttons and remembers the message for replies', async () => {
    const { sender, prisma, sendMessage } = setup();
    await expect(sender.send(VIEW, 40, { kind: 'ASSIGNED' })).resolves.toEqual({
      status: 'sent',
      messageId: 77,
    });
    const [chatId, text, extra] = sendMessage.mock.calls[0];
    expect(chatId).toBe('700');
    expect(text.split('\n')[0]).toBe("<b>Yangi topshiriq · O'rta</b>");
    expect(extra.parse_mode).toBe('HTML');
    expect(
      extra.reply_markup.inline_keyboard.flat().map((b: any) => b.text),
    ).toEqual(['Boshladim', 'Bajardim', 'Ochish']);
    expect(extra.reply_markup.inline_keyboard.at(-1)[0].url).toBe(
      'https://lehrer.dafzentrum.uz/tasks?task=t1',
    );
    expect(prisma.taskTelegramMessage.create).toHaveBeenCalledWith({
      data: {
        chatId: '700',
        messageId: 77,
        taskId: 't1',
        userId: 40,
        purpose: 'NOTICE',
        companyId: 1,
      },
    });
  });

  it('skips a person with no chat, a shared chat, or a bot that is off', async () => {
    for (const s of [
      setup({ chat: null }),
      setup({ owners: 2 }),
      setup({ bot: false }),
    ]) {
      const r = await s.sender.send(VIEW, 40, { kind: 'ASSIGNED' });
      expect(r.status).toBe('skipped');
      expect(s.sendMessage).not.toHaveBeenCalled();
    }
  });

  it('classifies failures: 429 with retry_after, 403 permanent, network transient', async () => {
    const limited = setup({
      sendMessage: jest
        .fn()
        .mockRejectedValue(tgError(429, 'Too Many Requests', 17)),
    });
    await expect(
      limited.sender.send(VIEW, 40, { kind: 'ASSIGNED' }),
    ).resolves.toMatchObject({
      status: 'failed',
      kind: 'transient',
      retryAfter: 17,
    });
    const blocked = setup({
      sendMessage: jest
        .fn()
        .mockRejectedValue(
          tgError(403, 'Forbidden: bot was blocked by the user'),
        ),
    });
    await expect(
      blocked.sender.send(VIEW, 40, { kind: 'ASSIGNED' }),
    ).resolves.toMatchObject({
      status: 'failed',
      kind: 'permanent',
    });
    const net = setup({
      sendMessage: jest.fn().mockRejectedValue(new Error('ETIMEDOUT')),
    });
    await expect(
      net.sender.send(VIEW, 40, { kind: 'ASSIGNED' }),
    ).resolves.toMatchObject({
      status: 'failed',
      kind: 'transient',
      retryAfter: null,
    });
    expect(net.prisma.taskTelegramMessage.create).not.toHaveBeenCalled();
  });

  it('a failed bookkeeping write never turns a sent message into a failure', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const s = setup();
    s.prisma.taskTelegramMessage.create.mockRejectedValue(
      new Error('db down at bot123456:SECRET_token-x'),
    );
    await expect(
      s.sender.send(VIEW, 40, { kind: 'ASSIGNED' }),
    ).resolves.toMatchObject({ status: 'sent' });
    // Logged, with the bot token redacted (describeError).
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bot***'));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('SECRET'));
    warn.mockRestore();
  });
});
