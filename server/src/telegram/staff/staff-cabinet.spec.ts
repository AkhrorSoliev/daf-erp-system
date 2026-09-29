import {
  signInStaffWhere,
  staffLinkedToChatWhere,
} from '../../common/auth/staff-telegram';
import {
  STAFF_CABINET_BUTTON_TEXT,
  StaffCabinet,
  findStaffForChat,
  staffMenuKeyboard,
  staffMiniAppUrl,
  staffPageUrl,
  type StaffAccount,
} from './staff-cabinet';

const STUDENT_URL = 'https://student.dafzentrum.uz/tg';
const LEHRER_URL = 'https://lehrer.dafzentrum.uz/tg';
const ADMIN_URL = 'https://admin.dafzentrum.uz/tg';
const CHAT = '700000001';

const DOSTON: StaffAccount = {
  id: 30401,
  firstName: 'Doston',
  roleIds: [4],
  portal: 'lehrer',
};
const GULNOZA: StaffAccount = {
  id: 30402,
  firstName: 'Gulnoza',
  roleIds: [3],
  portal: 'admin',
};

/** `inline_keyboard` — har tugmaning yozuvi va Mini App manzili. */
function buttons(markup: any): Array<Array<[string, string | undefined]>> {
  return markup.reply_markup.inline_keyboard.map((row: any[]) =>
    row.map((b) => [b.text, b.web_app?.url]),
  );
}

describe('staffMiniAppUrl', () => {
  it("o'quvchi manzilining xostini xodim portaliga almashtiradi, yo'l saqlanadi", () => {
    expect(staffMiniAppUrl(STUDENT_URL, 'lehrer')).toBe(LEHRER_URL);
    expect(staffMiniAppUrl(STUDENT_URL, 'admin')).toBe(ADMIN_URL);
  });

  it.each([
    ["o'quvchi manzili sozlanmagan", undefined],
    [
      'xost `student.` bilan boshlanmaydi (lokal tunnel)',
      'https://abc.ngrok.app/tg',
    ],
    ['manzil emas', 'student.dafzentrum.uz/tg'],
  ])("%s — manzil yo'q, xodim kabineti o'chiq", (_label, url) => {
    expect(staffMiniAppUrl(url, 'lehrer')).toBeUndefined();
  });
});

describe('staffPageUrl', () => {
  it('kabinetning sahifasini `next` bilan beradi', () => {
    expect(staffPageUrl(LEHRER_URL, '/profile/salary')).toBe(
      'https://lehrer.dafzentrum.uz/tg?next=%2Fprofile%2Fsalary',
    );
  });
});

describe('findStaffForChat', () => {
  const logger = () => ({ warn: jest.fn() });

  it('Mini App kirishi bilan bir xil shart bilan qidiradi', async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } };

    await findStaffForChat(prisma as any, CHAT, logger());

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: staffLinkedToChatWhere(CHAT),
        take: 2,
      }),
    );
  });

  it('bitta xodim — rollari va portali bilan', async () => {
    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 30401, firstName: 'Doston', roles: [{ roleId: 4 }] },
          ]),
      },
    };

    await expect(
      findStaffForChat(prisma as any, CHAT, logger()),
    ).resolves.toEqual(DOSTON);
  });

  it('ustoz ham, administrator ham — admin portali', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 7,
            firstName: 'Iroda',
            roles: [{ roleId: 3 }, { roleId: 4 }],
          },
        ]),
      },
    };

    const account = await findStaffForChat(prisma as any, CHAT, logger());

    expect(account?.portal).toBe('admin');
    expect(account?.roleIds).toEqual([3, 4]);
  });

  it("bir nechta hisob bog'langan bo'lsa — hech kim (Mini App ham rad etadi), log yoziladi", async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, firstName: 'A', roles: [{ roleId: 4 }] },
          { id: 2, firstName: 'B', roles: [{ roleId: 4 }] },
        ]),
      },
    };
    const log = logger();

    await expect(findStaffForChat(prisma as any, CHAT, log)).resolves.toBe(
      null,
    );
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('#1, #2'));
  });
});

describe('staffMenuKeyboard', () => {
  it('ustoz: kabinet, jadval, guruhlar va oylik', () => {
    expect(buttons(staffMenuKeyboard(DOSTON, LEHRER_URL))).toEqual([
      [[STAFF_CABINET_BUTTON_TEXT, LEHRER_URL]],
      [
        ['📅 Jadval', `${LEHRER_URL}?next=%2Fschedule`],
        ['👥 Guruhlar', `${LEHRER_URL}?next=%2Fgroups`],
      ],
      [['💰 Oyligim', `${LEHRER_URL}?next=%2Fprofile%2Fsalary`]],
    ]);
  });

  it("ustoz bo'lmagan xodimda oylik tugmasi yo'q", () => {
    const rows = buttons(staffMenuKeyboard(GULNOZA, ADMIN_URL));

    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain('Oyligim');
  });

  it("o'quvchi kartasiga ham bog'langan Telegram — o'quvchi kabineti ham", () => {
    const rows = buttons(staffMenuKeyboard(DOSTON, LEHRER_URL, STUDENT_URL));

    expect(rows[rows.length - 1]).toEqual([
      ["🎓 O'quvchi kabineti", STUDENT_URL],
    ]);
  });
});

describe('StaffCabinet', () => {
  function setup(opts: {
    staff?: unknown[];
    namedBy?: number;
    studentCards?: number;
    studentUrl?: string | null;
  }) {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue(opts.staff ?? []),
        count: jest.fn().mockResolvedValue(opts.namedBy ?? 0),
      },
      student: {
        count: jest.fn().mockResolvedValue(opts.studentCards ?? 0),
      },
    };
    const telegram = {
      setChatMenuButton: jest.fn().mockResolvedValue(true),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    };
    const logger = { warn: jest.fn() };
    const cabinet = new StaffCabinet(
      prisma as any,
      telegram as any,
      opts.studentUrl === null ? undefined : (opts.studentUrl ?? STUDENT_URL),
      logger,
    );
    return { cabinet, prisma, telegram, logger };
  }

  const DOSTON_ROW = { id: 30401, firstName: 'Doston', roles: [{ roleId: 4 }] };

  function ctxIn(chatType = 'private') {
    return {
      chat: { id: Number(CHAT), type: chatType },
      reply: jest.fn().mockResolvedValue(undefined),
      answerCbQuery: jest.fn().mockResolvedValue(true),
    } as any;
  }

  describe('greet (/start)', () => {
    it('xodim chati: salom, xodim menyusi va shu chatning «Kabinet» tugmasi — ustoz portali', async () => {
      const { cabinet, telegram } = setup({ staff: [DOSTON_ROW] });
      const ctx = ctxIn();

      await expect(cabinet.greet(ctx)).resolves.toBe(true);

      expect(telegram.setChatMenuButton).toHaveBeenCalledWith({
        chatId: Number(CHAT),
        menuButton: expect.objectContaining({ web_app: { url: LEHRER_URL } }),
      });
      expect(ctx.reply).toHaveBeenCalledTimes(2);
      expect(ctx.reply.mock.calls[0][0]).toContain('Doston');
      // Birinchi xabar eski reply-klaviaturani tozalaydi.
      expect(ctx.reply.mock.calls[0][1].reply_markup).toEqual({
        remove_keyboard: true,
      });
      expect(buttons(ctx.reply.mock.calls[1][1])[0]).toEqual([
        [STAFF_CABINET_BUTTON_TEXT, LEHRER_URL],
      ]);
    });

    it("o'quvchi kartasi ham bog'langan bo'lsa — menyuda o'quvchi kabineti ham", async () => {
      const { cabinet } = setup({ staff: [DOSTON_ROW], studentCards: 1 });
      const ctx = ctxIn();

      await cabinet.greet(ctx);

      expect(JSON.stringify(ctx.reply.mock.calls[1][1])).toContain(STUDENT_URL);
    });

    it("xodim emas va hech bir hisob bu chatni ko'rsatmaydi — `false`, Telegram'ga so'rov yo'q", async () => {
      const { cabinet, telegram } = setup({ staff: [], namedBy: 0 });
      const ctx = ctxIn();

      await expect(cabinet.greet(ctx)).resolves.toBe(false);

      expect(ctx.reply).not.toHaveBeenCalled();
      expect(telegram.setChatMenuButton).not.toHaveBeenCalled();
    });

    it("xodimligi tugagan chat (hisob hali shu chatni ko'rsatadi) — tugma o'quvchinikiga qaytadi", async () => {
      const { cabinet, telegram, prisma } = setup({ staff: [], namedBy: 1 });

      await expect(cabinet.greet(ctxIn())).resolves.toBe(false);

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { telegramChatId: CHAT },
      });
      expect(telegram.setChatMenuButton).toHaveBeenCalledWith({
        chatId: Number(CHAT),
        menuButton: { type: 'default' },
      });
    });

    it("Mini App sozlanmagan bo'lsa — hech narsa: o'quvchi menyusi, tugmaga tegilmaydi", async () => {
      const { cabinet, telegram } = setup({
        staff: [DOSTON_ROW],
        namedBy: 1,
        studentUrl: null,
      });
      const ctx = ctxIn();

      await expect(cabinet.greet(ctx)).resolves.toBe(false);

      expect(ctx.reply).not.toHaveBeenCalled();
      expect(telegram.setChatMenuButton).not.toHaveBeenCalled();
    });

    it('guruhda — hech narsa (web_app tugmasi u yerda butun xabarni yiqitadi)', async () => {
      const { cabinet, prisma } = setup({ staff: [DOSTON_ROW] });

      await expect(cabinet.greet(ctxIn('group'))).resolves.toBe(false);

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('answerPlatform (eski menyudagi callback)', () => {
    it('xodimga xodim kabinetining tugmasi', async () => {
      const { cabinet } = setup({ staff: [DOSTON_ROW] });
      const ctx = ctxIn();

      await expect(cabinet.answerPlatform(ctx)).resolves.toBe(true);

      expect(ctx.answerCbQuery).toHaveBeenCalledWith();
      expect(buttons(ctx.reply.mock.calls[0][1])).toEqual([
        [[STAFF_CABINET_BUTTON_TEXT, LEHRER_URL]],
      ]);
    });

    it('xodim emas — `false`, javobni chaqiruvchi beradi', async () => {
      const { cabinet } = setup({ staff: [] });
      const ctx = ctxIn();

      await expect(cabinet.answerPlatform(ctx)).resolves.toBe(false);

      expect(ctx.answerCbQuery).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe("sendCabinetButton (xodim o'quvchi kabinetini ochdi)", () => {
    it('chatga xodim kabinetining tugmasi yuboriladi, «Kabinet» ham shu kabinetga', async () => {
      const { cabinet, telegram } = setup({ staff: [DOSTON_ROW] });

      await expect(cabinet.sendCabinetButton(CHAT)).resolves.toBe(true);

      expect(telegram.setChatMenuButton).toHaveBeenCalledWith({
        chatId: Number(CHAT),
        menuButton: expect.objectContaining({ web_app: { url: LEHRER_URL } }),
      });
      const [chatId, , markup] = telegram.sendMessage.mock.calls[0];
      expect(chatId).toBe(Number(CHAT));
      expect(buttons(markup)).toEqual([
        [[STAFF_CABINET_BUTTON_TEXT, LEHRER_URL]],
      ]);
    });

    it('xodim emas (yoki bir chatda ikki hisob) — hech narsa yuborilmaydi', async () => {
      const { cabinet, telegram } = setup({ staff: [] });

      await expect(cabinet.sendCabinetButton(CHAT)).resolves.toBe(false);

      expect(telegram.sendMessage).not.toHaveBeenCalled();
      expect(telegram.setChatMenuButton).not.toHaveBeenCalled();
    });

    it('Telegram xabarni rad etsa — faqat log, xato tashlanmaydi', async () => {
      const { cabinet, telegram, logger } = setup({ staff: [DOSTON_ROW] });
      telegram.sendMessage.mockRejectedValue(new Error('403: Forbidden'));

      await expect(cabinet.sendCabinetButton(CHAT)).resolves.toBe(false);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('403: Forbidden'),
      );
    });
  });

  describe('syncButtons (server ishga tushganda)', () => {
    it("bog'langan har bir xodim chatiga o'z portalining «Kabinet» tugmasi", async () => {
      const { cabinet, prisma, telegram } = setup({
        staff: [
          { ...DOSTON_ROW, telegramChatId: CHAT },
          { id: 30402, roles: [{ roleId: 3 }], telegramChatId: '700000002' },
        ],
      });

      await expect(cabinet.syncButtons()).resolves.toBe(2);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ...signInStaffWhere(), telegramChatId: { not: null } },
        }),
      );
      expect(telegram.setChatMenuButton).toHaveBeenCalledWith({
        chatId: Number(CHAT),
        menuButton: expect.objectContaining({ web_app: { url: LEHRER_URL } }),
      });
      expect(telegram.setChatMenuButton).toHaveBeenCalledWith({
        chatId: 700000002,
        menuButton: expect.objectContaining({ web_app: { url: ADMIN_URL } }),
      });
    });

    it('bir chatga ikki xodim hisobi — tegilmaydi (bot ham, Mini App ham rad etadi)', async () => {
      const { cabinet, telegram } = setup({
        staff: [
          { ...DOSTON_ROW, telegramChatId: CHAT },
          { id: 30402, roles: [{ roleId: 4 }], telegramChatId: CHAT },
        ],
      });

      await expect(cabinet.syncButtons()).resolves.toBe(0);

      expect(telegram.setChatMenuButton).not.toHaveBeenCalled();
    });

    it('Mini App sozlanmagan — hech narsa: prod tokenli lokal server prod tugmalariga tegmaydi', async () => {
      const { cabinet, prisma, telegram } = setup({
        staff: [{ ...DOSTON_ROW, telegramChatId: CHAT }],
        studentUrl: null,
      });

      await expect(cabinet.syncButtons()).resolves.toBe(0);

      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(telegram.setChatMenuButton).not.toHaveBeenCalled();
    });
  });

  it('showMenuForChat — xodim chatida menyu, boshqasida `false`', async () => {
    const staff = setup({ staff: [DOSTON_ROW] });
    await expect(staff.cabinet.showMenuForChat(ctxIn())).resolves.toBe(true);

    const other = setup({ staff: [] });
    const ctx = ctxIn();
    await expect(other.cabinet.showMenuForChat(ctx)).resolves.toBe(false);
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
