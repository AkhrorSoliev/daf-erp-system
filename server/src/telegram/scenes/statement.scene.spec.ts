import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createStatementScene } from './statement.scene';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';
import { statementMessage } from '../flows/statement-flow';

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'test-bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe;

const CHAT = 555333;
const ME = 999;

const ALI = { id: 10001, firstName: 'Ali', lastName: 'Test', companyId: 1 };
const VALI = { id: 10002, firstName: 'Vali', lastName: 'Test', companyId: 1 };

function withCtx(update: Record<string, unknown>, session: any) {
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = session;
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  ctx.replyWithDocument = jest.fn().mockResolvedValue(undefined);
  ctx.answerCbQuery = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

const enterCtx = () =>
  withCtx(
    {
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: CHAT, type: 'private' },
        from: { id: ME, is_bot: false, first_name: 'A' },
        text: '/x',
      },
    },
    { step: 0, data: {}, processing: false },
  );

const contactCtx = (contact: Record<string, unknown>) =>
  withCtx(
    {
      update_id: 2,
      message: {
        message_id: 2,
        date: 0,
        chat: { id: CHAT, type: 'private' },
        from: { id: ME, is_bot: false, first_name: 'A' },
        contact,
      },
    },
    { step: 2, data: {}, processing: false },
  );

const pickCtx = (studentId: number, ids: number[]) =>
  withCtx(
    {
      update_id: 3,
      callback_query: {
        id: 'q',
        chat_instance: 'c',
        from: { id: ME, is_bot: false, first_name: 'A' },
        data: `stmt_pick:${studentId}`,
        message: {
          message_id: 3,
          date: 0,
          chat: { id: CHAT, type: 'private' },
          text: 'x',
        },
      },
    },
    { step: 1, data: { ids }, processing: false },
  );

const MODEL = { asOf: '2026-09-26', student: { id: ALI.id } } as any;

describe("statement scene (💳 To'lovlar)", () => {
  let prisma: any;
  let statements: { pdf: jest.Mock };
  let present: jest.Mock;

  beforeEach(() => {
    prisma = {
      student: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    statements = {
      pdf: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('%PDF'), model: MODEL }),
    };
    present = jest.fn().mockReturnValue({
      answer: {
        tone: 'debt',
        title: "Qarzingiz: 150 000 so'm",
        subtitle: 'sentabr darslari uchun 150 000',
      },
    });
  });

  const run = async (ctx: any) => {
    const scene = createStatementScene(prisma, statements as any, present);
    const enter = (scene as any).enterMiddleware();
    if (ctx.session.step === 0) await enter(ctx, async () => {});
    else await scene.middleware()(ctx, async () => {});
  };

  it('a chat linked to one student gets the answer and the PDF at once', async () => {
    prisma.student.findMany.mockResolvedValue([ALI]);
    const ctx = enterCtx();

    await run(ctx);

    expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject({
      telegramChatId: String(CHAT),
      deletedAt: null,
    });
    expect(statements.pdf).toHaveBeenCalledWith(ALI.id, ALI.companyId);
    expect(ctx.reply.mock.calls[0][0]).toContain("Qarzingiz: 150 000 so'm");
    expect(ctx.reply.mock.calls[0][0]).toContain(
      'sentabr darslari uchun 150 000',
    );
    const [doc] = ctx.replyWithDocument.mock.calls[0];
    expect(doc.filename).toBe('tolovlar-hisoboti-26-09-2026.pdf');
    expect(Buffer.isBuffer(doc.source)).toBe(true);
    expect(ctx.scene.leave).toHaveBeenCalled();
  });

  it('a chat linked to several students chooses by name first', async () => {
    prisma.student.findMany.mockResolvedValue([ALI, VALI]);
    const ctx = enterCtx();

    await run(ctx);

    expect(statements.pdf).not.toHaveBeenCalled();
    const markup = JSON.stringify(ctx.reply.mock.calls[0][1]);
    expect(markup).toContain(`stmt_pick:${ALI.id}`);
    expect(markup).toContain(`stmt_pick:${VALI.id}`);
    expect(markup).toContain('Ali Test');
    expect(ctx.session.step).toBe(1);
    expect(ctx.session.data.ids).toEqual([ALI.id, VALI.id]);
  });

  it('sends the chosen student after re-checking the chat link', async () => {
    prisma.student.findMany.mockResolvedValue([VALI]);
    const ctx = pickCtx(VALI.id, [ALI.id, VALI.id]);

    await run(ctx);

    expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject({
      id: VALI.id,
      telegramChatId: String(CHAT),
    });
    expect(statements.pdf).toHaveBeenCalledWith(VALI.id, VALI.companyId);
  });

  it('never sends a student the chat was not offered', async () => {
    const ctx = pickCtx(12345, [ALI.id, VALI.id]);

    await run(ctx);

    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(statements.pdf).not.toHaveBeenCalled();
  });

  it('never sends a student no longer linked to this chat', async () => {
    prisma.student.findMany.mockResolvedValue([]);
    const ctx = pickCtx(VALI.id, [ALI.id, VALI.id]);

    await run(ctx);

    expect(statements.pdf).not.toHaveBeenCalled();
  });

  it('an unlinked chat is asked for its phone number', async () => {
    prisma.student.findMany.mockResolvedValue([]);
    const ctx = enterCtx();

    await run(ctx);

    expect(ctx.session.step).toBe(2);
    expect(JSON.stringify(ctx.reply.mock.calls[0][1])).toContain(
      'request_contact',
    );
    expect(statements.pdf).not.toHaveBeenCalled();
  });

  it("links the chat by the sender's own number and sends the statement", async () => {
    prisma.student.findMany.mockResolvedValue([ALI]);
    const ctx = contactCtx({
      phone_number: '+998901234567',
      first_name: 'A',
      user_id: ME,
    });

    await run(ctx);

    expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject({
      phone: '901234567',
      deletedAt: null,
    });
    expect(prisma.student.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [ALI.id] } },
      data: { telegramChatId: String(CHAT) },
    });
    expect(statements.pdf).toHaveBeenCalledWith(ALI.id, ALI.companyId);
  });

  it("refuses someone else's contact card and links nothing", async () => {
    const ctx = contactCtx({
      phone_number: '+998901234567',
      first_name: 'A',
      user_id: 1,
    });

    await run(ctx);

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(prisma.student.updateMany).not.toHaveBeenCalled();
    expect(statements.pdf).not.toHaveBeenCalled();
  });

  it('a number no student has is told so, nothing is linked', async () => {
    prisma.student.findMany.mockResolvedValue([]);
    const ctx = contactCtx({
      phone_number: '+998901234567',
      first_name: 'A',
      user_id: ME,
    });

    await run(ctx);

    expect(prisma.student.updateMany).not.toHaveBeenCalled();
    expect(statements.pdf).not.toHaveBeenCalled();
    expect(ctx.scene.leave).toHaveBeenCalled();
  });
});

describe('statementMessage', () => {
  it('is the answer box: title, then the line under it', () => {
    expect(
      statementMessage({
        tone: 'credit',
        title: "Qarzingiz yo'q.",
        subtitle: "U oktabr to'loviga o'tadi.",
      }),
    ).toBe("💳 Qarzingiz yo'q.\nU oktabr to'loviga o'tadi.");
  });
});
