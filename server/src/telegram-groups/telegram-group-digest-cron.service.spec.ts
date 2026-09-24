import { Test, TestingModule } from '@nestjs/testing';
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  TelegramGroupStatus,
} from '@prisma/client';
import {
  isVisibleToGroup,
  TelegramGroupDigestCronService,
} from './telegram-group-digest-cron.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramGroupDigestService } from './telegram-group-digest.service';
import { HolidaysService } from '../holidays/holidays.service';

const MONDAY_20H = new Date('2026-05-18T15:00:00Z'); // 20:00 Tashkent, Monday
const SUNDAY_20H = new Date('2026-05-24T15:00:00Z');

const groupRow = (
  id: string,
  branchId: number | null,
  opts: { companyId?: number; delivered?: string[] } = {},
) => ({
  id,
  recipientKind: TelegramDigestRecipientKind.GROUP,
  recipientId: opts.companyId ?? 1001,
  companyId: opts.companyId ?? 1001,
  branchId,
  category: TelegramDigestCategory.GROUP_NEW_STUDENT,
  relatedEntityId: null,
  payload: { studentId: 1, name: 'A B', branchName: null },
  deliveredGroupIds: opts.delivered ?? [],
  createdAt: new Date('2026-05-18T09:00:00Z'),
});

const chat = (
  id: string,
  chatId: bigint,
  branchId: number | null,
  receivesAllBranches = false,
) => ({ id, chatId, branchId, receivesAllBranches });

describe('isVisibleToGroup', () => {
  it('follows the broadcast rule, fail-closed for branch-less groups', () => {
    const own = { branchId: 5, receivesAllBranches: false };
    const all = { branchId: 9, receivesAllBranches: true };
    const legacy = { branchId: null, receivesAllBranches: false };
    expect(isVisibleToGroup({ branchId: 5 }, own)).toBe(true);
    expect(isVisibleToGroup({ branchId: 9 }, own)).toBe(false);
    expect(isVisibleToGroup({ branchId: null }, own)).toBe(true);
    expect(isVisibleToGroup({ branchId: 9 }, all)).toBe(true);
    expect(isVisibleToGroup({ branchId: 5 }, legacy)).toBe(false);
    expect(isVisibleToGroup({ branchId: null }, legacy)).toBe(true);
  });
});

describe('TelegramGroupDigestCronService', () => {
  let service: TelegramGroupDigestCronService;
  let sendMessage: jest.Mock;
  let getBot: jest.Mock;
  let findMany: jest.Mock;
  let updateMany: jest.Mock;
  let deleteMany: jest.Mock;
  let groupFindMany: jest.Mock;
  let groupUpdate: jest.Mock;
  let companyFindMany: jest.Mock;
  let buildBlocks: jest.Mock;
  let findActiveHolidayCovering: jest.Mock;

  /** Ids of every deleteMany except the age purge. */
  const deletedIds = () =>
    deleteMany.mock.calls
      .map(([arg]) => arg.where.id?.in as string[] | undefined)
      .filter((ids): ids is string[] => Array.isArray(ids))
      .flat()
      .sort();

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(MONDAY_20H);
    sendMessage = jest.fn().mockResolvedValue({ message_id: 1 });
    getBot = jest.fn().mockReturnValue({ telegram: { sendMessage } });
    findMany = jest.fn().mockResolvedValue([]);
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    groupFindMany = jest.fn().mockResolvedValue([]);
    groupUpdate = jest.fn().mockResolvedValue({});
    companyFindMany = jest.fn().mockResolvedValue([{ id: 1001, name: 'DaF' }]);
    // One line per row, so the cron's own packing yields one part per group.
    buildBlocks = jest.fn((_name: string, rows: { id: string }[]) =>
      rows.length
        ? rows.map((r) => ({ text: `• ${r.id}`, itemIds: [r.id] }))
        : null,
    );
    findActiveHolidayCovering = jest.fn().mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupDigestCronService,
        {
          provide: PrismaService,
          useValue: {
            telegramDigestItem: { findMany, updateMany, deleteMany },
            telegramGroup: { findMany: groupFindMany, update: groupUpdate },
            company: { findMany: companyFindMany },
          },
        },
        { provide: TelegramAdminBotService, useValue: { getBot } },
        { provide: TelegramGroupDigestService, useValue: { buildBlocks } },
        { provide: HolidaysService, useValue: { findActiveHolidayCovering } },
      ],
    }).compile();
    service = module.get(TelegramGroupDigestCronService);
  });

  afterEach(() => jest.useRealTimers());

  it('purges old GROUP rows first — even on a Sunday — then skips the day', async () => {
    jest.setSystemTime(SUNDAY_20H);
    deleteMany.mockResolvedValueOnce({ count: 4 });
    const warn = jest.spyOn((service as any).logger, 'warn');

    await service.flushDigests();

    const purge = deleteMany.mock.calls[0][0].where;
    expect(purge.recipientKind).toBe(TelegramDigestRecipientKind.GROUP);
    expect(purge.createdAt.lt).toEqual(
      new Date(SUNDAY_20H.getTime() - 7 * 24 * 3600 * 1000),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('4'));
    expect(findActiveHolidayCovering).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('skips a holiday after purging', async () => {
    findActiveHolidayCovering.mockResolvedValue({ id: 'h1', name: "Navro'z" });
    await service.flushDigests();
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('stops without an admin bot after purging', async () => {
    getBot.mockReturnValue(null);
    await service.flushDigests();
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('reads only GROUP rows, oldest first, and does nothing for an empty queue', async () => {
    await service.flushDigests();
    expect(findMany).toHaveBeenCalledWith({
      where: { recipientKind: TelegramDigestRecipientKind.GROUP },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('asks only for approved, active, live groups of the company', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    await service.flushDigests();
    expect(groupFindMany).toHaveBeenCalledWith({
      where: {
        companyId: 1001,
        status: TelegramGroupStatus.APPROVED,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        chatId: true,
        branchId: true,
        receivesAllBranches: true,
      },
    });
  });

  it('gives each group only what it may see, marks delivery, then deletes', async () => {
    findMany.mockResolvedValue([
      groupRow('i1', 5),
      groupRow('i2', 9),
      groupRow('i3', null),
    ]);
    groupFindMany.mockResolvedValue([
      chat('br5', 100n, 5),
      chat('all', 200n, 9, true),
      chat('legacy', 300n, null),
    ]);

    await service.flushDigests();

    // Groups are visited in query order: br5, all, legacy.
    expect(
      buildBlocks.mock.calls.map(([, rows]) =>
        rows.map((r: { id: string }) => r.id),
      ),
    ).toEqual([['i1', 'i3'], ['i1', 'i2', 'i3'], ['i3']]);
    expect(sendMessage).toHaveBeenCalledWith('100', '• i1\n• i3', {
      parse_mode: 'HTML',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'i3'] } },
      data: { deliveredGroupIds: { push: 'br5' } },
    });
    expect(deletedIds()).toEqual(['i1', 'i2', 'i3']);
  });

  it('keeps a row for the group that failed and does not resend to the one that got it', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    groupFindMany.mockResolvedValue([chat('g1', 100n, 5), chat('g2', 200n, 5)]);
    sendMessage.mockImplementation((chatId: string) =>
      chatId === '100'
        ? Promise.reject(new Error('ETIMEDOUT'))
        : Promise.resolve({ message_id: 2 }),
    );

    await service.flushDigests();

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1'] } },
      data: { deliveredGroupIds: { push: 'g2' } },
    });
    expect(deletedIds()).toEqual([]); // g1 still owes it

    // Next run: the row already lists g2, so only g1 gets it.
    findMany.mockResolvedValue([groupRow('i1', null, { delivered: ['g2'] })]);
    sendMessage.mockReset().mockResolvedValue({ message_id: 3 });
    deleteMany.mockClear();

    await service.flushDigests();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      '100',
      expect.any(String),
      expect.any(Object),
    );
    expect(deletedIds()).toEqual(['i1']);
  });

  it('deactivates a group on 403 and stops waiting for it', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    groupFindMany.mockResolvedValue([chat('g1', 100n, 5)]);
    sendMessage.mockRejectedValue({
      response: { error_code: 403, description: 'Forbidden: bot was kicked' },
    });

    await service.flushDigests();

    expect(groupUpdate).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { isActive: false },
    });
    expect(deletedIds()).toEqual(['i1']);
  });

  it('stops waiting for a chat that no longer exists, without deactivating it', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    groupFindMany.mockResolvedValue([chat('g1', 100n, 5)]);
    sendMessage.mockRejectedValue({
      response: { error_code: 400, description: 'Bad Request: chat not found' },
    });

    await service.flushDigests();

    expect(groupUpdate).not.toHaveBeenCalled();
    expect(deletedIds()).toEqual(['i1']);
  });

  it('retries recording a delivery once', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    groupFindMany.mockResolvedValue([chat('g1', 100n, 5)]);
    updateMany
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ count: 1 });

    await service.flushDigests();

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(deletedIds()).toEqual(['i1']);
  });

  it('keeps rows and logs an error on a content error', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    groupFindMany.mockResolvedValue([chat('g1', 100n, 5)]);
    sendMessage.mockRejectedValue({
      response: {
        error_code: 400,
        description: 'Bad Request: message is too long',
      },
    });
    const error = jest.spyOn((service as any).logger, 'error');

    await service.flushDigests();

    expect(deletedIds()).toEqual([]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('message is too long'),
    );
  });

  it('clears the rows of a company that has no approved group', async () => {
    findMany.mockResolvedValue([groupRow('i1', 5)]);
    groupFindMany.mockResolvedValue([]);
    await service.flushDigests();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(deletedIds()).toEqual(['i1']);
  });

  it("isolates companies: one company's failure does not stop the next", async () => {
    findMany.mockResolvedValue([
      groupRow('a1', null, { companyId: 1001 }),
      groupRow('b1', null, { companyId: 1002 }),
    ]);
    companyFindMany.mockResolvedValue([
      { id: 1001, name: 'A' },
      { id: 1002, name: 'B' },
    ]);
    groupFindMany
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValueOnce([chat('gb', 500n, null, true)]);

    await service.flushDigests();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      '500',
      expect.any(String),
      expect.any(Object),
    );
    expect(deletedIds()).toEqual(['b1']);
  });
});
