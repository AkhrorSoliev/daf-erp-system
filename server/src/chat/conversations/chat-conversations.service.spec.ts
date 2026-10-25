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
  const limiter = { hit: jest.fn().mockResolvedValue(rate) };
  const service = new ChatConversationsService(
    prisma as never,
    access as never,
    people as never,
    gateway as never,
    limiter as never,
  );
  return { service, prisma, tx, access, people, gateway, limiter };
}

describe('ChatConversationsService.send', () => {
  it('writes the message, bumps the conversation and pushes it live to the peer', async () => {
    const { service, tx, gateway } = make();
    const out = await service.send(1, 1, 'c1', 'salom');
    expect(out).toMatchObject({ id: 'm1', mine: true, text: 'salom' });
    const at = new Date('2026-10-25T07:00:00Z');
    expect(tx.chatConversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { lastMessageAt: at },
    });
    expect(tx.chatReadState.upsert).toHaveBeenCalledWith({
      where: {
        conversationId_studentId: { conversationId: 'c1', studentId: 1 },
      },
      create: { conversationId: 'c1', studentId: 1, lastReadAt: at },
      update: { lastReadAt: at },
    });
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
    const err = await service.send(1, 1, 'c1', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).message).toBe(
      'Juda tez yozyapsiz. Biroz kuting',
    );
  });

  it('does not touch the rate limiter when the peer privacy refuses', async () => {
    const { service, limiter } = make({
      privacy: { whoCanWrite: 'GROUPMATES' },
      shares: false,
    });
    await expect(service.send(1, 1, 'c1', 'x')).rejects.toThrow(
      "Bu o'quvchi sizga yozishni cheklagan",
    );
    expect(limiter.hit).not.toHaveBeenCalled();
  });

  it('counts one hit per send under the caller-minute key with a 120 s ttl', async () => {
    const { service, limiter } = make();
    await service.send(1, 1, 'c1', 'salom');
    expect(limiter.hit).toHaveBeenCalledTimes(1);
    const [key, ttl] = limiter.hit.mock.calls[0] as [string, number];
    expect(key).toMatch(/^chat:rate:1:\d+$/);
    expect(ttl).toBe(120);
  });

  it('sends nothing live when the peer has no account', async () => {
    const { service, prisma, gateway } = make();
    prisma.student.findFirst.mockResolvedValue({ userId: null });
    await expect(service.send(1, 1, 'c1', 'salom')).resolves.toBeDefined();
    expect(gateway.sendToUser).not.toHaveBeenCalled();
  });

  it('still returns the saved message when the live push lookup fails', async () => {
    const { service, prisma, gateway } = make();
    prisma.student.findFirst.mockRejectedValue(new Error('db down'));
    const out = await service.send(1, 1, 'c1', 'salom');
    expect(out).toMatchObject({ id: 'm1', mine: true, text: 'salom' });
    expect(gateway.sendToUser).not.toHaveBeenCalled();
  });
});

describe('ChatConversationsService.markRead', () => {
  it('404s for a conversation the caller is not part of', async () => {
    const { service, prisma } = make();
    await expect(service.markRead(99, 'c1')).rejects.toThrow(NotFoundException);
    expect(prisma.chatReadState.upsert).not.toHaveBeenCalled();
  });

  it('upserts the callers read state and pushes chat.read to the peer', async () => {
    const { service, prisma, gateway } = make();
    await expect(service.markRead(1, 'c1')).resolves.toEqual({ ok: true });
    const arg = prisma.chatReadState.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({
      conversationId_studentId: { conversationId: 'c1', studentId: 1 },
    });
    expect(arg.create.studentId).toBe(1);
    const readAt = arg.create.lastReadAt as Date;
    expect(gateway.sendToUser).toHaveBeenCalledWith(22, {
      type: 'chat.read',
      conversationId: 'c1',
      readAt: readAt.toISOString(),
    });
  });

  it('still resolves when the live push lookup fails', async () => {
    const { service, prisma } = make();
    prisma.student.findFirst.mockRejectedValue(new Error('db down'));
    await expect(service.markRead(1, 'c1')).resolves.toEqual({ ok: true });
  });
});

describe('ChatConversationsService.messages', () => {
  const row = (id: string) => ({
    id,
    senderId: 2,
    kind: 'TEXT',
    text: id,
    createdAt: new Date('2026-10-25T07:00:00Z'),
  });

  it('404s for a non-member', async () => {
    const { service } = make();
    await expect(service.messages(99, 'c1')).rejects.toThrow(NotFoundException);
  });

  it('pages with limit + 1 and returns the cursor of the last item shown', async () => {
    const { service, prisma } = make();
    prisma.chatMessage.findMany.mockResolvedValue([
      row('a'),
      row('b'),
      row('c'),
    ]);
    const out = await service.messages(1, 'c1', undefined, 2);
    expect(out.data.map((m) => m.id)).toEqual(['a', 'b']);
    expect(out.nextCursor).toBe('b');
    expect(prisma.chatMessage.findMany.mock.calls[0][0].where).toEqual({
      conversationId: 'c1',
      deletedAt: null,
    });
    expect(prisma.chatMessage.findMany.mock.calls[0][0].take).toBe(3);
  });

  it('has no cursor on the last page', async () => {
    const { service, prisma } = make();
    prisma.chatMessage.findMany.mockResolvedValue([row('a'), row('b')]);
    const out = await service.messages(1, 'c1', undefined, 2);
    expect(out.data).toHaveLength(2);
    expect(out.nextCursor).toBeNull();
  });
});

describe('ChatConversationsService.open', () => {
  it('refuses a conversation with yourself', async () => {
    const { service } = make();
    await expect(service.open(1, 1, { studentId: 1 })).rejects.toThrow(
      /o'zingiz/i,
    );
  });

  it('opens an existing conversation without the write check, even for a locked student', async () => {
    const { service, access, prisma } = make({
      access: new ForbiddenException('Qarzingiz bor'),
    });
    await expect(service.open(1, 1, { studentId: 2 })).resolves.toEqual({
      id: 'c1',
    });
    expect(access.assertCanWrite).not.toHaveBeenCalled();
    expect(prisma.chatConversation.upsert).not.toHaveBeenCalled();
  });

  it('applies the write check to a new conversation and creates nothing when refused', async () => {
    const { service, access, prisma } = make({
      access: new ForbiddenException('Qarzingiz bor'),
    });
    prisma.chatConversation.findFirst.mockResolvedValue(null);
    await expect(service.open(1, 1, { studentId: 2 })).rejects.toThrow(
      'Qarzingiz bor',
    );
    expect(access.assertCanWrite).toHaveBeenCalledWith(1, 1);
    expect(prisma.chatConversation.upsert).not.toHaveBeenCalled();
  });

  it('404s for a peer outside the company or deleted, scoping the lookup', async () => {
    const { service, prisma } = make();
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(service.open(1, 7, { studentId: 2 })).rejects.toThrow(
      "O'quvchi topilmadi",
    );
    expect(prisma.student.findFirst.mock.calls[0][0].where).toEqual({
      id: 2,
      companyId: 7,
      deletedAt: null,
    });
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
