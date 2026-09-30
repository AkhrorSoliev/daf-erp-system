import { Telegram, TelegramError } from 'telegraf';
import {
  BLOCKED_REASON,
  StudentChatReach,
  privateChatId,
  unreachableReason,
} from './student-chat-reach';

const CHAT = '700000001';
const SIBLINGS = [
  { id: 10001, companyId: 1001 },
  { id: 10002, companyId: 1001 },
];

const telegramError = (error_code: number, description: string) =>
  new TelegramError({ error_code, description });

// Every mock resolves at once, so one macrotask drains the whole chain.
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  const prisma = {
    student: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const history = { recordCreate: jest.fn().mockResolvedValue(undefined) };
  const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  const reach = new StudentChatReach(
    prisma as any,
    history as any,
    logger as any,
  );
  // A real client, so the test goes through Telegraf's own sendMessage →
  // callApi path — the one every sender in the codebase takes.
  const telegram = new Telegram('123:TEST');
  const callApi = jest.fn();
  telegram.callApi = callApi as any;
  reach.watch(telegram);
  return { prisma, history, logger, telegram, callApi, reach };
}

describe('StudentChatReach.watch — a send reports the chat state (ADR-0054)', () => {
  it('a message the chat refuses marks every live card on it, once each', async () => {
    const { prisma, history, telegram, callApi } = setup();
    const refused = telegramError(
      403,
      'Forbidden: bot was blocked by the user',
    );
    callApi.mockRejectedValue(refused);
    prisma.student.findMany.mockResolvedValue(SIBLINGS);

    await expect(telegram.sendMessage(CHAT, 'Salom')).rejects.toBe(refused);
    await flush();

    expect(prisma.student.findMany).toHaveBeenCalledWith({
      where: {
        telegramChatId: CHAT,
        telegramDisconnectedAt: null,
        deletedAt: null,
      },
      select: { id: true, companyId: true },
    });
    for (const card of SIBLINGS) {
      expect(prisma.student.updateMany).toHaveBeenCalledWith({
        where: { id: card.id, telegramDisconnectedAt: null },
        data: { telegramDisconnectedAt: expect.any(Date) },
      });
      expect(history.recordCreate).toHaveBeenCalledWith({
        entityType: 'Student',
        entityId: card.id,
        companyId: 1001,
        newValues: { action: 'TELEGRAM_UZILDI', sabab: BLOCKED_REASON },
      });
    }
  });

  it('names a deleted Telegram account as such', async () => {
    const { prisma, history, telegram, callApi } = setup();
    callApi.mockRejectedValue(
      telegramError(403, 'Forbidden: user is deactivated'),
    );
    prisma.student.findMany.mockResolvedValue([SIBLINGS[0]]);

    await expect(telegram.sendMessage(CHAT, 'Salom')).rejects.toThrow();
    await flush();

    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: {
          action: 'TELEGRAM_UZILDI',
          sabab: "Telegram hisobini o'chirgan",
        },
      }),
    );
  });

  it('a delivered message clears the mark, so a missed unblock heals', async () => {
    const { prisma, history, telegram, callApi } = setup();
    callApi.mockResolvedValue({ message_id: 42 });
    prisma.student.findMany.mockResolvedValue([SIBLINGS[0]]);

    await expect(telegram.sendMessage(CHAT, 'Salom')).resolves.toEqual({
      message_id: 42,
    });
    await flush();

    expect(prisma.student.findMany).toHaveBeenCalledWith({
      where: {
        telegramChatId: CHAT,
        telegramDisconnectedAt: { not: null },
        deletedAt: null,
      },
      select: { id: true, companyId: true },
    });
    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: SIBLINGS[0].id, telegramDisconnectedAt: { not: null } },
      data: { telegramDisconnectedAt: null },
    });
    expect(history.recordCreate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: SIBLINGS[0].id,
      companyId: 1001,
      newValues: { action: 'TELEGRAM_QAYTA_ULANDI' },
    });
  });

  it('a delivery to an unmarked chat writes nothing', async () => {
    const { prisma, history, telegram, callApi } = setup();
    callApi.mockResolvedValue({ message_id: 1 });

    await telegram.sendDocument(CHAT, 'https://example.com/a.pdf');
    await flush();

    expect(prisma.student.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.student.updateMany).not.toHaveBeenCalled();
    expect(history.recordCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['a rate limit', telegramError(429, 'Too Many Requests: retry after 5')],
    ['a Telegram outage', telegramError(502, 'Bad Gateway')],
    [
      'our own bad HTML',
      telegramError(400, "Bad Request: can't parse entities"),
    ],
    ['a network failure', new Error('request to api.telegram.org failed')],
  ])('%s says nothing about the chat', async (_label, error) => {
    const { prisma, telegram, callApi } = setup();
    callApi.mockRejectedValue(error);

    await expect(telegram.sendMessage(CHAT, 'Salom')).rejects.toBe(error);
    await flush();

    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('groups and channels are never a student chat', async () => {
    const { prisma, telegram, callApi } = setup();
    callApi.mockRejectedValue(telegramError(403, 'Forbidden: bot was kicked'));

    await expect(telegram.sendMessage('-1003693121409', 'x')).rejects.toThrow();
    await expect(telegram.getChatMember('@daffergana', 5)).rejects.toThrow();
    await flush();

    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('a refused menu-button call marks the chat, a successful one proves nothing', async () => {
    const { prisma, telegram, callApi } = setup();
    const button = { chatId: Number(CHAT), menuButton: { type: 'default' } };

    callApi.mockResolvedValueOnce(true);
    await telegram.setChatMenuButton(button as any);
    await flush();
    expect(prisma.student.findMany).not.toHaveBeenCalled();

    callApi.mockRejectedValueOnce(
      telegramError(403, 'Forbidden: bot was blocked by the user'),
    );
    await expect(telegram.setChatMenuButton(button as any)).rejects.toThrow();
    await flush();
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ telegramDisconnectedAt: null }),
      }),
    );
  });

  it('a card another failure marked first gets no second history row', async () => {
    const { prisma, history, telegram, callApi } = setup();
    callApi.mockRejectedValue(
      telegramError(403, 'Forbidden: bot was blocked by the user'),
    );
    prisma.student.findMany.mockResolvedValue([SIBLINGS[0]]);
    prisma.student.updateMany.mockResolvedValue({ count: 0 });

    await expect(telegram.sendMessage(CHAT, 'Salom')).rejects.toThrow();
    await flush();

    expect(history.recordCreate).not.toHaveBeenCalled();
  });

  it('a database failure never changes what the send returns or throws', async () => {
    const { prisma, logger, telegram, callApi } = setup();
    prisma.student.findMany.mockRejectedValue(new Error('db down'));

    callApi.mockResolvedValueOnce({ message_id: 7 });
    await expect(telegram.sendMessage(CHAT, 'Salom')).resolves.toEqual({
      message_id: 7,
    });

    const refused = telegramError(
      403,
      'Forbidden: bot was blocked by the user',
    );
    callApi.mockRejectedValueOnce(refused);
    await expect(telegram.sendMessage(CHAT, 'Salom')).rejects.toBe(refused);
    await flush();

    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});

describe('StudentChatReach.onMyChatMember — Telegram announces a block', () => {
  const update = (status: string, type = 'private') => ({
    chat: { id: Number(CHAT), type },
    date: 1790000000,
    new_chat_member: { status },
  });

  it('a block marks the chat from the moment Telegram gives', async () => {
    const { prisma, reach } = setup();
    prisma.student.findMany.mockResolvedValue([SIBLINGS[0]]);

    await reach.onMyChatMember(update('kicked'));

    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: SIBLINGS[0].id, telegramDisconnectedAt: null },
      data: { telegramDisconnectedAt: new Date(1790000000 * 1000) },
    });
  });

  it('an unblock clears it', async () => {
    const { prisma, history, reach } = setup();
    prisma.student.findMany.mockResolvedValue([SIBLINGS[0]]);

    await reach.onMyChatMember(update('member'));

    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: SIBLINGS[0].id, telegramDisconnectedAt: { not: null } },
      data: { telegramDisconnectedAt: null },
    });
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: { action: 'TELEGRAM_QAYTA_ULANDI' },
      }),
    );
  });

  it('ignores groups', async () => {
    const { prisma, reach } = setup();

    await reach.onMyChatMember(update('kicked', 'supergroup'));

    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('logs a database failure instead of throwing into the update', async () => {
    const { prisma, logger, reach } = setup();
    prisma.student.findMany.mockRejectedValue(new Error('db down'));

    await expect(
      reach.onMyChatMember(update('kicked')),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('privateChatId', () => {
  it.each([
    [{ chat_id: CHAT }, CHAT],
    [{ chat_id: 700000001 }, CHAT],
    [{ chat_id: '-1003693121409' }, null],
    [{ chat_id: '@daffergana' }, null],
    [{ chat_id: '0' }, null],
    [{}, null],
    [undefined, null],
  ])('%p → %p', (payload, expected) => {
    expect(privateChatId(payload)).toBe(expected);
  });
});

describe('unreachableReason', () => {
  it.each([
    ['Forbidden: bot was blocked by the user', BLOCKED_REASON],
    ['Forbidden: user is deactivated', "Telegram hisobini o'chirgan"],
    [
      "Forbidden: bot can't initiate conversation with a user",
      'Botni ishga tushirmagan',
    ],
    ['Bad Request: chat not found', 'Telegram chat topilmadi'],
    ['Forbidden: something new', 'Telegram xabarni qabul qilmadi'],
  ])('%s → %s', (description, reason) => {
    expect(unreachableReason(description)).toBe(reason);
  });
});
