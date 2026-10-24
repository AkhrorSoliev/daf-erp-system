import { Composer, Context } from 'telegraf';
import { PersonalReportTelegramHandler } from './personal-report-telegram.handler';

function setup(bot: object | null = {}) {
  const telegram = {
    getBot: () => bot,
    useBeforeScenes: jest.fn<void, [Composer<Context>]>(),
  };
  const handler = new PersonalReportTelegramHandler(
    {} as never,
    telegram as never,
    {} as never,
  );
  return { handler, telegram };
}

const callback = (data: string) =>
  new Context(
    {
      update_id: 1,
      callback_query: {
        id: 'q',
        from: { id: 5, is_bot: false, first_name: 'A' },
        chat_instance: 'c',
        data,
        message: {
          message_id: 3,
          date: 0,
          chat: { id: 777, type: 'private', first_name: 'A' },
        },
      },
    } as never,
    {} as never,
    { username: 'bot' } as never,
  );

describe('PersonalReportTelegramHandler registration', () => {
  it('registers one middleware when the bot exists', () => {
    const { handler, telegram } = setup();
    handler.onApplicationBootstrap();
    expect(telegram.useBeforeScenes).toHaveBeenCalledTimes(1);
  });

  it('registers nothing without a bot', () => {
    const { handler, telegram } = setup(null);
    handler.onApplicationBootstrap();
    expect(telegram.useBeforeScenes).not.toHaveBeenCalled();
  });

  it('tr:* reaches onAction, other callbacks go to next()', async () => {
    const { handler, telegram } = setup();
    const onAction = jest
      .spyOn(handler, 'onAction')
      .mockResolvedValue(undefined);
    handler.onApplicationBootstrap();
    const mw = Composer.unwrap(telegram.useBeforeScenes.mock.calls[0][0]);
    const next = jest.fn();
    await mw(callback('tr:all') as never, next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    await mw(callback('tk:list') as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
