import { TelegramService } from './telegram.service';

/**
 * Kanal a'zoligi tasdiqlangandan KEYIN oqim davom etishi.
 *
 * REGRESSIYA: ilgari bu yerda `t.me/<bot>?start=<payload>` URL tugmasi
 * ko'rsatilardi. Foydalanuvchi allaqachon shu bot chatida turgani uchun
 * Telegram bunday havolani bosganda `/start` ni QAYTA YUBORMAYDI — tugma
 * jimgina hech nima qilmasdi va ro'yxatdan o'tish shu yerda to'xtab qolardi.
 *
 * Servisning DI grafi katta, shuning uchun (mavjud `telegram-webhook-secret`
 * testidagi kabi) yalang'och prototip nusxasida tekshiramiz.
 */
describe("TelegramService — a'zolikdan keyin oqimni davom ettirish", () => {
  const makeInstance = () => {
    const inst = Object.create(TelegramService.prototype) as any;
    inst.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    return inst;
  };

  const makeCtx = (payload?: string) => ({
    session: payload === undefined ? {} : { pendingStartPayload: payload },
    reply: jest.fn().mockResolvedValue(undefined),
  });

  it('saqlangan deep-link payloadi bilan oqimni qayta ishga tushiradi', async () => {
    const inst = makeInstance();
    inst.startFlow = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx('mock_abc123');

    await inst.resumeAfterJoin(ctx);

    expect(inst.startFlow).toHaveBeenCalledWith(ctx, 'mock_abc123');
    // Foydalanuvchidan hech narsa bosish so'ralmaydi.
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("payload bo'lmasa bo'sh satr bilan chaqiradi (asosiy menyu chiqadi)", async () => {
    const inst = makeInstance();
    inst.startFlow = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx();

    await inst.resumeAfterJoin(ctx);

    expect(inst.startFlow).toHaveBeenCalledWith(ctx, '');
  });

  it("oqim hali tayyor bo'lmasa foydalanuvchiga nima qilishni aytadi", async () => {
    const inst = makeInstance();
    inst.startFlow = undefined;
    const ctx = makeCtx('teacher_1001');

    await inst.resumeAfterJoin(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      'Davom etish uchun /start yuboring.',
    );
  });

  it("oqim xato bersa foydalanuvchi boshi berk ko'chada qolmaydi", async () => {
    const inst = makeInstance();
    inst.startFlow = jest.fn().mockRejectedValue(new Error('scene crashed'));
    const ctx = makeCtx('student_1001');

    await expect(inst.resumeAfterJoin(ctx)).resolves.toBeUndefined();

    expect(inst.logger.error).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      'Davom etish uchun /start yuboring.',
    );
  });
});

describe('TelegramService — isRequiredChannelChat', () => {
  const withChannel = (channel?: string) => {
    const inst = Object.create(TelegramService.prototype) as any;
    inst.requiredChannel = channel;
    return inst;
  };

  it('@username ni katta-kichik harfga qaramay taniydi', () => {
    const inst = withChannel('@daffergana');
    expect(
      inst.isRequiredChannelChat({ id: -100, username: 'DafFergana' }),
    ).toBe(true);
  });

  it('begona kanalni rad etadi', () => {
    const inst = withChannel('@daffergana');
    expect(inst.isRequiredChannelChat({ id: -100, username: 'boshqa' })).toBe(
      false,
    );
  });

  it("username'siz chatni rad etadi", () => {
    const inst = withChannel('@daffergana');
    expect(inst.isRequiredChannelChat({ id: -100 })).toBe(false);
  });

  it('raqamli chat id bilan ham ishlaydi', () => {
    const inst = withChannel('-1001234567890');
    expect(inst.isRequiredChannelChat({ id: -1001234567890 })).toBe(true);
  });

  it("gate o'chiq bo'lsa hech qachon mos kelmaydi", () => {
    const inst = withChannel(undefined);
    expect(
      inst.isRequiredChannelChat({ id: -100, username: 'daffergana' }),
    ).toBe(false);
  });
});
