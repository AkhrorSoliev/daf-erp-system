import { KEYINROQ, SIZGA_EMAS, TOXTATILDI } from './eslatma-matn';
import { EslatmaTelegramHandler } from './eslatma-telegram.handler';

function setup(student: unknown = { companyId: 1, telegramChatId: '555' }) {
  const prisma = {
    student: { findFirst: jest.fn().mockResolvedValue(student) },
    dafStudentSetting: {
      upsert: jest.fn().mockResolvedValue({ remindersEnabled: false }),
    },
  };
  const handler = new EslatmaTelegramHandler(prisma as never, {} as never);
  return { handler, prisma };
}

function ctx(data: string, chatId = 555, type = 'private') {
  return {
    chat: { id: chatId, type },
    callbackQuery: { data },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({ message_id: 1 }),
  };
}

describe('EslatmaTelegramHandler — «Eslatmalarni to`xtatish»', () => {
  it("o'z chati: o'chiradi, tugmani oladi, javob beradi", async () => {
    const { handler, prisma } = setup();
    const c = ctx('dr:off:10001');
    await handler.onAction(c as never);
    expect(prisma.student.findFirst).toHaveBeenCalledWith({
      where: { id: 10001, deletedAt: null },
      select: { companyId: true, telegramChatId: true },
    });
    expect(prisma.dafStudentSetting.upsert).toHaveBeenCalledWith({
      where: { studentId: 10001 },
      create: { studentId: 10001, companyId: 1, remindersEnabled: false },
      update: { remindersEnabled: false },
      select: { remindersEnabled: true },
    });
    expect(c.answerCbQuery).toHaveBeenCalledWith();
    expect(c.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(c.reply).toHaveBeenCalledWith(TOXTATILDI);
  });

  it("boshqa chat (ota-onaning boshqa bolasi ham) o'chira olmaydi", async () => {
    const { handler, prisma } = setup();
    const c = ctx('dr:off:10001', 999);
    await handler.onAction(c as never);
    expect(c.answerCbQuery).toHaveBeenCalledWith(SIZGA_EMAS);
    expect(prisma.dafStudentSetting.upsert).not.toHaveBeenCalled();
    expect(c.reply).not.toHaveBeenCalled();
    expect(c.editMessageReplyMarkup).not.toHaveBeenCalled();
  });

  it("o'chirilgan yoki topilmagan o'quvchi — «sizga emas»", async () => {
    const { handler, prisma } = setup(null);
    const c = ctx('dr:off:10001');
    await handler.onAction(c as never);
    expect(c.answerCbQuery).toHaveBeenCalledWith(SIZGA_EMAS);
    expect(prisma.dafStudentSetting.upsert).not.toHaveBeenCalled();
  });

  it("chat ulanmagan o'quvchi (telegramChatId null) — «sizga emas»", async () => {
    const { handler, prisma } = setup({ companyId: 1, telegramChatId: null });
    const c = ctx('dr:off:10001');
    await handler.onAction(c as never);
    expect(c.answerCbQuery).toHaveBeenCalledWith(SIZGA_EMAS);
    expect(prisma.dafStudentSetting.upsert).not.toHaveBeenCalled();
  });

  it("noto'g'ri tugma va guruh chati — jim, bazaga tegmaydi", async () => {
    const { handler, prisma } = setup();
    for (const c of [
      ctx('dr:off:0'),
      ctx('dr:off:abc'),
      ctx('dr:off:-5'),
      ctx('dr:off:99999999999'),
      ctx('dr:off:10001', -100, 'group'),
    ]) {
      await handler.onAction(c as never);
      expect(c.answerCbQuery).toHaveBeenCalledWith();
      expect(c.reply).not.toHaveBeenCalled();
    }
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
    expect(prisma.dafStudentSetting.upsert).not.toHaveBeenCalled();
  });

  it('baza xatosi — «keyinroq», yiqilmaydi', async () => {
    const { handler, prisma } = setup();
    prisma.student.findFirst.mockRejectedValueOnce(new Error('db down'));
    const c = ctx('dr:off:10001');
    await handler.onAction(c as never);
    expect(c.answerCbQuery).toHaveBeenCalledWith(KEYINROQ);
    expect(prisma.dafStudentSetting.upsert).not.toHaveBeenCalled();
  });

  it('yozuv xatosi ham yiqilmaydi; tugma olinmaydi (qayta bosish mumkin)', async () => {
    const { handler, prisma } = setup();
    prisma.dafStudentSetting.upsert.mockRejectedValueOnce(new Error('x'));
    const c = ctx('dr:off:10001');
    await expect(handler.onAction(c as never)).resolves.toBeUndefined();
    expect(c.answerCbQuery).toHaveBeenCalledWith(KEYINROQ);
    expect(c.editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(c.reply).not.toHaveBeenCalled();
  });

  it("tugma allaqachon olingan bo'lsa (Telegram xatosi) javob baribir ketadi", async () => {
    const { handler } = setup();
    const c = ctx('dr:off:10001');
    c.editMessageReplyMarkup.mockRejectedValueOnce(new Error('not modified'));
    await handler.onAction(c as never);
    expect(c.reply).toHaveBeenCalledWith(TOXTATILDI);
  });
});
