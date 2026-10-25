import { ChatNotifyService } from './chat-notify.service';

const DAY = new Date('2026-10-25T07:00:00Z'); // 12:00 Tashkent
const NIGHT = new Date('2026-10-25T18:00:00Z'); // 23:00 Tashkent
const input = {
  conversationId: 'c1',
  senderId: 1,
  recipientId: 2,
  companyId: 1,
};

function make(
  o: {
    state?: object | null;
    read?: object | null;
    existingBell?: boolean;
    chat?: boolean;
    disconnected?: boolean;
    switchOff?: boolean;
    smsFails?: boolean;
  } = {},
) {
  const prisma = {
    student: {
      findFirst: jest.fn(async ({ where }: { where: { id: number } }) =>
        where.id === 2
          ? {
              userId: 22,
              telegramChatId: o.chat === false ? null : '555',
              telegramDisconnectedAt: o.disconnected ? new Date() : null,
            }
          : { firstName: 'Ali', lastName: 'Valiyev' },
      ),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(o.existingBell ? { id: 9 } : null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    chatReadState: { findUnique: jest.fn().mockResolvedValue(o.read ?? null) },
    chatNotifyState: {
      findUnique: jest.fn().mockResolvedValue(o.state ?? null),
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    chatMessage: { count: jest.fn().mockResolvedValue(1) },
    chatConversation: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        companyId: 1,
        studentLowId: 1,
        studentHighId: 2,
      }),
    },
  };
  const notifications = { create: jest.fn().mockResolvedValue({ id: 5 }) };
  const gateway = { sendToUser: jest.fn() };
  const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const sms = {
    sendToStudent: o.smsFails
      ? jest.fn().mockRejectedValue(new Error('telegram down'))
      : jest.fn().mockResolvedValue({}),
  };
  const config = { get: jest.fn(() => 'https://student.dafzentrum.uz/tg') };
  const settings = {
    get: jest.fn().mockResolvedValue(o.switchOff ? false : true),
  };
  const service = new ChatNotifyService(
    prisma as never,
    notifications as never,
    gateway as never,
    push as never,
    sms as never,
    config as never,
    settings as never,
  );
  return { service, prisma, notifications, gateway, push, sms, settings };
}

describe('ChatNotifyService.onMessage', () => {
  it('writes the bell row, pushes it and sends the Telegram notice with a Mini App button', async () => {
    const { service, notifications, gateway, push, sms, prisma } = make();
    await service.onMessage(input, DAY);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 22,
        type: 'CHAT_MESSAGE',
        relatedEntityType: 'ChatConversation',
        relatedEntityId: 'c1',
        companyId: 1,
      }),
    );
    expect(gateway.sendToUser).toHaveBeenCalledWith(
      22,
      expect.objectContaining({ type: 'notification' }),
    );
    expect(push.sendToUser).toHaveBeenCalledWith(
      22,
      expect.objectContaining({ url: '/portal/chat/c1' }),
    );
    const [studentId, content, , , companyId, opts] =
      sms.sendToStudent.mock.calls[0];
    expect(studentId).toBe(2);
    expect(content).toBe('<b>Ali Valiyev</b> sizga yangi xabar yubordi.');
    expect(companyId).toBe(1);
    expect(JSON.stringify(opts.replyMarkup)).toContain(
      'next=%2Fportal%2Fchat%2Fc1',
    );
    expect(prisma.chatNotifyState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId_studentId: { conversationId: 'c1', studentId: 2 },
        },
        update: expect.objectContaining({
          notifiedAt: DAY,
          pendingSince: null,
        }),
      }),
    );
  });

  it('keeps one unread bell row per conversation', async () => {
    const { service, notifications } = make({ existingBell: true });
    await service.onMessage(input, DAY);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('sends no second Telegram notice while the first is unread', async () => {
    const { service, sms } = make({
      state: { notifiedAt: new Date('2026-10-25T06:00:00Z') },
    });
    await service.onMessage(input, DAY);
    expect(sms.sendToStudent).not.toHaveBeenCalled();
  });

  it('holds the Telegram notice at night', async () => {
    const { service, sms, prisma } = make();
    await service.onMessage(input, NIGHT);
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(prisma.chatNotifyState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { pendingSince: NIGHT } }),
    );
  });

  it('does nothing in Telegram for a student without a linked chat, but still writes the bell', async () => {
    const { service, sms, notifications } = make({ chat: false });
    await service.onMessage(input, DAY);
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(notifications.create).toHaveBeenCalled();
  });

  it('never throws, even when Telegram is down', async () => {
    const { service } = make({ smsFails: true });
    await expect(service.onMessage(input, DAY)).resolves.toBeUndefined();
  });
});

describe('ChatNotifyService disconnected chat', () => {
  it('still writes the bell and push but skips Telegram and the state', async () => {
    const { service, notifications, push, sms, prisma } = make({
      disconnected: true,
    });
    await service.onMessage(input, DAY);
    expect(notifications.create).toHaveBeenCalled();
    expect(push.sendToUser).toHaveBeenCalled();
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(prisma.chatNotifyState.upsert).not.toHaveBeenCalled();
  });
});

describe('ChatNotifyService.onRead', () => {
  it('marks the conversation bell rows read', async () => {
    const { service, prisma } = make();
    await service.onRead(2, 'c1');
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 22,
        type: 'CHAT_MESSAGE',
        relatedEntityId: 'c1',
        isRead: false,
      },
      data: { isRead: true },
    });
  });
});

describe('ChatNotifyService.sendMorning', () => {
  it('sends one notice for a still-unread pending conversation and clears the wait', async () => {
    const { service, prisma, sms } = make();
    prisma.chatNotifyState.findMany.mockResolvedValue([
      {
        conversationId: 'c1',
        studentId: 2,
        notifiedAt: null,
        pendingSince: new Date('2026-10-25T18:00:00Z'),
      },
    ]);
    await service.sendMorning(new Date('2026-10-26T03:05:00Z'));
    expect(sms.sendToStudent).toHaveBeenCalledTimes(1);
    expect(prisma.chatNotifyState.update).toHaveBeenCalledWith({
      where: {
        conversationId_studentId: { conversationId: 'c1', studentId: 2 },
      },
      data: {
        notifiedAt: new Date('2026-10-26T03:05:00Z'),
        pendingSince: null,
      },
    });
  });

  it('drops the wait without a message when the recipient read meanwhile', async () => {
    const { service, prisma, sms } = make();
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.chatNotifyState.findMany.mockResolvedValue([
      {
        conversationId: 'c1',
        studentId: 2,
        notifiedAt: null,
        pendingSince: new Date('2026-10-25T18:00:00Z'),
      },
    ]);
    await service.sendMorning(new Date('2026-10-26T03:05:00Z'));
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(prisma.chatNotifyState.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pendingSince: null } }),
    );
  });

  const pendingRow = [
    {
      conversationId: 'c1',
      studentId: 2,
      notifiedAt: null,
      pendingSince: new Date('2026-10-25T18:00:00Z'),
    },
  ];
  const cleared = {
    where: { conversationId_studentId: { conversationId: 'c1', studentId: 2 } },
    data: { pendingSince: null },
  };

  it('clears the wait and sends nothing for a deleted recipient', async () => {
    const { service, prisma, sms } = make();
    prisma.chatNotifyState.findMany.mockResolvedValue(pendingRow);
    (prisma.student.findFirst as jest.Mock).mockImplementation(
      async ({ where }: { where: { id: number; deletedAt?: null } }) =>
        where.id === 2 && where.deletedAt === null
          ? null
          : { firstName: 'Ali', lastName: 'Valiyev' },
    );
    await service.sendMorning(new Date('2026-10-26T03:05:00Z'));
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(prisma.chatNotifyState.update).toHaveBeenCalledWith(cleared);
  });

  it('clears the wait and sends nothing for a disconnected recipient', async () => {
    const { service, prisma, sms } = make({ disconnected: true });
    prisma.chatNotifyState.findMany.mockResolvedValue(pendingRow);
    await service.sendMorning(new Date('2026-10-26T03:05:00Z'));
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(prisma.chatNotifyState.update).toHaveBeenCalledWith(cleared);
  });

  it('clears the wait and sends nothing while the chat switch is off', async () => {
    const { service, prisma, sms } = make({ switchOff: true });
    prisma.chatNotifyState.findMany.mockResolvedValue(pendingRow);
    await service.sendMorning(new Date('2026-10-26T03:05:00Z'));
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(prisma.chatNotifyState.update).toHaveBeenCalledWith(cleared);
  });
});
