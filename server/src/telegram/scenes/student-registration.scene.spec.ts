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

/** A step that throws `error`, noting whether the lock was held when it ran. */
function failingStep(ctx: any, error: Error) {
  return jest.fn(async () => {
    ctx.lockHeldWhenFailed = ctx.session.processing;
    throw error;
  });
}

/** A tap on an inline button while the scene is at `step`. */
function buildButtonCtx(
  action: string,
  step: number,
  sessionData: Record<string, any>,
) {
  const update = {
    update_id: 5,
    callback_query: {
      id: 'cbq5',
      data: action,
      from: { id: 999, is_bot: false, first_name: 'O' },
      message: {
        message_id: 5,
        date: 0,
        chat: { id: 555444, type: 'private' },
        caption: 'preview caption',
      },
      chat_instance: 'x',
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = { step, data: sessionData, processing: false };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.answerCbQuery = jest.fn().mockResolvedValue(undefined);
  ctx.editMessageCaption = jest.fn().mockResolvedValue(undefined);
  ctx.editMessageText = jest.fn().mockResolvedValue(undefined);
  ctx.sendChatAction = jest.fn().mockResolvedValue(undefined);
  ctx.replyWithPhoto = jest.fn().mockResolvedValue(undefined);
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

/**
 * Choosing a teacher, confirming and starting over hold `processing` while
 * they work, and every handler of this scene ignores a chat whose flag is set,
 * as does `/start`. A step that threw with the flag set therefore left the
 * person unable to go on or start over until their 24-hour session expired.
 */
describe('student-registration.scene — a failed step releases the lock', () => {
  const DATA = {
    branchId: 7,
    teacherId: 10010,
    teacherName: 'Aziz Qodirov',
    groupId: 'g1',
    groupName: 'A1-07',
    firstName: 'Akmal',
    lastName: 'Karimov',
    phone: '901112233',
    photo: 'https://example.com/photo.jpg',
  };

  type Deps = {
    prisma: {
      user: { findFirst: jest.Mock };
      group: { findMany: jest.Mock };
    };
    uploadService: { deleteFile: jest.Mock };
  };

  it.each<{
    action: string;
    step: number;
    what: string;
    fail: (ctx: any, deps: Deps, error: Error) => void;
  }>([
    {
      action: 'select_teacher_10010',
      step: 1,
      what: 'answering the button tap',
      fail: (ctx, _deps, error) => {
        ctx.answerCbQuery = failingStep(ctx, error);
      },
    },
    {
      action: 'select_teacher_10010',
      step: 1,
      what: 'the typing notice',
      fail: (ctx, _deps, error) => {
        ctx.sendChatAction = failingStep(ctx, error);
      },
    },
    {
      action: 'select_teacher_10010',
      step: 1,
      what: 'the teacher lookup',
      fail: (ctx, deps, error) => {
        deps.prisma.user.findFirst = failingStep(ctx, error);
      },
    },
    {
      action: 'select_teacher_10010',
      step: 1,
      what: 'the group lookup',
      fail: (ctx, deps, error) => {
        deps.prisma.group.findMany = failingStep(ctx, error);
      },
    },
    {
      action: 'confirm_student',
      step: 7,
      what: 'answering the button tap',
      fail: (ctx, _deps, error) => {
        ctx.answerCbQuery = failingStep(ctx, error);
      },
    },
    {
      action: 'confirm_student',
      step: 7,
      what: 'the typing notice',
      fail: (ctx, _deps, error) => {
        ctx.sendChatAction = failingStep(ctx, error);
      },
    },
    {
      action: 'restart_student',
      step: 7,
      what: 'answering the button tap',
      fail: (ctx, _deps, error) => {
        ctx.answerCbQuery = failingStep(ctx, error);
      },
    },
    {
      action: 'restart_student',
      step: 7,
      what: 'deleting the uploaded photo',
      fail: (ctx, deps, error) => {
        deps.uploadService.deleteFile = failingStep(ctx, error);
      },
    },
  ])(
    '$action releases the lock when $what fails',
    async ({ action, step, fail }) => {
      const deps: Deps = {
        prisma: {
          user: {
            findFirst: jest.fn().mockResolvedValue({
              id: 10010,
              firstName: 'Aziz',
              lastName: 'Qodirov',
            }),
          },
          group: { findMany: jest.fn().mockResolvedValue([]) },
        },
        uploadService: { deleteFile: jest.fn().mockResolvedValue(undefined) },
      };
      const ctx = buildButtonCtx(action, step, { ...DATA });
      const error = new Error('Request failed');
      fail(ctx, deps, error);
      const scene = createStudentRegistrationScene(
        deps.prisma as any,
        deps.uploadService as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(scene.middleware()(ctx, async () => {})).rejects.toBe(error);

      expect(ctx.lockHeldWhenFailed).toBe(true);
      expect(ctx.session.processing).toBe(false);
    },
  );
});
