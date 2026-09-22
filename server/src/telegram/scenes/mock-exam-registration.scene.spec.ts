import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createMockExamRegistrationScene } from './mock-exam-registration.scene';
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
 * Mock imtihon formasi telefon maydonida turibdi. Bu sahna telefon bo'yicha
 * mavjud o'quvchini topib chatni unga BOG'LAYDI — ya'ni begona karta bilan
 * begona o'quvchining Telegram bog'lanishini egallab bo'lardi.
 */
function buildContactCtx(
  contact: { phone_number: string; first_name: string; user_id?: number },
  fromId = 999,
) {
  const update = {
    update_id: 5,
    message: {
      message_id: 5,
      date: 0,
      chat: { id: 555555, type: 'private' },
      from: { id: fromId, is_bot: false, first_name: 'M' },
      contact,
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = {
    step: 0,
    data: {
      examId: 'exam-1',
      fields: [
        {
          id: 'phone',
          type: 'phone',
          label: 'Telefon',
          required: true,
          mapsTo: 'phone',
        },
      ],
      currentFieldIndex: 0,
      answers: {},
    },
    processing: false,
  };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

describe('mock-exam-registration.scene — kontakt qadami', () => {
  it('begona karta rad etiladi, bazaga borilmaydi', async () => {
    const prisma = {
      student: { findFirst: jest.fn(), update: jest.fn() },
      mockExamParticipant: { findFirst: jest.fn(), create: jest.fn() },
    } as any;
    const scene = createMockExamRegistrationScene(prisma, {} as any, {} as any);
    const ctx = buildContactCtx({
      phone_number: '+998901112233',
      first_name: 'M',
      user_id: 1,
    });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it("user_id'siz karta rad etiladi", async () => {
    const prisma = {
      student: { findFirst: jest.fn(), update: jest.fn() },
      mockExamParticipant: { findFirst: jest.fn(), create: jest.fn() },
    } as any;
    const scene = createMockExamRegistrationScene(prisma, {} as any, {} as any);
    const ctx = buildContactCtx({
      phone_number: '+998901112233',
      first_name: 'M',
    });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });
});
