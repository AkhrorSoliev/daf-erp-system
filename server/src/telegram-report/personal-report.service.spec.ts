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
  };
  const collect = jest.fn(async (_c: number, ids: number[] | null) => ({
    branchIds: ids,
    flags: [],
    todayIncome: ids === null ? 5_000_000 : ids[0] === 1 ? 4_200_000 : 800_000,
    yesterdaySnapshot: null,
  }));
  const sendMessage = jest.fn().mockResolvedValue({ message_id: 9 });
  const bot = opts.bot === undefined ? { telegram: { sendMessage } } : opts.bot;
  const svc = new PersonalReportService(
    prisma as never,
    { collect } as never,
    { getBot: () => bot } as never,
  );
  return { svc, prisma, collect, sendMessage };
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
