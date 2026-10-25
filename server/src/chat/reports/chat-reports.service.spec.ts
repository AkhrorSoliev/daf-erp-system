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
    student: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const conversations = {
    mine:
      o.member === false
        ? jest.fn().mockRejectedValue(new NotFoundException('Suhbat topilmadi'))
        : jest.fn().mockResolvedValue({ c: { id: 'c1' }, peerId: 2 }),
  };
  const ban = { ban: jest.fn().mockResolvedValue({ chatBannedAt: 'x' }) };
  return {
    service: new ChatReportsService(
      prisma as never,
      conversations as never,
      ban as never,
    ),
    prisma,
    ban,
  };
}

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
