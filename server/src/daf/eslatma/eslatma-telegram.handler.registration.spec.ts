import { Composer, Context } from 'telegraf';
import { EslatmaTelegramHandler } from './eslatma-telegram.handler';

// Registration before the scenes (ADR-0078 path): dr:off:* to onAction, the rest to next().

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
  const handler = new EslatmaTelegramHandler({} as never, telegram as never);
  return { handler, telegram };
}

describe('EslatmaTelegramHandler — registration (before the scenes)', () => {
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

  it('dr:off:* reaches onAction, other callbacks go to next()', async () => {
    const { handler, telegram } = setup();
    const onAction = jest
      .spyOn(handler, 'onAction')
      .mockResolvedValue(undefined);
    handler.onApplicationBootstrap();
    const mw = Composer.unwrap(telegram.useBeforeScenes.mock.calls[0][0]);
    const next = jest.fn().mockResolvedValue(undefined);

    await mw(callback('dr:off:10001'), next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    await mw(callback('lr:0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10:5'), next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
