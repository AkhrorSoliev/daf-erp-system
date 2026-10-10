import { Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createStudentRegistrationScene } from './student-registration.scene';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';
import * as download from '../utils/download.util';

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

/** A photo sent at the photo step (`step 6`), sharing `session` across sends. */
function buildPhotoCtx(session: Record<string, any>) {
  const update = {
    update_id: 6,
    message: {
      message_id: 6,
      date: 0,
      chat: { id: 555444, type: 'private' },
      from: { id: 999, is_bot: false, first_name: 'O' },
      photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 9, height: 9 }],
    },
  };
  const telegram = {
    getFileLink: jest
      .fn()
      .mockResolvedValue(new URL('https://example.com/photo.jpg')),
  };
  const ctx = new Context(update as any, telegram as any, BOT_INFO) as any;
  ctx.session = session;
  ctx.sendChatAction = jest.fn().mockResolvedValue(undefined);
  ctx.replyWithPhoto = jest.fn().mockResolvedValue(undefined);
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

/**
 * The preview card after the photo is the only way on: its buttons are what
 * step 7 answers to. Telegram can refuse to send it (it cannot fetch the
 * uploaded file, a format it will not show as a photo, a network error), and
 * the person is then told to send the photo again — so they must still be at
 * the photo step, and the file nobody will confirm must not stay in storage.
 */
describe('student-registration.scene — tasdiqlash kartasi yuborilmasa', () => {
  const FIRST = 'https://r2.example.com/students/first.jpg';
  const SECOND = 'https://r2.example.com/students/second.jpg';
  let uploadService: { uploadFile: jest.Mock; deleteFile: jest.Mock };
  let session: any;
  let scene: ReturnType<typeof createStudentRegistrationScene>;

  beforeEach(() => {
    jest.spyOn(download, 'downloadFile').mockResolvedValue(Buffer.from('jpg'));
    uploadService = {
      uploadFile: jest
        .fn()
        .mockResolvedValueOnce(FIRST)
        .mockResolvedValueOnce(SECOND),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    session = {
      step: 6,
      data: {
        branchId: 7,
        teacherId: 10010,
        teacherName: 'Aziz Qodirov',
        groupId: 'g1',
        groupName: 'A1-07',
        firstName: 'Akmal',
        lastName: 'Karimov',
        phone: '901112233',
      },
      processing: false,
    };
    scene = createStudentRegistrationScene(
      {} as any,
      uploadService as any,
      {} as any,
      {} as any,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  async function sendPhoto({ previewFails }: { previewFails: boolean }) {
    const ctx = buildPhotoCtx(session);
    if (previewFails) {
      ctx.replyWithPhoto = jest
        .fn()
        .mockRejectedValue(
          new Error('400: Bad Request: failed to get HTTP URL content'),
        );
    }
    await scene.middleware()(ctx, async () => {});
    return ctx;
  }

  it('asks for the photo again and stays at the photo step', async () => {
    const ctx = await sendPhoto({ previewFails: true });

    expect(ctx.reply).toHaveBeenCalledWith(
      'Rasmni yuklashda xatolik yuz berdi. Qayta yuboring:',
    );
    expect(session.step).toBe(6);
  });

  it('deletes the photo it could not show instead of keeping it', async () => {
    await sendPhoto({ previewFails: true });

    expect(uploadService.deleteFile).toHaveBeenCalledWith(FIRST);
    expect(session.data.photo).toBeUndefined();
  });

  it('takes the photo sent again', async () => {
    await sendPhoto({ previewFails: true });
    const ctx = await sendPhoto({ previewFails: false });

    expect(uploadService.uploadFile).toHaveBeenCalledTimes(2);
    expect(ctx.replyWithPhoto).toHaveBeenCalledWith(
      SECOND,
      expect.objectContaining({ caption: expect.stringContaining('Akmal') }),
    );
    expect(session.step).toBe(7);
    expect(session.data.photo).toBe(SECOND);
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
      );

      await expect(scene.middleware()(ctx, async () => {})).rejects.toBe(error);

      expect(ctx.lockHeldWhenFailed).toBe(true);
      expect(ctx.session.processing).toBe(false);
    },
  );
});

/**
 * The photo step (`step 6`). A download that fails (Telegram unreachable, an
 * error page instead of the file) must leave the person at this step with a
 * reply, so sending the photo again works, and must reach the log.
 */
describe('student-registration.scene — rasm yuklanmasa', () => {
  afterEach(() => jest.restoreAllMocks());

  it('replies, keeps the photo step and logs the reason', async () => {
    jest
      .spyOn(download, 'downloadFile')
      .mockRejectedValue(new Error('File download failed: HTTP 404'));
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const uploadService = { uploadFile: jest.fn(), deleteFile: jest.fn() };
    const telegram = {
      getFileLink: jest
        .fn()
        .mockResolvedValue(new URL('https://example.com/photo.jpg')),
    };
    const update = {
      update_id: 6,
      message: {
        message_id: 6,
        date: 0,
        chat: { id: 555444, type: 'private' },
        from: { id: 999, is_bot: false, first_name: 'O' },
        photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 9, height: 9 }],
      },
    };
    const ctx = new Context(update as any, telegram as any, BOT_INFO) as any;
    ctx.session = {
      step: 6,
      data: { branchId: 7, teacherId: 10, groupId: 'g1', phone: '901112233' },
      processing: false,
    };
    ctx.sendChatAction = jest.fn().mockResolvedValue(undefined);
    ctx.reply = jest.fn().mockResolvedValue(undefined);
    const scene = createStudentRegistrationScene(
      {} as any,
      uploadService as any,
      {} as any,
      {} as any,
    );

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply).toHaveBeenCalledWith(
      'Rasmni yuklashda xatolik yuz berdi. Qayta yuboring:',
    );
    expect(ctx.session.step).toBe(6);
    expect(uploadService.uploadFile).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 404'));
  });
});

/**
 * The branch link lets the person pick a teacher and a group (ADR-0080): only
 * a live teacher and a group that takes students may be offered.
 */
describe('student-registration.scene — what the branch link offers', () => {
  it('lists only groups that take students when a teacher is picked', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10010,
          firstName: 'Aziz',
          lastName: 'Qodirov',
        }),
        // No groups: the scene lists the teachers again.
        findMany: jest.fn().mockResolvedValue([]),
      },
      group: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const ctx = buildButtonCtx('select_teacher_10010', 1, { branchId: 7 });
    const scene = createStudentRegistrationScene(
      prisma as any,
      { deleteFile: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await scene.middleware()(ctx, async () => {});

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, status: 'ACTIVE' }),
      }),
    );
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          statusEnum: { in: ['ACTIVE', 'FORMING', 'PAUSED'] },
        }),
      }),
    );
  });

  it('refuses a picked group that no longer takes students', async () => {
    const prisma = { group: { findFirst: jest.fn().mockResolvedValue(null) } };
    const ctx = buildButtonCtx('select_group_g1', 2, { branchId: 7 });
    const scene = createStudentRegistrationScene(
      prisma as any,
      { deleteFile: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await scene.middleware()(ctx, async () => {});

    expect(prisma.group.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'g1',
          branchId: 7,
          deletedAt: null,
          statusEnum: { in: ['ACTIVE', 'FORMING', 'PAUSED'] },
        },
      }),
    );
    expect(ctx.reply).toHaveBeenCalledWith('Guruh topilmadi. Qayta tanlang.');
    expect(ctx.session.step).toBe(2);
  });
});

/**
 * «Tasdiqlash» sends a request (ADR-0080): no card, no account and no password
 * until an administrator approves it.
 */
describe('student-registration.scene — confirming sends a join request', () => {
  const PHOTO = 'https://r2.example.com/students/new.jpg';
  const DATA = {
    branchId: 7,
    teacherId: 10010,
    teacherName: 'Aziz Qodirov',
    groupId: 'g1',
    groupName: 'A1-07',
    firstName: 'Akmal',
    lastName: 'Karimov',
    phone: '901112233',
    photo: PHOTO,
  };

  function confirm(outcome: unknown) {
    const joinRequests = {
      create: jest.fn().mockResolvedValue(outcome),
      pendingForChat: jest.fn(),
    };
    const uploadService = {
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    // The tap comes from a Telegram account with no username.
    const ctx = buildButtonCtx('confirm_student', 7, { ...DATA });
    const scene = createStudentRegistrationScene(
      {} as any,
      uploadService as any,
      {} as any,
      joinRequests as any,
    );
    return { ctx, scene, joinRequests, uploadService };
  }

  it('writes the request and tells the person it waits for an administrator', async () => {
    const { ctx, scene, joinRequests, uploadService } = confirm({
      kind: 'created',
      requestId: 'r1',
      text: "✅ <b>So'rovingiz qabul qilindi</b>",
    });

    await scene.middleware()(ctx, async () => {});

    expect(joinRequests.create).toHaveBeenCalledWith({
      branchId: 7,
      groupId: 'g1',
      chatId: '555444',
      telegramUsername: null,
      firstName: 'Akmal',
      lastName: 'Karimov',
      phone: '901112233',
      photo: PHOTO,
    });
    expect(ctx.reply).toHaveBeenCalledWith(
      "✅ <b>So'rovingiz qabul qilindi</b>",
      { parse_mode: 'HTML' },
    );
    expect(ctx.scene.leave).toHaveBeenCalled();
    // The request owns the photo now: neither deleted nor left for /start.
    expect(uploadService.deleteFile).not.toHaveBeenCalled();
    expect(ctx.session.data).toEqual({});
    expect(JSON.stringify(ctx.reply.mock.calls)).not.toContain('Parol');
  });

  it('a refusal deletes the photo and says why', async () => {
    const { ctx, scene, uploadService } = confirm({
      kind: 'refused',
      message: "Siz allaqachon ro'yxatdan o'tgansiz!",
    });

    await scene.middleware()(ctx, async () => {});

    expect(uploadService.deleteFile).toHaveBeenCalledWith(PHOTO);
    expect(ctx.reply).toHaveBeenCalledWith(
      "Siz allaqachon ro'yxatdan o'tgansiz!",
      expect.anything(),
    );
    expect(ctx.scene.leave).toHaveBeenCalled();
  });

  it('a failed write keeps the confirmation step and offers to try again', async () => {
    const { ctx, scene, joinRequests } = confirm(null);
    joinRequests.create.mockRejectedValue(new Error('db down'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await scene.middleware()(ctx, async () => {});

    expect(ctx.session.step).toBe(7);
    expect(ctx.reply).toHaveBeenCalledWith(
      "So'rovni yuborishda xatolik yuz berdi. Qayta tasdiqlang yoki administrator bilan bog'laning.",
      expect.anything(),
    );
    expect(ctx.scene.leave).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
