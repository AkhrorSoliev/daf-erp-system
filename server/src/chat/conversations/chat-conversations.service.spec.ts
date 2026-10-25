import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ChatConversationsService } from './chat-conversations.service';

const conv = { id: 'c1', companyId: 1, studentLowId: 1, studentHighId: 2 };

function make(
  o: {
    access?: Error | null;
    blocked?: object;
    privacy?: object;
    shares?: boolean;
    rate?: number;
  } = {},
) {
  const tx = {
    chatMessage: {
      create: jest.fn().mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        senderId: 1,
        kind: 'TEXT',
        text: 'salom',
        createdAt: new Date('2026-10-25T07:00:00Z'),
      }),
    },
    chatConversation: { update: jest.fn() },
    chatReadState: { upsert: jest.fn() },
  };
  const prisma = {
    chatConversation: {
      findUnique: jest.fn().mockResolvedValue(conv),
      findFirst: jest.fn().mockResolvedValue(conv),
      upsert: jest.fn().mockResolvedValue(conv),
      findMany: jest.fn().mockResolvedValue([]),
    },
    student: { findFirst: jest.fn().mockResolvedValue({ id: 2, userId: 22 }) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    chatMessage: {
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    chatReadState: { upsert: jest.fn(), findUnique: jest.fn() },
  };
  const access = {
    assertCanWrite: jest.fn(async () => {
      if (o.access) throw o.access;
    }),
  };
  const people = {
    isBlockedEitherWay: jest
      .fn()
      .mockResolvedValue(o.blocked ?? { iBlocked: false, blockedMe: false }),
    privacyOf: jest
      .fn()
      .mockResolvedValue(o.privacy ?? { whoCanWrite: 'EVERYONE' }),
    sharesGroup: jest.fn().mockResolvedValue(o.shares ?? false),
    peerSummary: jest.fn(),
    findByUsername: jest.fn(),
  };
  const gateway = { sendToUser: jest.fn() };
  const rate = o.rate ?? 1;
  const service = new ChatConversationsService(
    prisma as never,
    access as never,
    people as never,
    gateway as never,
    { hit: jest.fn().mockResolvedValue(rate) } as never,
  );
  return { service, prisma, tx, access, people, gateway };
}

describe('ChatConversationsService.send', () => {
  it('writes the message, bumps the conversation and pushes it live to the peer', async () => {
    const { service, tx, gateway } = make();
    const out = await service.send(1, 1, 'c1', 'salom');
    expect(out).toMatchObject({ id: 'm1', mine: true, text: 'salom' });
    expect(tx.chatConversation.update).toHaveBeenCalled();
    expect(tx.chatReadState.upsert).toHaveBeenCalled();
    expect(gateway.sendToUser).toHaveBeenCalledWith(
      22,
      expect.objectContaining({
        type: 'chat.message',
        conversationId: 'c1',
        message: expect.objectContaining({ id: 'm1', mine: false }),
      }),
    );
  });

  it('stops at the access check before touching anything else', async () => {
    const { service, prisma } = make({
      access: new ForbiddenException('Qarzingiz bor'),
    });
    await expect(service.send(1, 1, 'c1', 'salom')).rejects.toThrow(
      'Qarzingiz bor',
    );
    expect(prisma.chatConversation.findUnique).not.toHaveBeenCalled();
  });

  it('404s for a conversation the caller is not part of', async () => {
    const { service } = make();
    await expect(service.send(99, 1, 'c1', 'x')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('hides a block behind the same words as a privacy refusal', async () => {
    const { service } = make({
      blocked: { iBlocked: false, blockedMe: true },
    });
    await expect(service.send(1, 1, 'c1', 'x')).rejects.toThrow(
      "Bu o'quvchi sizga yozishni cheklagan",
    );
  });

  it('tells the caller to unblock first when the caller blocked the peer', async () => {
    const { service } = make({
      blocked: { iBlocked: true, blockedMe: false },
    });
    await expect(service.send(1, 1, 'c1', 'x')).rejects.toThrow(
      'Avval blokdan chiqaring',
    );
  });

  it('honours the peer\'s "groupmates only" setting', async () => {
    const closed = make({
      privacy: { whoCanWrite: 'GROUPMATES' },
      shares: false,
    });
    await expect(closed.service.send(1, 1, 'c1', 'x')).rejects.toThrow(
      "Bu o'quvchi sizga yozishni cheklagan",
    );
    const open = make({
      privacy: { whoCanWrite: 'GROUPMATES' },
      shares: true,
    });
    await expect(open.service.send(1, 1, 'c1', 'x')).resolves.toBeDefined();
  });

  it('answers 429 past 30 messages a minute', async () => {
    const { service } = make({ rate: 31 });
    await expect(service.send(1, 1, 'c1', 'x')).rejects.toThrow(HttpException);
  });
});

describe('ChatConversationsService.open', () => {
  it('refuses a conversation with yourself', async () => {
    const { service } = make();
    await expect(service.open(1, 1, { studentId: 1 })).rejects.toThrow(
      /o'zingiz/i,
    );
  });

  it('puts the smaller id first so a pair has one row', async () => {
    const { service, prisma } = make();
    prisma.chatConversation.findFirst.mockResolvedValue(null);
    await service.open(2, 1, { studentId: 1 });
    expect(prisma.chatConversation.upsert.mock.calls[0][0].where).toEqual({
      studentLowId_studentHighId: { studentLowId: 1, studentHighId: 2 },
    });
  });
});

describe('ChatConversationsService.list', () => {
  it('lists nothing for a student without conversations', async () => {
    const { service } = make();
    expect(await service.list(1)).toEqual([]);
  });

  it('builds peer, last-message preview and unread count from lastReadAt', async () => {
    const { service, prisma, people } = make();
    const peer = { id: 2, firstName: 'Ali' };
    people.peerSummary.mockResolvedValue(peer);
    const lastReadAt = new Date('2026-10-25T06:00:00Z');
    prisma.chatConversation.findMany.mockResolvedValue([conv]);
    prisma.chatMessage.findFirst.mockResolvedValue({
      id: 'm9',
      senderId: 2,
      kind: 'IMAGE',
      text: null,
      createdAt: new Date('2026-10-25T07:30:00Z'),
    });
    prisma.chatReadState.findUnique.mockResolvedValue({ lastReadAt });
    prisma.chatMessage.count.mockResolvedValue(3);

    const out = await service.list(1);

    expect(people.peerSummary).toHaveBeenCalledWith(1, 2);
    expect(prisma.chatMessage.count).toHaveBeenCalledWith({
      where: {
        conversationId: 'c1',
        senderId: { not: 1 },
        deletedAt: null,
        createdAt: { gt: lastReadAt },
      },
    });
    expect(out).toEqual([
      {
        id: 'c1',
        peer,
        lastMessage: {
          preview: 'Rasm',
          at: '2026-10-25T07:30:00.000Z',
          mine: false,
        },
        unread: 3,
      },
    ]);
  });
});

describe('ChatConversationsService.removeOwn', () => {
  it("soft-deletes only the caller's own message", async () => {
    const { service, prisma } = make();
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 'm1', senderId: 1 });
    await service.removeOwn(1, 'm1');
    expect(prisma.chatMessage.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { deletedAt: expect.any(Date) },
    });
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    await expect(service.removeOwn(1, 'zz')).rejects.toThrow(NotFoundException);
  });
});
