import {
  MINI_APP_MENU_BUTTON_TEXT,
  PLATFORM_BUTTON_TEXT,
  answerPlatformMenu,
  installMiniAppMenuButton,
  platformButton,
  setChatCabinetButton,
} from './mini-app';

const MINI_APP_URL = 'https://student.dafzentrum.uz/tg';

describe('platformButton', () => {
  it("Mini App sozlangan va chat shaxsiy bo'lsa — Mini App'ni ochadi", () => {
    expect(platformButton(MINI_APP_URL, 'private')).toEqual(
      expect.objectContaining({
        text: PLATFORM_BUTTON_TEXT,
        web_app: { url: MINI_APP_URL },
      }),
    );
  });

  it.each(['group', 'supergroup', 'channel', undefined])(
    "chat %p da callback bo'lib qoladi — web_app u yerda butun xabarni yiqitardi",
    (chatType) => {
      expect(platformButton(MINI_APP_URL, chatType)).toEqual(
        expect.objectContaining({ callback_data: 'menu_platform' }),
      );
    },
  );

  it("Mini App sozlanmagan bo'lsa — avvalgi callback", () => {
    expect(platformButton(undefined, 'private')).toEqual(
      expect.objectContaining({
        text: PLATFORM_BUTTON_TEXT,
        callback_data: 'menu_platform',
      }),
    );
  });
});

describe('answerPlatformMenu', () => {
  function ctxIn(chatType: string) {
    return {
      chat: { id: 700000001, type: chatType },
      answerCbQuery: jest.fn().mockResolvedValue(true),
      reply: jest.fn().mockResolvedValue(undefined),
    } as any;
  }

  it('eski menyudagi tugmaga Mini App ochadigan tugma bilan javob beradi', async () => {
    const ctx = ctxIn('private');

    await answerPlatformMenu(ctx, MINI_APP_URL);

    expect(ctx.answerCbQuery).toHaveBeenCalledWith();
    const [, extra] = ctx.reply.mock.calls[0];
    expect(extra.reply_markup.inline_keyboard).toEqual([
      [expect.objectContaining({ web_app: { url: MINI_APP_URL } })],
    ]);
  });

  it("Mini App sozlanmagan bo'lsa — «tez kunda», xabar yuborilmaydi", async () => {
    const ctx = ctxIn('private');

    await answerPlatformMenu(ctx, undefined);

    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      expect.stringContaining('tez kunda'),
      { show_alert: true },
    );
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('guruhda web_app tugma yubormaydi', async () => {
    const ctx = ctxIn('group');

    await answerPlatformMenu(ctx, MINI_APP_URL);

    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe('installMiniAppMenuButton', () => {
  const logger = () => ({ log: jest.fn(), warn: jest.fn() });

  it("manzil bo'lsa standart menyu tugmasini Mini App'ga o'rnatadi", async () => {
    const telegram = { setChatMenuButton: jest.fn().mockResolvedValue(true) };

    await installMiniAppMenuButton(telegram as any, MINI_APP_URL, logger());

    expect(telegram.setChatMenuButton).toHaveBeenCalledWith({
      menuButton: {
        type: 'web_app',
        text: MINI_APP_MENU_BUTTON_TEXT,
        web_app: { url: MINI_APP_URL },
      },
    });
  });

  it("manzil bo'lmasa Telegram'ga umuman murojaat qilmaydi (prod menyusini tozalamaydi)", async () => {
    const telegram = { setChatMenuButton: jest.fn() };

    await installMiniAppMenuButton(telegram as any, undefined, logger());

    expect(telegram.setChatMenuButton).not.toHaveBeenCalled();
  });

  it('Telegram rad etsa ogohlantiradi, lekin botni yiqitmaydi', async () => {
    const telegram = {
      setChatMenuButton: jest
        .fn()
        .mockRejectedValue(new Error('Bad Request: invalid url')),
    };
    const log = logger();

    await expect(
      installMiniAppMenuButton(telegram as any, MINI_APP_URL, log),
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('invalid url'),
    );
  });
});

describe('setChatCabinetButton (ADR-0045)', () => {
  const STAFF_URL = 'https://lehrer.dafzentrum.uz/tg';

  it("manzil berilsa — shu chatning «Kabinet» tugmasi o'sha Mini App'ni ochadi", async () => {
    const telegram = { setChatMenuButton: jest.fn().mockResolvedValue(true) };

    await setChatCabinetButton(telegram, '700000001', STAFF_URL, {
      warn: jest.fn(),
    });

    expect(telegram.setChatMenuButton).toHaveBeenCalledWith({
      chatId: 700000001,
      menuButton: {
        type: 'web_app',
        text: MINI_APP_MENU_BUTTON_TEXT,
        web_app: { url: STAFF_URL },
      },
    });
  });

  it("manzil berilmasa — botning standart tugmasiga (o'quvchi kabineti) qaytaradi", async () => {
    const telegram = { setChatMenuButton: jest.fn().mockResolvedValue(true) };

    await setChatCabinetButton(telegram, '700000001', undefined, {
      warn: jest.fn(),
    });

    expect(telegram.setChatMenuButton).toHaveBeenCalledWith({
      chatId: 700000001,
      menuButton: { type: 'default' },
    });
  });

  it('Telegram rad etsa — faqat log, xato otilmaydi', async () => {
    const telegram = {
      setChatMenuButton: jest
        .fn()
        .mockRejectedValue(new Error('Bad Request: chat not found')),
    };
    const logger = { warn: jest.fn() };

    await expect(
      setChatCabinetButton(telegram, '700000001', STAFF_URL, logger),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('chat not found'),
    );
  });
});
