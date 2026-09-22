import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createPasswordResetScene } from './password-reset.scene';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'test-bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe;

/**
 * Bog'lanmagan o'quvchi (`step 2`) kontakt yuboradi. Ilgari `user_id`siz
 * karta o'tib ketardi — ya'ni begona raqam yozilgan karta bilan boshqa
 * o'quvchining hisobini o'ziga bog'lab, parolini olib bo'lardi.
 */
function buildContactCtx(
  contact: { phone_number: string; first_name: string; user_id?: number },
  fromId = 999,
) {
  const update = {
    update_id: 3,
    message: {
      message_id: 3,
      date: 0,
      chat: { id: 555333, type: 'private' },
      from: { id: fromId, is_bot: false, first_name: 'A' },
      contact,
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = { step: 2, data: {}, processing: false };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

describe("password-reset.scene — kontakt orqali bog'lanish", () => {
  const OWN = { phone_number: '+998901234567', first_name: 'A', user_id: 999 };
  let prisma: any;

  beforeEach(() => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: 12345,
          firstName: 'Akmal',
          lastName: 'Karimov',
          phone: '901234567',
          userId: 99001,
          companyId: 1001,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
  });

  const buildScene = () =>
    createPasswordResetScene(prisma, {} as any, {} as any, {} as any);

  it("begona karta (boshqa user_id) hech qanday hisobga bog'lanmaydi", async () => {
    const ctx = buildContactCtx({ ...OWN, user_id: 1 });

    await buildScene().middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
    expect(prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.session.step).toBe(2);
  });

  it("user_id'siz karta ham bog'lanmaydi — ilgari shu teshik ochiq edi", async () => {
    const ctx = buildContactCtx({
      phone_number: '+998901234567',
      first_name: 'A',
    });

    await buildScene().middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it("o'z raqami bilan hisob topiladi va chat unga bog'lanadi", async () => {
    const ctx = buildContactCtx(OWN);

    await buildScene().middleware()(ctx, async () => {});

    expect(prisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: '901234567', deletedAt: null },
      }),
    );
    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: 12345 },
      data: { telegramChatId: '555333' },
    });
    expect(ctx.session.step).toBe(1);
    expect(ctx.session.data.studentId).toBe(12345);
  });
});
