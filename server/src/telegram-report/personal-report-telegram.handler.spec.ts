import { PersonalReportTelegramHandler } from './personal-report-telegram.handler';

jest.mock('../tasks/telegram/task-telegram-view', () => ({
  staffOfChat: jest.fn(),
}));
import { staffOfChat } from '../tasks/telegram/task-telegram-view';

const REC = { id: 7, companyId: 1, userId: 50, isActive: true };

function ctxFor(data: string) {
  return {
    chat: { id: 777 },
    callbackQuery: { data, message: { message_id: 3 } },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({}),
    editMessageText: jest.fn().mockResolvedValue({}),
    editMessageReplyMarkup: jest.fn().mockResolvedValue({}),
  };
}

function setup() {
  const prisma = {
    telegramReportRecipient: { findFirst: jest.fn().mockResolvedValue(REC) },
  };
  const reports = {
    compose: jest.fn().mockResolvedValue({
      text: 'T',
      keyboard: { reply_markup: { inline_keyboard: [] } },
    }),
  };
  const handler = new PersonalReportTelegramHandler(
    prisma as never,
    { getBot: () => ({}) } as never,
    reports as never,
  );
  return { handler, prisma, reports };
}

describe('PersonalReportTelegramHandler', () => {
  beforeEach(() =>
    jest.mocked(staffOfChat).mockResolvedValue({
      kind: 'one',
      userId: 50,
      companyId: 1,
      roleIds: [1],
    }),
  );

  it('tr:open sends a new message with every branch', async () => {
    const { handler, reports } = setup();
    const ctx = ctxFor('tr:open');
    await handler.onAction(ctx as never);
    expect(reports.compose).toHaveBeenCalledWith(REC, 'all');
    expect(ctx.reply).toHaveBeenCalledWith(
      'T',
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it('a branch button edits the same message', async () => {
    const { handler, reports } = setup();
    const ctx = ctxFor('tr:b:2');
    await handler.onAction(ctx as never);
    expect(reports.compose).toHaveBeenCalledWith(REC, 2);
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      'T',
      expect.objectContaining({ parse_mode: 'HTML' }),
    );
  });

  it('a chat that is not a recipient gets a refusal and loses the buttons', async () => {
    const { handler, prisma } = setup();
    prisma.telegramReportRecipient.findFirst.mockResolvedValue(null);
    const ctx = ctxFor('tr:all');
    await handler.onAction(ctx as never);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      'Bu hisobot sizga ochiq emas',
    );
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled();
  });

  it('a chat with two staff accounts is refused', async () => {
    jest.mocked(staffOfChat).mockResolvedValue({ kind: 'several' });
    const { handler, prisma } = setup();
    const ctx = ctxFor('tr:all');
    await handler.onAction(ctx as never);
    expect(prisma.telegramReportRecipient.findFirst).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      'Bu hisobot sizga ochiq emas',
    );
  });

  it('a branch outside the allowed list is refused', async () => {
    const { handler, reports } = setup();
    reports.compose.mockResolvedValue(null);
    const ctx = ctxFor('tr:b:99');
    await handler.onAction(ctx as never);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
      'Bu hisobot sizga ochiq emas',
    );
  });

  it("«message is not modified» answers «O'zgarish yo'q»", async () => {
    const { handler } = setup();
    const ctx = ctxFor('tr:r:all');
    ctx.editMessageText.mockRejectedValue(
      Object.assign(new Error('Bad Request: message is not modified'), {
        response: {
          error_code: 400,
          description: 'Bad Request: message is not modified',
        },
      }),
    );
    await handler.onAction(ctx as never);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("O'zgarish yo'q");
  });

  it('a second tap while the first runs gets «Kuting…»', async () => {
    const { handler, reports } = setup();
    let release!: () => void;
    reports.compose.mockReturnValueOnce(
      new Promise((r) => (release = () => r({ text: 'T', keyboard: {} }))),
    );
    const first = handler.onAction(ctxFor('tr:all') as never);
    const ctx2 = ctxFor('tr:all');
    await handler.onAction(ctx2 as never);
    expect(ctx2.answerCbQuery).toHaveBeenCalledWith('Kuting…');
    release();
    await first;
  });
});
