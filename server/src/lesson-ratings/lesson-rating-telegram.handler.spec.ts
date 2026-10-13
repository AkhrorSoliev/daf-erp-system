import { CONFETTI_EFFECT_ID } from './rating-rules';
import { LessonRatingTelegramHandler } from './lesson-rating-telegram.handler';

const ID = '11111111-2222-3333-4444-555555555555';
const SENT = new Date('2026-10-12T05:20:00Z');
const NOW = new Date('2026-10-12T06:00:00Z');

function setup(row: Record<string, unknown> | null, updated = 1) {
  const prisma = {
    lessonRating: {
      findUnique: jest.fn().mockResolvedValue(row),
      findFirst: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn().mockResolvedValue({ count: updated }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const handler = new LessonRatingTelegramHandler(prisma as never, {} as never);
  return { handler, prisma };
}

function actionCtx(data: string, chatId = 555) {
  return {
    chat: { id: chatId, type: 'private' },
    callbackQuery: { data },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    editMessageText: jest.fn().mockResolvedValue(true),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({ message_id: 900 }),
  };
}

function replyCtx(text: string, replyTo: number, chatId = 555) {
  return {
    chat: { id: chatId, type: 'private' },
    message: { text, reply_to_message: { message_id: replyTo } },
    reply: jest.fn().mockResolvedValue({ message_id: 901 }),
  };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  chatId: '555',
  sentAt: SENT,
  score: null,
  comment: null,
  ...over,
});

describe('LessonRatingTelegramHandler — buttons', () => {
  it('saves a 5 once and thanks without asking why', async () => {
    const { handler, prisma } = setup(row());
    const ctx = actionCtx(`lr:${ID}:5`);
    await handler.onAction(ctx as never, NOW);
    expect(prisma.lessonRating.updateMany).toHaveBeenCalledWith({
      where: { id: ID, score: null },
      data: { score: 5, ratedAt: NOW },
    });
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith("Rahmat! Siz 5 ⭐ qo'ydingiz.", {
      message_effect_id: CONFETTI_EFFECT_ID,
    });
  });

  it('still thanks without the effect when Telegram refuses it', async () => {
    const { handler } = setup(row());
    const ctx = actionCtx(`lr:${ID}:4`);
    ctx.reply.mockRejectedValueOnce(new Error('EFFECT_ID_INVALID'));
    await handler.onAction(ctx as never, NOW);
    expect(ctx.reply).toHaveBeenCalledTimes(2);
    expect(ctx.reply).toHaveBeenLastCalledWith("Rahmat! Siz 4 ⭐ qo'ydingiz.");
  });

  it('asks why after a 2 and remembers the prompt', async () => {
    const { handler, prisma } = setup(row());
    const ctx = actionCtx(`lr:${ID}:2`);
    await handler.onAction(ctx as never, NOW);
    expect(ctx.reply).toHaveBeenCalledWith("Rahmat! Siz 2 ⭐ qo'ydingiz.", {
      message_effect_id: CONFETTI_EFFECT_ID,
    });
    expect(ctx.reply).toHaveBeenCalledWith(
      'Nima yoqmadi? Shu xabarga javob qilib yozing (ixtiyoriy).',
      { reply_markup: { force_reply: true } },
    );
    expect(prisma.lessonRating.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { promptMessageId: 900 },
    });
  });

  it("refuses another chat's button", async () => {
    const { handler, prisma } = setup(row());
    const ctx = actionCtx(`lr:${ID}:4`, 999);
    await handler.onAction(ctx as never, NOW);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("Bu so'rov sizga emas");
    expect(prisma.lessonRating.updateMany).not.toHaveBeenCalled();
  });

  it('refuses after 48 hours and takes the buttons away', async () => {
    const { handler, prisma } = setup(
      row({ sentAt: new Date('2026-10-09T00:00:00Z') }),
    );
    const ctx = actionCtx(`lr:${ID}:4`);
    await handler.onAction(ctx as never, NOW);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      "Baho berish muddati o'tgan",
    );
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(prisma.lessonRating.updateMany).not.toHaveBeenCalled();
  });

  it('keeps the first score on a second press', async () => {
    const { handler } = setup(row(), 0);
    const ctx = actionCtx(`lr:${ID}:1`);
    await handler.onAction(ctx as never, NOW);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      'Siz allaqachon baho bergansiz',
    );
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});

describe('LessonRatingTelegramHandler — comment', () => {
  it('saves a reply to the prompt as the comment', async () => {
    const { handler, prisma } = setup(row({ score: 2 }));
    const ctx = replyCtx('  Ustoz kech qoldi ', 900);
    const next = jest.fn();
    await handler.onMessage(ctx as never, next, NOW);
    expect(prisma.lessonRating.findFirst).toHaveBeenCalledWith({
      where: { chatId: '555', promptMessageId: 900 },
      select: { id: true, sentAt: true, comment: true },
    });
    expect(prisma.lessonRating.updateMany).toHaveBeenCalledWith({
      where: { id: ID, comment: null },
      data: { comment: 'Ustoz kech qoldi', commentedAt: NOW },
    });
    expect(ctx.reply).toHaveBeenCalledWith('Rahmat, fikringiz yetkazildi.');
    expect(next).not.toHaveBeenCalled();
  });

  it('passes on a reply that is not to a prompt', async () => {
    const { handler } = setup(null);
    const next = jest.fn();
    await handler.onMessage(replyCtx('salom', 123) as never, next, NOW);
    expect(next).toHaveBeenCalled();
  });

  it('passes on a command', async () => {
    const { handler, prisma } = setup(row());
    const next = jest.fn();
    await handler.onMessage(replyCtx('/start', 900) as never, next, NOW);
    expect(next).toHaveBeenCalled();
    expect(prisma.lessonRating.findFirst).not.toHaveBeenCalled();
  });

  it('keeps the first comment', async () => {
    const { handler } = setup(row({ comment: 'birinchi' }));
    const ctx = replyCtx('ikkinchi', 900);
    await handler.onMessage(ctx as never, jest.fn(), NOW);
    expect(ctx.reply).toHaveBeenCalledWith('Fikringiz allaqachon yozilgan.');
  });
});
