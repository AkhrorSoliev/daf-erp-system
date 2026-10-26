import { ConflictException, NotFoundException } from '@nestjs/common';
import { ChatReportsService } from './chat-reports.service';

const T = (s: string) => new Date(`2026-10-25T${s}Z`);

function make(
  o: { member?: boolean; openReport?: boolean; updated?: number } = {},
) {
  const prisma = {
    chatReport: {
      findFirst: jest
        .fn()
        .mockResolvedValue(o.openReport ? { id: 'r0' } : null),
      create: jest.fn().mockResolvedValue({ id: 'r1', status: 'OPEN' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: o.updated ?? 1 }),
    },
    chatMessage: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'm2',
          senderId: 2,
          kind: 'TEXT',
          text: 'ikkinchi',
          fileKey: null,
          deletedAt: null,
          createdAt: T('08:01:00'),
        },
        {
          id: 'm1',
          senderId: 1,
          kind: 'IMAGE',
          text: null,
          fileKey: 'k',
          deletedAt: T('08:05:00'),
          createdAt: T('08:00:00'),
        },
      ]),
    },
    student: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: number } }) =>
          Promise.resolve({
            firstName: where.id === 1 ? 'Ali' : 'Vali',
            lastName: 'Karimov',
          }),
        ),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 10 }, { id: 11 }]) },
  };
  const conversations = {
    mine:
      o.member === false
        ? jest.fn().mockRejectedValue(new NotFoundException('Suhbat topilmadi'))
        : jest.fn().mockResolvedValue({ c: { id: 'c1' }, peerId: 2 }),
  };
  const ban = { ban: jest.fn().mockResolvedValue({ chatBannedAt: 'x' }) };
  const notifications = {
    create: jest
      .fn()
      .mockImplementation((p: { userId: number }) =>
        Promise.resolve({ id: `n${p.userId}`, ...p }),
      ),
  };
  const gateway = { sendToUser: jest.fn() };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const resolver = { resolve: jest.fn().mockResolvedValue(2) };
  return {
    service: new ChatReportsService(
      prisma as never,
      conversations as never,
      ban as never,
      notifications as never,
      gateway as never,
      push as never,
      resolver as never,
    ),
    prisma,
    ban,
    notifications,
    gateway,
    push,
    resolver,
  };
}

describe('ChatReportsService CEO notice', () => {
  it('tells every active CEO, names only, with a folded action row', async () => {
    const { service, prisma, notifications, gateway } = make();
    prisma.student.findMany.mockResolvedValue([
      {
        id: 1,
        firstName: 'Ali',
        lastName: 'Karimov',
        username: null,
        chatBannedAt: null,
      },
      {
        id: 2,
        firstName: 'Vali',
        lastName: 'Karimov',
        username: null,
        chatBannedAt: null,
      },
    ]);
    const res = await service.create(1, 7, {
      conversationId: 'c1',
      reason: 'Haqorat sababi',
    });
    expect(res).toEqual({ id: 'r1', status: 'OPEN' });
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      companyId: 7,
      deletedAt: null,
      isActive: true,
      status: 'ACTIVE',
      roles: { some: { role: { name: 'CEO' } } },
    });
    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(notifications.create).toHaveBeenCalledWith({
      userId: 10,
      type: 'CHAT_REPORT',
      title: 'Yangi chat shikoyati',
      message: 'Ali Karimov Vali Karimov haqida shikoyat qildi',
      relatedEntityType: 'ChatReport',
      relatedEntityId: 'r1',
      companyId: 7,
    });
    expect(JSON.stringify(notifications.create.mock.calls)).not.toContain(
      'Haqorat',
    );
    expect(gateway.sendToUser).toHaveBeenCalledTimes(2);
  });

  it('never fails the report when the notice fails', async () => {
    const { service, notifications } = make();
    notifications.create.mockRejectedValue(new Error('down'));
    await expect(
      service.create(1, 7, { conversationId: 'c1', reason: 'x' }),
    ).resolves.toEqual({ id: 'r1', status: 'OPEN' });
  });

  it('closes the notices when the report is resolved', async () => {
    const { service, prisma, resolver } = make();
    prisma.chatReport.findUnique.mockResolvedValue({
      id: 'r1',
      companyId: 7,
      reportedId: 2,
      reporterId: 1,
      status: 'OPEN',
      createdAt: new Date(),
      resolvedAt: null,
      snapshot: [],
    });
    await service.resolve(7, 99, 'r1', { outcome: 'DISMISSED' });
    expect(resolver.resolve).toHaveBeenCalledWith({
      companyId: 7,
      type: 'CHAT_REPORT',
      relatedEntityType: 'ChatReport',
      relatedEntityId: 'r1',
    });
  });
});

describe('ChatReportsService.create', () => {
  it('keeps a text copy of the last 50 messages, oldest first, with deleted flags and no file keys', async () => {
    const { service, prisma } = make();
    await service.create(1, 7, { conversationId: 'c1', reason: 'Haqorat' });
    const findArgs = prisma.chatMessage.findMany.mock.calls[0][0];
    expect(findArgs.where).toEqual({ conversationId: 'c1' }); // deleted ones too: that is the evidence
    expect(findArgs.take).toBe(50);
    const data = prisma.chatReport.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      companyId: 7,
      reporterId: 1,
      reportedId: 2,
      conversationId: 'c1',
      reason: 'Haqorat',
    });
    expect(data.snapshot).toEqual([
      {
        id: 'm1',
        senderId: 1,
        kind: 'IMAGE',
        text: null,
        hasFile: true,
        deleted: true,
        createdAt: '2026-10-25T08:00:00.000Z',
      },
      {
        id: 'm2',
        senderId: 2,
        kind: 'TEXT',
        text: 'ikkinchi',
        hasFile: false,
        deleted: false,
        createdAt: '2026-10-25T08:01:00.000Z',
      },
    ]);
  });

  it("404s for a conversation that is not the reporter's", async () => {
    await expect(
      make({ member: false }).service.create(1, 7, {
        conversationId: 'c1',
        reason: 'xxx',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows one open report per reporter and reported', async () => {
    await expect(
      make({ openReport: true }).service.create(1, 7, {
        conversationId: 'c1',
        reason: 'xxx',
      }),
    ).rejects.toThrow(new ConflictException('Shikoyat allaqachon yuborilgan'));
  });
});

const FULL = {
  id: 'r1',
  companyId: 7,
  reportedId: 2,
  reporterId: 1,
  conversationId: 'c1',
  status: 'RESOLVED',
  reason: 'Haqorat',
  createdAt: T('08:00:00'),
  resolvedAt: T('09:00:00'),
  resolutionNote: 'Ogohlantirildi',
  snapshot: [],
};

describe('ChatReportsService.resolve', () => {
  it('bans first, then closes only an open report of this company', async () => {
    const { service, prisma, ban } = make();
    prisma.chatReport.findUnique.mockResolvedValue({ ...FULL, status: 'OPEN' });
    await service.resolve(7, 99, 'r1', {
      outcome: 'RESOLVED',
      banReported: true,
      note: 'Ogohlantirildi',
    });
    expect(ban.ban).toHaveBeenCalledWith(2, 7, 99);
    expect(prisma.chatReport.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', companyId: 7, status: 'OPEN' },
      data: expect.objectContaining({
        status: 'RESOLVED',
        resolvedById: 99,
        resolutionNote: 'Ogohlantirildi',
      }),
    });
    expect(ban.ban.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.chatReport.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('leaves the report open when the ban fails', async () => {
    const { service, prisma, ban } = make();
    prisma.chatReport.findUnique.mockResolvedValue({ ...FULL, status: 'OPEN' });
    ban.ban.mockRejectedValue(new Error('boom'));
    await expect(
      service.resolve(7, 99, 'r1', { outcome: 'RESOLVED', banReported: true }),
    ).rejects.toThrow('boom');
    expect(prisma.chatReport.updateMany).not.toHaveBeenCalled();
  });

  it('is a 409 when the report is already closed, and bans nobody', async () => {
    const { service, prisma, ban } = make();
    prisma.chatReport.findUnique.mockResolvedValue({
      id: 'r1',
      reportedId: 2,
      companyId: 7,
      status: 'RESOLVED',
    });
    await expect(
      service.resolve(7, 99, 'r1', { outcome: 'DISMISSED', banReported: true }),
    ).rejects.toThrow(ConflictException);
    expect(ban.ban).not.toHaveBeenCalled();
  });

  it('is a 404 for a report of another company', async () => {
    const { service, prisma } = make();
    prisma.chatReport.findUnique.mockResolvedValue({
      id: 'r1',
      reportedId: 2,
      companyId: 8,
    });
    await expect(
      service.resolve(7, 99, 'r1', { outcome: 'RESOLVED' }),
    ).rejects.toThrow(NotFoundException);
  });
});
