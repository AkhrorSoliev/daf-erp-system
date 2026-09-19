import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createStudentRegistrationScene } from './student-registration.scene';
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

/** O'quvchi ro'yxati, telefon qadami (`step 5`). */
function buildContactCtx(
  contact: { phone_number: string; first_name: string; user_id?: number },
  fromId = 999,
) {
  const update = {
    update_id: 4,
    message: {
      message_id: 4,
      date: 0,
      chat: { id: 555444, type: 'private' },
      from: { id: fromId, is_bot: false, first_name: 'O' },
      contact,
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = {
    step: 5,
    data: { branchId: 7, teacherId: 10, groupId: 'g1' },
    processing: false,
  };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

describe('student-registration.scene — kontakt qadami', () => {
  const OWN = { phone_number: '+998901112233', first_name: 'O', user_id: 999 };
  let prisma: any;

  beforeEach(() => {
    prisma = { student: { findFirst: jest.fn().mockResolvedValue(null) } };
  });

  const buildScene = () =>
    createStudentRegistrationScene(
      prisma,
      { deleteFile: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it("begona karta rad etiladi, o'quvchi qidirilmaydi", async () => {
    const ctx = buildContactCtx({ ...OWN, user_id: 1 });

    await buildScene().middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
    expect(ctx.session.step).toBe(5);
  });

  it("user_id'siz karta rad etiladi", async () => {
    const ctx = buildContactCtx({
      phone_number: '+998901112233',
      first_name: 'O',
    });

    await buildScene().middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });

  it("o'z raqami qabul qilinadi va rasm so'raladi", async () => {
    const ctx = buildContactCtx(OWN);

    await buildScene().middleware()(ctx, async () => {});

    expect(prisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: '901112233', deletedAt: null },
      }),
    );
    expect(ctx.session.data.phone).toBe('901112233');
    expect(ctx.session.step).toBe(6);
  });
});
