import {
  PersonalReportService,
  type ReportCache,
} from './personal-report.service';

jest.mock('../tasks/telegram/task-telegram-view', () => ({
  staffChatOf: jest.fn(),
}));
import { staffChatOf } from '../tasks/telegram/task-telegram-view';

const BRANCHES = [
  { id: 1, name: "Farg'ona" },
  { id: 2, name: 'Namangan' },
];

function setup(opts: { branches?: typeof BRANCHES; bot?: unknown } = {}) {
  const prisma = {
    branch: {
      findMany: jest.fn().mockResolvedValue(opts.branches ?? BRANCHES),
    },
    telegramReportRecipient: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const collect = jest.fn(async (_c: number, ids: number[] | null) => ({
    branchIds: ids,
    flags: [],
    todayIncome: ids === null ? 5_000_000 : ids[0] === 1 ? 4_200_000 : 800_000,
    yesterdaySnapshot: null,
  }));
  const sendMessage = jest.fn().mockResolvedValue({ message_id: 9 });
  const bot = (
    opts.bot === undefined
      ? {
          telegram: {
            sendMessage,
            sendChatAction: jest.fn().mockResolvedValue(true),
            getMe: jest.fn().mockResolvedValue({ id: 1 }),
          },
        }
      : opts.bot
  ) as {
    telegram: {
      sendMessage: jest.Mock;
      sendChatAction: jest.Mock;
      getMe: jest.Mock;
    };
  };
  const svc = new PersonalReportService(
    prisma as never,
    { collect } as never,
    { getBot: () => bot } as never,
  );
  return { svc, prisma, collect, sendMessage, bot };
}

const rec = {
  companyId: 1,
  userId: 50,
  layout: 'BY_SECTION',
  sections: ['TODAY_MONEY'],
  allBranches: true,
  branchIds: [],
} as const;
const NOW = new Date('2026-10-16T13:30:00Z');

describe('PersonalReportService', () => {
  beforeEach(() => jest.mocked(staffChatOf).mockReset());

  it('allowed branches: live, active or paused, filtered unless all', async () => {
    const { svc, prisma } = setup();
    await svc.allowedBranches({
      companyId: 1,
      allBranches: false,
      branchIds: [2],
    });
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 1,
          deletedAt: null,
          status: { in: ['ACTIVE', 'INACTIVE'] },
          id: { in: [2] },
        },
      }),
    );
  });

  it('all branches: one collect per branch plus a company-wide total', async () => {
    const { svc, collect } = setup();
    const out = await svc.compose(rec as never, 'all', new Map(), NOW);
    expect(collect.mock.calls.map((c) => c[1])).toEqual(
      expect.arrayContaining([null, [1], [2]]),
    );
    expect(out!.text).toContain('📊 <b>16.10 — 18:30 holati</b>');
  });

  it('a chosen subset totals over the subset, not the company', async () => {
    const { svc, collect } = setup();
    await svc.compose(
      { ...rec, allBranches: false, branchIds: [1, 2] } as never,
      'all',
      new Map(),
      NOW,
    );
    expect(collect.mock.calls.map((c) => c[1])).toContainEqual([1, 2]);
    expect(collect.mock.calls.map((c) => c[1])).not.toContainEqual(null);
  });

  it('TOTAL_ONLY does not collect per branch', async () => {
    const { svc, collect } = setup();
    await svc.compose(
      { ...rec, layout: 'TOTAL_ONLY' } as never,
      'all',
      new Map(),
      NOW,
    );
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('a focused branch shows that branch alone', async () => {
    const { svc, collect } = setup();
    await svc.compose(rec as never, 2, new Map(), NOW);
    expect(collect.mock.calls.map((c) => c[1])).toEqual([[2]]);
  });

  it('refuses a branch outside the allowed list', async () => {
    const { svc } = setup();
    expect(await svc.compose(rec as never, 99, new Map(), NOW)).toBeNull();
  });

  it('shares one collect per scope through the cache', async () => {
    const { svc, collect } = setup();
    const cache: ReportCache = new Map();
    await svc.compose(rec as never, 'all', cache, NOW);
    await svc.compose(rec as never, 'all', cache, NOW);
    expect(collect).toHaveBeenCalledTimes(3);
  });

  it('deliver: no linked chat', async () => {
    jest.mocked(staffChatOf).mockResolvedValue(null);
    expect(await setup().svc.deliver(rec as never)).toEqual({
      ok: false,
      reason: 'NO_CHAT',
    });
  });

  it('deliver: no branch', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    expect(await setup({ branches: [] }).svc.deliver(rec as never)).toEqual({
      ok: false,
      reason: 'NO_BRANCH',
    });
  });

  it('deliver: sends HTML with the keyboard to the staff chat', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, sendMessage } = setup();
    expect(await svc.deliver(rec as never, new Map(), NOW)).toEqual({
      ok: true,
    });
    expect(sendMessage).toHaveBeenCalledWith(
      '777',
      expect.stringContaining('holati'),
      expect.objectContaining({
        parse_mode: 'HTML',
        reply_markup: expect.anything() as unknown,
      }),
    );
  });

  it('deliver: a refused send reports its kind', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const err = Object.assign(
      new Error('Forbidden: bot was blocked by the user'),
      {
        response: {
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user',
        },
      },
    );
    const { svc, sendMessage } = setup();
    sendMessage.mockRejectedValue(err);
    expect(await svc.deliver(rec as never, new Map(), NOW)).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'SEND_FAILED',
        kind: 'permanent',
      }),
    );
  });

  it('deliver: no bot', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    expect(await setup({ bot: null }).svc.deliver(rec as never)).toEqual({
      ok: false,
      reason: 'NO_BOT',
    });
  });
});

describe('deliver records the attempt', () => {
  beforeEach(() => jest.mocked(staffChatOf).mockReset());

  it('a success stores ok=true and no note', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, prisma } = setup();
    await svc.deliver(rec as never, new Map(), NOW);
    expect(prisma.telegramReportRecipient.updateMany).toHaveBeenCalledWith({
      where: { companyId: 1, userId: 50 },
      data: { lastAttemptAt: NOW, lastAttemptOk: true, lastAttemptNote: null },
    });
  });

  it('a failure stores ok=false and the note', async () => {
    jest.mocked(staffChatOf).mockResolvedValue(null);
    const { svc, prisma } = setup();
    await svc.deliver(rec as never, new Map(), NOW);
    expect(prisma.telegramReportRecipient.updateMany).toHaveBeenCalledWith({
      where: { companyId: 1, userId: 50 },
      data: {
        lastAttemptAt: NOW,
        lastAttemptOk: false,
        lastAttemptNote: 'Telegram ulanmagan',
      },
    });
  });

  it('a failing bookkeeping write never fails the delivery', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, prisma } = setup();
    prisma.telegramReportRecipient.updateMany.mockRejectedValue(
      new Error('db'),
    );
    expect(await svc.deliver(rec as never, new Map(), NOW)).toEqual({
      ok: true,
    });
  });
});

describe('probe', () => {
  beforeEach(() => jest.mocked(staffChatOf).mockReset());

  it('no linked chat → UNLINKED, nothing sent', async () => {
    jest.mocked(staffChatOf).mockResolvedValue(null);
    const { svc, bot } = setup();
    expect(await svc.probe(50)).toEqual({
      reach: 'UNLINKED',
      note: 'Telegram ulanmagan',
    });
    expect(bot.telegram.sendChatAction).not.toHaveBeenCalled();
  });

  it('a silent typing action that succeeds → DELIVERED, clears a stale mark', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, bot, prisma } = setup();
    expect(await svc.probe(50)).toEqual({ reach: 'DELIVERED', note: null });
    expect(bot.telegram.sendChatAction).toHaveBeenCalledWith('777', 'typing');
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 50, telegramDisconnectedAt: { not: null } },
      data: { telegramDisconnectedAt: null },
    });
  });

  it('403 «blocked» → BLOCKED, marks the account at once', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, bot, prisma } = setup();
    bot.telegram.sendChatAction.mockRejectedValue(
      Object.assign(new Error('Forbidden'), {
        response: {
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user',
        },
      }),
    );
    expect(await svc.probe(50)).toEqual({
      reach: 'BLOCKED',
      note: 'Botni bloklagan',
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 50, telegramDisconnectedAt: null },
      data: { telegramDisconnectedAt: expect.any(Date) as unknown },
    });
  });

  it('any other error → FAILED and the mark is left alone', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, bot, prisma } = setup();
    bot.telegram.sendChatAction.mockRejectedValue(new Error('socket hang up'));
    expect(await svc.probe(50)).toEqual({
      reach: 'FAILED',
      note: 'Telegram vaqtincha javob bermadi',
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('no bot → NO_BOT', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    expect(await setup({ bot: null }).svc.probe(50)).toEqual({
      reach: 'NO_BOT',
      note: 'Bot ishlamayapti',
    });
  });
});

describe('botActive', () => {
  it('true when getMe answers, cached for a minute', async () => {
    const { svc, bot } = setup();
    expect(await svc.botActive()).toBe(true);
    expect(await svc.botActive()).toBe(true);
    expect(bot.telegram.getMe).toHaveBeenCalledTimes(1);
  });
  it('leaves no pending timer after a successful getMe', async () => {
    jest.useFakeTimers();
    try {
      const { svc } = setup();
      expect(await svc.botActive()).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
  it('false without a bot or when getMe fails', async () => {
    expect(await setup({ bot: null }).svc.botActive()).toBe(false);
    const { svc, bot } = setup();
    bot.telegram.getMe.mockRejectedValue(new Error('401'));
    expect(await svc.botActive()).toBe(false);
  });
});

describe('preview', () => {
  it("plain text of today's report for the recipient, null when no branch is allowed", async () => {
    const { svc } = setup();
    const text = await svc.preview(rec as never);
    expect(text).toContain('holati');
    expect(text).not.toContain('<b>');
    expect(await setup({ branches: [] }).svc.preview(rec as never)).toBeNull();
  });
});
