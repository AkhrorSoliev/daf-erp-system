import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TelegramReportRecipientsService } from './telegram-report-recipients.service';

jest.mock('../tasks/telegram/task-telegram-view', () => ({
  staffChatOf: jest.fn().mockResolvedValue({ chatId: '1', roleIds: [3] }),
}));

const ROW = {
  id: 7,
  companyId: 1,
  userId: 50,
  sendTime: '21:00',
  layout: 'BY_SECTION',
  allBranches: false,
  branchIds: [2],
  sections: ['STUDENTS'],
  isActive: true,
  lastSentDate: null,
  lastAttemptAt: null,
  lastAttemptOk: null,
  lastAttemptNote: null,
  createdById: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setup() {
  const prisma = {
    telegramReportRecipient: {
      findMany: jest.fn().mockResolvedValue([ROW]),
      findFirst: jest.fn().mockResolvedValue(ROW),
      create: jest.fn(async ({ data }) => ({ ...ROW, ...data, id: 8 })),
      update: jest.fn(async ({ data }) => ({ ...ROW, ...data })),
      delete: jest.fn().mockResolvedValue(ROW),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        mainBranch: 2,
        branches: [{ branchId: 3 }],
        roles: [{ roleId: 3 }],
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 50,
          firstName: 'Ali',
          lastName: 'Valiyev',
          position: 'Administrator',
          telegramDisconnectedAt: null,
        },
      ]),
    },
    branch: {
      findMany: jest.fn().mockResolvedValue([
        { id: 2, name: 'Namangan' },
        { id: 3, name: "Farg'ona" },
      ]),
    },
  };
  const history = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };
  const reports = {
    deliver: jest.fn().mockResolvedValue({ ok: true }),
    botActive: jest.fn().mockResolvedValue(true),
    probe: jest.fn(),
    preview: jest.fn(),
  };
  const svc = new TelegramReportRecipientsService(
    prisma as never,
    history as never,
    reports as never,
  );
  return { svc, prisma, history, reports };
}

describe('TelegramReportRecipientsService', () => {
  it('lists with the Telegram state and the branch list', async () => {
    const { svc } = setup();
    const out = await svc.list(1);
    expect(out.recipients[0]).toEqual(
      expect.objectContaining({
        name: 'Ali Valiyev',
        telegramLinked: true,
        noBranch: false,
      }),
    );
    expect(out.branches).toHaveLength(2);
  });

  it('create: own branches, non-money sections, 21:00', async () => {
    const { svc, prisma, history } = setup();
    prisma.telegramReportRecipient.findFirst.mockResolvedValueOnce(null);
    await svc.create(1, 99, 50);
    expect(prisma.telegramReportRecipient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 1,
        userId: 50,
        createdById: 99,
        sendTime: '21:00',
        layout: 'BY_SECTION',
        allBranches: false,
        branchIds: [2, 3],
        sections: ['STUDENTS', 'LESSONS', 'ACTIVE_STUDENTS', 'ALERTS'],
      }),
    });
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'TelegramReportRecipient' }),
    );
  });

  it('create: a CEO gets every branch', async () => {
    const { svc, prisma } = setup();
    prisma.telegramReportRecipient.findFirst.mockResolvedValueOnce(null);
    prisma.user.findFirst.mockResolvedValueOnce({
      mainBranch: null,
      branches: [],
      roles: [{ roleId: 1 }],
    });
    await svc.create(1, 99, 50);
    expect(prisma.telegramReportRecipient.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ allBranches: true, branchIds: [] }),
    );
  });

  it('create: unknown or non-staff user → 404, duplicate → 409', async () => {
    const { svc, prisma } = setup();
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(svc.create(1, 99, 50)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.create(1, 99, 50)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('update: a foreign branch is refused', async () => {
    const { svc } = setup();
    await expect(
      svc.update(1, 99, 7, { branchIds: [42] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update: «Barcha filiallar» clears the list and writes history as text', async () => {
    const { svc, prisma, history } = setup();
    await svc.update(1, 99, 7, { allBranches: true });
    expect(prisma.telegramReportRecipient.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ allBranches: true, branchIds: [] }),
    );
    expect(history.recordUpdate.mock.calls[0][0].newValues.branchIds).toBe('');
  });

  it('update / remove / test of another company → 404', async () => {
    const { svc, prisma } = setup();
    prisma.telegramReportRecipient.findFirst.mockResolvedValue(null);
    await expect(svc.update(1, 99, 7, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.remove(1, 99, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.test(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('test: maps a failed delivery to a readable 400', async () => {
    const { svc, reports } = setup();
    reports.deliver.mockResolvedValueOnce({ ok: false, reason: 'NO_CHAT' });
    await expect(svc.test(1, 7)).rejects.toThrow(/Telegram ulanmagan/);
    reports.deliver.mockResolvedValueOnce({ ok: false, reason: 'NO_BRANCH' });
    await expect(svc.test(1, 7)).rejects.toThrow(/Filial tanlanmagan/);
    await expect(svc.test(1, 7)).resolves.toEqual({ sent: true });
  });
});

describe('reach in the list', () => {
  it('reports the bot status with the list', async () => {
    const { svc } = setup();
    expect((await svc.list(1)).bot).toEqual({ active: true });
  });

  it('LINKED when linked and never tried', async () => {
    const { svc } = setup();
    const r = (await svc.list(1)).recipients[0];
    expect(r).toEqual(
      expect.objectContaining({
        reach: 'LINKED',
        blockedAt: null,
        lastAttempt: null,
      }),
    );
  });

  it('BLOCKED carries the date; DELIVERED carries the last attempt', async () => {
    const { svc, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 50,
        firstName: 'Ali',
        lastName: 'Valiyev',
        position: 'Administrator',
        telegramDisconnectedAt: new Date('2026-10-16T10:00:00Z'),
      },
    ]);
    expect((await svc.list(1)).recipients[0]).toEqual(
      expect.objectContaining({
        reach: 'BLOCKED',
        blockedAt: '2026-10-16T10:00:00.000Z',
      }),
    );
    prisma.user.findMany.mockResolvedValue([
      {
        id: 50,
        firstName: 'Ali',
        lastName: 'Valiyev',
        position: null,
        telegramDisconnectedAt: null,
      },
    ]);
    prisma.telegramReportRecipient.findMany.mockResolvedValue([
      {
        ...ROW,
        lastAttemptAt: new Date('2026-10-17T16:00:00Z'),
        lastAttemptOk: true,
        lastAttemptNote: null,
      },
    ]);
    expect((await svc.list(1)).recipients[0]).toEqual(
      expect.objectContaining({
        reach: 'DELIVERED',
        lastAttempt: { at: '2026-10-17T16:00:00.000Z', ok: true, note: null },
      }),
    );
  });
});

describe('check and preview', () => {
  it("check runs the probe for the recipient of the caller's company", async () => {
    const { svc, prisma, reports } = setup();
    reports.probe = jest
      .fn()
      .mockResolvedValue({ reach: 'DELIVERED', note: null });
    expect(await svc.check(1, 7)).toEqual({ reach: 'DELIVERED', note: null });
    expect(prisma.telegramReportRecipient.findFirst).toHaveBeenCalledWith({
      where: { id: 7, companyId: 1 },
    });
    expect(reports.probe).toHaveBeenCalledWith(ROW.userId);
  });

  it('preview returns the text; another company -> 404', async () => {
    const { svc, prisma, reports } = setup();
    reports.preview = jest.fn().mockResolvedValue('📊 16.10 — 21:00 holati');
    expect(await svc.preview(1, 7)).toEqual({
      text: '📊 16.10 — 21:00 holati',
    });
    prisma.telegramReportRecipient.findFirst.mockResolvedValue(null);
    await expect(svc.preview(1, 7)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.check(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });
});
