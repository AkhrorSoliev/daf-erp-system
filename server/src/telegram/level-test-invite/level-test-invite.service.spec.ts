import { LevelTestInviteService } from './level-test-invite.service';
import { loadInviteAudience } from './level-test-invite.audience';
import { LEVEL_TEST_INVITE_TEXT } from './level-test-invite.text';

const NOW = new Date('2026-10-25T15:00:00Z'); // Toshkent: 20:00, 25.10.2026

function makePrisma(over: {
  students?: { telegramChatId: string; telegramDisconnectedAt: Date | null }[];
  gate?: string[];
  attempts?: string[];
  invited?: string[];
  claimCounts?: number[];
}) {
  const claims = [...(over.claimCounts ?? [])];
  return {
    student: { findMany: jest.fn().mockResolvedValue(over.students ?? []) },
    telegramChannelGateEvent: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (over.gate ?? []).map((telegramUserId) => ({ telegramUserId })),
        ),
    },
    levelTestAttempt: {
      findMany: jest
        .fn()
        .mockResolvedValue((over.attempts ?? []).map((chatId) => ({ chatId }))),
    },
    levelTestInvite: {
      findMany: jest
        .fn()
        .mockResolvedValue((over.invited ?? []).map((chatId) => ({ chatId }))),
      createMany: jest.fn().mockImplementation(async () => ({
        count: claims.length ? claims.shift() : 1,
      })),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

const student = (chat: string, disconnected = false) => ({
  telegramChatId: chat,
  telegramDisconnectedAt: disconnected ? new Date() : null,
});

describe('loadInviteAudience', () => {
  it('bot yeta oladigan o‘quvchilar + kanal tekshiruvidagi o‘quvchi bo‘lmaganlar', async () => {
    const prisma = makePrisma({
      students: [student('1'), student('2', true), student('3')],
      gate: ['1', '2', '4', '5'],
      attempts: ['3'],
      invited: ['5'],
    });
    const a = await loadInviteAudience(prisma as never);
    // 1 — o‘quvchi; 2 — bloklagan o‘quvchi (kanal ro‘yxatida ham kirmaydi);
    // 3 — testni boshlagan; 4 — kanal tekshiruvidagi odam; 5 — taklif olgan.
    expect(a.chats.sort()).toEqual(['1', '4']);
    expect(a.students).toBe(1);
    expect(a.others).toBe(1);
  });
});

describe('LevelTestInviteService', () => {
  const sendMessage = jest.fn();
  const bot = { telegram: { sendMessage } };
  const telegram = { getBot: () => bot };
  let prisma: ReturnType<typeof makePrisma>;
  let service: LevelTestInviteService;

  const make = (over: Parameters<typeof makePrisma>[0]) => {
    prisma = makePrisma(over);
    service = new LevelTestInviteService(prisma as never, telegram as never);
    // Pauzani kutmaymiz.
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as never;
    }) as never);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LEVEL_TEST_INVITE;
    delete process.env.LEVEL_TEST_INVITE_DATE;
    sendMessage.mockResolvedValue({ message_id: 1 });
  });
  afterEach(() => jest.restoreAllMocks());

  it('standart holatda (off) hech narsa qilmaydi', async () => {
    make({ students: [student('1')] });
    const res = await service.run(NOW);
    expect(res.ran).toBe(false);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });

  it('boshqa kunda ishlamaydi', async () => {
    make({ students: [student('1')] });
    process.env.LEVEL_TEST_INVITE = 'on';
    process.env.LEVEL_TEST_INVITE_DATE = '2026-10-26';
    expect((await service.run(NOW)).ran).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('log rejimida sanaydi, yubormaydi', async () => {
    make({ students: [student('1'), student('2')] });
    process.env.LEVEL_TEST_INVITE = 'log';
    process.env.LEVEL_TEST_INVITE_DATE = '2026-10-25';
    const res = await service.run(NOW);
    expect(res).toMatchObject({ ran: true, audience: 2, sent: 0 });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(prisma.levelTestInvite.createMany).not.toHaveBeenCalled();
  });

  it('on: har chatga bir marta, matn va tugma bilan', async () => {
    make({ students: [student('1'), student('2')] });
    process.env.LEVEL_TEST_INVITE = 'on';
    process.env.LEVEL_TEST_INVITE_DATE = '2026-10-25';
    const res = await service.run(NOW);
    expect(res).toMatchObject({ sent: 2, failed: 0 });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    const [chat, text, extra] = sendMessage.mock.calls[0];
    expect(chat).toBe('1');
    expect(text).toBe(LEVEL_TEST_INVITE_TEXT);
    expect(extra.parse_mode).toBe('HTML');
    expect(JSON.stringify(extra.reply_markup)).toContain('menu_level');
    expect(prisma.levelTestInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
  });

  it('allaqachon egallangan chatga (ikkinchi nusxa) yubormaydi', async () => {
    make({ students: [student('1'), student('2')], claimCounts: [0, 1] });
    process.env.LEVEL_TEST_INVITE = 'on';
    process.env.LEVEL_TEST_INVITE_DATE = '2026-10-25';
    const res = await service.run(NOW);
    expect(res.sent).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toBe('2');
  });

  it('rad etilgan chat qayd qilinadi va keyingisiga o‘tadi', async () => {
    make({ students: [student('1'), student('2')] });
    process.env.LEVEL_TEST_INVITE = 'on';
    process.env.LEVEL_TEST_INVITE_DATE = '2026-10-25';
    sendMessage
      .mockRejectedValueOnce({
        response: {
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user',
        },
      })
      .mockResolvedValueOnce({ message_id: 2 });
    const res = await service.run(NOW);
    expect(res).toMatchObject({ sent: 1, failed: 1 });
    expect(prisma.levelTestInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { note: expect.stringContaining('permanent') },
      }),
    );
  });
});
