import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createTeacherRegistrationScene } from './teacher-registration.scene';

// Telegraf's Context requires the bot's own identity. These tests never read
// it, but `undefined` is not what the constructor accepts and the cast that
// hid that also hid any real mismatch.
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
 * `confirm_registration` is the ONE place a Telegram-registered teacher
 * becomes a `UsersService.create` call. Task 3 made `position` required on
 * that call — before this test existed, the scene had no test suite at all,
 * so nothing could have caught that the create() call started throwing
 * "Lavozim ko'rsatilishi shart" for every bot registration.
 *
 * We invoke the scene's real middleware stack against a genuine Telegraf
 * `Context` (Composer.compose asserts `instanceof Context`, so a plain object
 * ctx is rejected) built from a hand-crafted `callback_query` update, rather
 * than mocking the scene away — a future edit to the confirm handler is
 * exercised for real, not just re-asserted against itself.
 */
function buildConfirmCtx(sessionData: Record<string, any>) {
  const update = {
    update_id: 1,
    callback_query: {
      id: 'cbq1',
      data: 'confirm_registration',
      from: { id: 999, is_bot: false, first_name: 'T' },
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 555111, type: 'private' },
        caption: 'preview caption',
      },
      chat_instance: 'x',
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = { step: 6, data: sessionData, processing: false };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.answerCbQuery = jest.fn().mockResolvedValue(undefined);
  ctx.editMessageCaption = jest.fn().mockResolvedValue(undefined);
  ctx.sendChatAction = jest.fn().mockResolvedValue(undefined);
  ctx.replyWithPhoto = jest.fn().mockResolvedValue(undefined);
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

describe('teacher-registration.scene — confirm_registration', () => {
  it('creates the user with position "O\'qituvchi"', async () => {
    const usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const scene = createTeacherRegistrationScene(
      {} as any, // prisma — unused on this path
      { deleteFile: jest.fn() } as any,
      usersService as any,
      {} as any, // bot — unused (`_bot`)
    );

    const ctx = buildConfirmCtx({
      firstName: 'Aziz',
      lastName: 'Qodirov',
      phone: '901234567',
      gender: 'MALE',
      photo: 'https://example.com/photo.jpg',
      branchId: 7,
    });

    await scene.middleware()(ctx, async () => {});

    expect(usersService.create).toHaveBeenCalledTimes(1);
    const payload = usersService.create.mock.calls[0][0];
    expect(payload.position).toBe("O'qituvchi");
    expect(payload.roleIds).toEqual([4]);
    expect(payload.login).toBe('901234567');
    expect(typeof payload.password).toBe('string');
    expect(usersService.create.mock.calls[0][1]).toEqual({
      kind: 'self-registration',
    });
  });
});
