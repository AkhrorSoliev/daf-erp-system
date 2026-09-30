import { TelegramGroupUnmarkedLessonListener } from './telegram-group-unmarked-lesson.listener';

describe('TelegramGroupUnmarkedLessonListener', () => {
  const payload = {
    companyId: 1,
    branchId: 2,
    groupId: 'g1',
    groupName: '#014',
    date: '2026-09-28',
    lessonStartTime: '16:00',
    lessonEndTime: '17:30',
    reason: 'Ustoz kasal',
    decidedById: 3,
    outcome: 'CANCELLED' as const,
    refundedStudents: 4,
    refundedAmount: 150000,
  };

  it("sends to every approved group that sees the lesson's branch", async () => {
    const sendMessage = jest.fn().mockResolvedValue({ message_id: 1 });
    const prisma = {
      telegramGroup: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tg1',
            chatId: BigInt(-1001),
            branchId: 2,
            receivesAllBranches: false,
          },
          {
            id: 'tg2',
            chatId: BigInt(-1002),
            branchId: 5,
            receivesAllBranches: false,
          },
          {
            id: 'tg3',
            chatId: BigInt(-1003),
            branchId: null,
            receivesAllBranches: true,
          },
        ]),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ firstName: 'Ali', lastName: 'Valiyev' }),
      },
    } as any;
    const adminBot = { getBot: () => ({ telegram: { sendMessage } }) } as any;
    await new TelegramGroupUnmarkedLessonListener(prisma, adminBot).handle(
      payload,
    );
    expect(sendMessage.mock.calls.map((c) => c[0])).toEqual(['-1001', '-1003']);
    expect(sendMessage.mock.calls[0][1]).toContain("Dars bo'lmadi");
    expect(sendMessage.mock.calls[0][2]).toEqual({ parse_mode: 'HTML' });
  });

  it('does nothing without the admin bot', async () => {
    const prisma = {
      telegramGroup: { findMany: jest.fn() },
      user: { findUnique: jest.fn() },
    } as any;
    await new TelegramGroupUnmarkedLessonListener(prisma, {
      getBot: () => null,
    } as any).handle(payload);
    expect(prisma.telegramGroup.findMany).not.toHaveBeenCalled();
  });

  it('never throws when the lookup fails — the answer is already saved', async () => {
    const prisma = {
      telegramGroup: { findMany: jest.fn().mockRejectedValue(new Error('db')) },
      user: { findUnique: jest.fn() },
    } as any;
    const adminBot = {
      getBot: () => ({ telegram: { sendMessage: jest.fn() } }),
    } as any;
    await expect(
      new TelegramGroupUnmarkedLessonListener(prisma, adminBot).handle(payload),
    ).resolves.toBeUndefined();
  });
});
