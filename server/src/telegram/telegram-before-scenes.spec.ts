import { Logger } from '@nestjs/common';
import { Scenes, Telegraf } from 'telegraf';
import type { BotContext } from './types/context';
import { TelegramService } from './telegram.service';

/**
 * `useBeforeScenes`: another module's handler sees an update after the
 * session, the `/start` reset and the channel gate, but BEFORE the scenes. An
 * open scene (registration, password reset …) answers every update itself, so
 * a task button pressed in such a chat would otherwise never arrive.
 */
describe('TelegramService — useBeforeScenes', () => {
  let order: string[];
  let bot: Telegraf<BotContext>;
  let service: TelegramService;

  const press = (data: string) => ({
    update_id: 1,
    callback_query: {
      id: 'q',
      from: { id: 700, is_bot: false, first_name: 'A' },
      chat_instance: 'c',
      data,
      message: {
        message_id: 5,
        date: 0,
        chat: { id: 700, type: 'private', first_name: 'A' },
        text: 'x',
      },
    },
  });

  beforeEach(async () => {
    order = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Telegraf.prototype, 'launch').mockResolvedValue(undefined);
    // The stage stands in for every scene: whatever reaches it is too late.
    jest
      .spyOn(Scenes.Stage.prototype, 'middleware')
      .mockReturnValue((_ctx, next) => {
        order.push('stage');
        return next();
      });
    const config = {
      get: (key: string) =>
        key === 'TELEGRAM_BOT_TOKEN' ? '123:test' : undefined,
    };
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const none = {} as any;
    service = new TelegramService(
      config as any,
      redis as any,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      { emit: jest.fn() } as any,
    );
    await service.onModuleInit();
    bot = service.getBot();
    bot.botInfo = {
      id: 1,
      is_bot: true,
      first_name: 'Bot',
      username: 'test_bot',
      can_join_groups: false,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    };
    bot.use(() => {
      order.push('tail');
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('runs a slot registered after boot ahead of the scenes; a slot that answers stops the update there', async () => {
    service.useBeforeScenes((ctx, next) => {
      order.push('slot');
      const q = ctx.callbackQuery;
      return q && 'data' in q && q.data.startsWith('tk:') ? undefined : next();
    });

    await bot.handleUpdate(press('tk:start:1') as any);
    expect(order).toEqual(['slot']);
  });

  it('an update the slot does not take reaches the next middleware untouched', async () => {
    service.useBeforeScenes((_ctx, next) => {
      order.push('slot');
      return next();
    });

    await bot.handleUpdate(press('zz:other') as any);
    expect(order).toEqual(['slot', 'stage', 'tail']);
  });

  it('with no slot registered the chain is unchanged', async () => {
    await bot.handleUpdate(press('zz:other') as any);
    expect(order).toEqual(['stage', 'tail']);
  });
});
