import { Composer, Context } from 'telegraf';
import { LessonRatingTelegramHandler } from './lesson-rating-telegram.handler';

// Registration before the scenes (ADR-0078 path): lr:* to onAction, the rest to next().

const RATING = '0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10';

const callback = (data: string): Context =>
  new Context(
    {
      update_id: 1,
      callback_query: {
        id: 'q',
        from: { id: 700, is_bot: false, first_name: 'A' },
        chat_instance: 'c',
        data,
      },
    } as never,
    {} as never,
    { username: 'bot' } as never,
  ) as never;

function setup(bot: object | null = {}) {
  const telegram = {
    getBot: () => bot,
    useBeforeScenes: jest.fn<void, [Composer<Context>]>(),
  };
  const findFirst = jest.fn();
  const findUnique = jest.fn();
  const prisma = { lessonRating: { findFirst, findUnique } };
  const handler = new LessonRatingTelegramHandler(
    prisma as never,
    telegram as never,
  );
  return { handler, telegram, findFirst, findUnique };
}

describe('LessonRatingTelegramHandler — registration (before the scenes)', () => {
  it('registers one middleware when the bot exists', () => {
    const { handler, telegram } = setup();
    handler.onApplicationBootstrap();
    expect(telegram.useBeforeScenes).toHaveBeenCalledTimes(1);
  });

  it('registers nothing without a bot and does not throw', () => {
    const { handler, telegram } = setup(null);
    expect(() => handler.onApplicationBootstrap()).not.toThrow();
    expect(telegram.useBeforeScenes).not.toHaveBeenCalled();
  });

  it('lr:* reaches onAction, other callbacks go to next()', async () => {
    const { handler, telegram } = setup();
    const onAction = jest
      .spyOn(handler, 'onAction')
      .mockResolvedValue(undefined);
    handler.onApplicationBootstrap();
    const mw = Composer.unwrap(telegram.useBeforeScenes.mock.calls[0][0]);

    const next = jest.fn().mockResolvedValue(undefined);
    await mw(callback(`lr:${RATING}:5`), next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    await mw(callback('tk:list'), next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('a plain text message that is not a reply calls next() without touching prisma', async () => {
    const { handler, telegram, findFirst, findUnique } = setup();
    handler.onApplicationBootstrap();
    const mw = Composer.unwrap(telegram.useBeforeScenes.mock.calls[0][0]);
    const ctx = new Context(
      {
        update_id: 2,
        message: {
          message_id: 11,
          date: 1,
          chat: { id: 700, type: 'private' },
          from: { id: 700, is_bot: false, first_name: 'A' },
          text: 'salom',
        },
      } as never,
      {} as never,
      { username: 'bot' } as never,
    ) as never;
    const next = jest.fn().mockResolvedValue(undefined);
    await mw(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
