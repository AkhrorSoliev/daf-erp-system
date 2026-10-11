import { Composer, Context } from 'telegraf';
import { TaskTelegramHandler } from './task-telegram.handler';

// Registration before the scenes (spec §6.1). Split off
// task-telegram.handler.spec.ts, which is at the 500-line limit.

const TASK = '0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10';

let handler: TaskTelegramHandler;
let telegram: any;
let replies: any;

beforeEach(() => {
  telegram = { getBot: () => ({}), useBeforeScenes: jest.fn() };
  replies = { onMessage: jest.fn().mockResolvedValue(undefined) };
  handler = new TaskTelegramHandler(
    {} as any,
    {} as any,
    telegram,
    {} as any,
    replies,
  );
});

describe('TaskTelegramHandler — registration (before the scenes)', () => {
  const update = (data: string) =>
    new Context(
      {
        update_id: 1,
        callback_query: {
          id: 'q',
          from: { id: 700, is_bot: false, first_name: 'A' },
          chat_instance: 'c',
          data,
        },
      } as any,
      {} as any,
      { username: 'bot' } as any,
    ) as any;

  it('one composer through useBeforeScenes: tk:* to onAction, the rest to next()', async () => {
    const onAction = jest
      .spyOn(handler, 'onAction')
      .mockResolvedValue(undefined);
    handler.onApplicationBootstrap();
    expect(telegram.useBeforeScenes).toHaveBeenCalledTimes(1);
    const mw = Composer.unwrap(telegram.useBeforeScenes.mock.calls[0][0]);

    const next = jest.fn().mockResolvedValue(undefined);
    await mw(update(`tk:start:${TASK}`), next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    await mw(update('menu_password'), next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('the same composer hands messages to the replies', async () => {
    handler.onApplicationBootstrap();
    expect(telegram.useBeforeScenes).toHaveBeenCalledTimes(1);
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
      } as any,
      {} as any,
      { username: 'bot' } as any,
    ) as any;
    const next = jest.fn().mockResolvedValue(undefined);
    await mw(ctx, next);
    expect(replies.onMessage).toHaveBeenCalledTimes(1);
    expect(replies.onMessage).toHaveBeenCalledWith(ctx, expect.any(Function));
  });

  it('without a bot it registers nothing and does not throw', () => {
    const useBeforeScenes = jest.fn();
    const off = new TaskTelegramHandler(
      {} as any,
      {} as any,
      { getBot: () => undefined, useBeforeScenes } as any,
      {} as any,
      replies,
    );
    expect(() => off.onApplicationBootstrap()).not.toThrow();
    expect(useBeforeScenes).not.toHaveBeenCalled();
  });
});
