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

/** A step that throws `error`, noting whether the lock was held when it ran. */
function failingStep(ctx: any, error: Error) {
  return jest.fn(async () => {
    ctx.lockHeldWhenFailed = ctx.session.processing;
    throw error;
  });
}

/** A tap on "✅ Ha, parolni tiklash" by a linked student (`step 1`). */
function buildConfirmCtx(studentId: number) {
  const update = {
    update_id: 4,
    callback_query: {
      id: 'cbq4',
      data: 'pwd_reset_confirm',
      from: { id: 999, is_bot: false, first_name: 'A' },
      message: {
        message_id: 4,
        date: 0,
        chat: { id: 555333, type: 'private' },
        text: 'Yangi parol yaratamizmi?',
      },
      chat_instance: 'x',
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = { step: 1, data: { studentId }, processing: false };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.answerCbQuery = jest.fn().mockResolvedValue(undefined);
  ctx.editMessageText = jest.fn().mockResolvedValue(undefined);
  ctx.reply = jest.fn().mockResolvedValue({ message_id: 5 });
  return ctx;
}

/**
 * `pwd_reset_confirm` holds `processing` while it works, and `/start` ignores
 * a chat whose flag is set. A step that threw with the flag set therefore shut
 * the person out of the bot until their 24-hour session expired.
 */
describe('password-reset.scene — a failed step releases the lock', () => {
  type Deps = {
    prisma: { student: { findFirst: jest.Mock } };
    redis: { ttl: jest.Mock; get: jest.Mock };
  };

  it.each<{
    what: string;
    fail: (ctx: any, deps: Deps, error: Error) => void;
  }>([
    {
      what: 'answering the button tap',
      fail: (ctx, _deps, error) => {
        ctx.answerCbQuery = failingStep(ctx, error);
      },
    },
    {
      what: 'the throttle check',
      fail: (ctx, deps, error) => {
        deps.redis.ttl = failingStep(ctx, error);
      },
    },
    {
      what: 'the student lookup',
      fail: (ctx, deps, error) => {
        deps.prisma.student.findFirst = failingStep(ctx, error);
      },
    },
  ])(
    'pwd_reset_confirm releases the lock when $what fails',
    async ({ fail }) => {
      const deps: Deps = {
        prisma: { student: { findFirst: jest.fn().mockResolvedValue(null) } },
        // No cooldown, nothing counted today: the throttle lets it through.
        redis: {
          ttl: jest.fn().mockResolvedValue(-2),
          get: jest.fn().mockResolvedValue(null),
        },
      };
      const ctx = buildConfirmCtx(12345);
      const error = new Error('Request failed');
      fail(ctx, deps, error);
      const scene = createPasswordResetScene(
        deps.prisma as any,
        deps.redis as any,
        {} as any,
        {} as any,
      );

      await expect(scene.middleware()(ctx, async () => {})).rejects.toBe(error);

      expect(ctx.lockHeldWhenFailed).toBe(true);
      expect(ctx.session.processing).toBe(false);
    },
  );
});
