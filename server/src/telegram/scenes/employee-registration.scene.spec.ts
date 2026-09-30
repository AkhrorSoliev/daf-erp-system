import { Logger } from '@nestjs/common';
import { Context, TelegramError } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createEmployeeRegistrationScene } from './employee-registration.scene';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';

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
 * `confirm_registration` is where a Telegram-registered employee becomes a
 * `UsersService.create` call, and Task 3 made `position` required on that
 * call: a create() without one throws "Lavozim ko'rsatilishi shart", which
 * once failed every bot registration. The scene grants an arbitrary role SET,
 * so `position` must be derived from whichever roles were actually granted —
 * this is what regressed C1 for employee registrations specifically.
 *
 * The tests run the scene's real middleware stack against a genuine Telegraf
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
        chat: { id: 555222, type: 'private' },
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

function buildPrisma(findFirst?: jest.Mock) {
  return {
    user: { findFirst: findFirst ?? jest.fn().mockResolvedValue(null) },
  } as any;
}

function buildScene(
  usersService: { create: jest.Mock },
  prisma: any = buildPrisma(),
) {
  return createEmployeeRegistrationScene(
    prisma,
    { deleteFile: jest.fn() } as any,
    usersService as any,
    {} as any, // bot — unused (`_bot`)
  );
}

/**
 * Kontakt qadami (`step 3`): odam «📱 Telefon raqamni yuborish» tugmasini
 * bosdi yoki istalgan kontakt kartasini yubordi. `from.id` — yuboruvchi.
 */
function buildContactCtx(
  contact: { phone_number: string; first_name: string; user_id?: number },
  fromId = 999,
) {
  const update = {
    update_id: 2,
    message: {
      message_id: 2,
      date: 0,
      chat: { id: 555222, type: 'private' },
      from: { id: fromId, is_bot: false, first_name: 'T' },
      contact,
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = {
    step: 3,
    data: { branchId: 7, roleIds: [4] },
    processing: false,
  };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

describe('employee-registration.scene — confirm_registration', () => {
  it('derives position "Administrator" for a single-role (id 3) grant', async () => {
    const usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const scene = buildScene(usersService);

    const ctx = buildConfirmCtx({
      firstName: 'Nodira',
      lastName: 'Yusupova',
      phone: '901112233',
      gender: 'FEMALE',
      photo: 'https://example.com/photo.jpg',
      branchId: 7,
      roleIds: [3],
    });

    await scene.middleware()(ctx, async () => {});

    expect(usersService.create).toHaveBeenCalledTimes(1);
    const payload = usersService.create.mock.calls[0][0];
    expect(payload.position).toBe('Administrator');
    expect(payload.roleIds).toEqual([3]);
    // The actor must be stated. `UsersService.create` runs the branch-scope
    // guard for a caller-shaped actor, and there is no caller here — passing
    // nothing is what made every bot registration fail with a Forbidden.
    expect(usersService.create.mock.calls[0][1]).toEqual({
      kind: 'self-registration',
    });
  });

  it('picks the SENIOR (lowest id) role for a multi-role grant, e.g. Filial direktori over Kassir', async () => {
    const usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const scene = buildScene(usersService);

    const ctx = buildConfirmCtx({
      firstName: 'Bekzod',
      lastName: 'Rashidov',
      phone: '901112244',
      gender: 'MALE',
      photo: 'https://example.com/photo.jpg',
      branchId: 7,
      roleIds: [5, 2], // Kassir + Branch Director granted together
    });

    await scene.middleware()(ctx, async () => {});

    expect(usersService.create).toHaveBeenCalledTimes(1);
    const payload = usersService.create.mock.calls[0][0];
    expect(payload.position).toBe('Filial direktori');
    expect(payload.roleIds).toEqual([5, 2]);
  });

  it('refuses to submit (no create call) when no role was granted', async () => {
    const usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const scene = buildScene(usersService);

    const ctx = buildConfirmCtx({
      firstName: 'Nodira',
      lastName: 'Yusupova',
      phone: '901112233',
      gender: 'FEMALE',
      photo: 'https://example.com/photo.jpg',
      branchId: 7,
      roleIds: [],
    });

    await scene.middleware()(ctx, async () => {});

    expect(usersService.create).not.toHaveBeenCalled();
  });
});

/** Telegram's refusal as Telegraf throws it: the failed request rides along. */
function refusal(
  code: number,
  description: string,
  method: string,
  payload: object,
) {
  return new TelegramError(
    { error_code: code, description },
    { method, payload },
  );
}

/**
 * Once `UsersService.create` returns, the employee's account exists. The
 * Telegram calls after it can still fail — a network error, a preview the
 * person deleted, Telegram unable to fetch the photo from storage — and that
 * must not read as a failed registration.
 */
describe('employee-registration.scene — Telegram fails after the account is created', () => {
  const PHOTO = 'https://r2.example.com/employees/new.jpg';
  let usersService: { create: jest.Mock };
  let uploadService: { deleteFile: jest.Mock };
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    usersService = { create: jest.fn().mockResolvedValue({ id: 10950 }) };
    uploadService = { deleteFile: jest.fn().mockResolvedValue(undefined) };
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  /** Taps «Tasdiqlash» with `fail` breaking some Telegram call. */
  async function confirm(fail: (ctx: any) => void) {
    const ctx = buildConfirmCtx({
      firstName: 'Nodira',
      lastName: 'Yusupova',
      phone: '901112233',
      gender: 'FEMALE',
      photo: PHOTO,
      branchId: 7,
      roleIds: [3],
    });
    fail(ctx);
    const scene = createEmployeeRegistrationScene(
      buildPrisma(),
      uploadService as any,
      usersService as any,
      {} as any,
    );

    await expect(
      scene.middleware()(ctx, async () => {}),
    ).resolves.toBeUndefined();
    return ctx;
  }

  /** The password the account was created with. */
  const password = (): string => usersService.create.mock.calls[0][0].password;

  function expectRegistrationStands(ctx: any) {
    expect(JSON.stringify(ctx.reply.mock.calls)).not.toContain('xatolik');
    expect(usersService.create).toHaveBeenCalledTimes(1);
    expect(ctx.scene.leave).toHaveBeenCalled();
    // The account uses the photo now. A session still holding it would have
    // the next /start delete it, as it deletes an unfinished registration's.
    expect(uploadService.deleteFile).not.toHaveBeenCalled();
    expect(ctx.session.data.photo).toBeUndefined();
    // A Telegraf error carries the request that failed, caption included.
    expect(JSON.stringify([warn.mock.calls, error.mock.calls])).not.toContain(
      password(),
    );
  }

  it('a failed «Tasdiqlandi» edit still sends the login and password', async () => {
    const ctx = await confirm((c) => {
      c.editMessageCaption = jest
        .fn()
        .mockResolvedValueOnce(true) // the loading state, before the account
        .mockRejectedValue(
          refusal(
            400,
            'Bad Request: message to edit not found',
            'editMessageCaption',
            { caption: '✅ Tasdiqlandi!' },
          ),
        );
    });

    expectRegistrationStands(ctx);
    expect(ctx.replyWithPhoto).toHaveBeenCalledTimes(1);
    const [photo, extra] = ctx.replyWithPhoto.mock.calls[0];
    expect(photo).toBe(PHOTO);
    expect(extra.caption).toContain('901112233');
    expect(extra.caption).toContain(password());
    expect(extra.parse_mode).toBe('Markdown');
  });

  it('a photo Telegram cannot send goes as a text message instead', async () => {
    const ctx = await confirm((c) => {
      c.replyWithPhoto = jest.fn((photo: string, extra: object) =>
        Promise.reject(
          refusal(
            400,
            'Bad Request: failed to get HTTP URL content',
            'sendPhoto',
            { chat_id: 555222, photo, ...extra },
          ),
        ),
      );
    });

    expectRegistrationStands(ctx);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    const [text, extra] = ctx.reply.mock.calls[0];
    expect(text).toContain('901112233');
    expect(text).toContain(password());
    // The same Markdown as the caption: sent without it, the password shows
    // between backticks, and a person may type them in.
    expect(extra).toEqual({ parse_mode: 'Markdown' });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to get HTTP URL content'),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('when nothing reaches the person, the log says so', async () => {
    const ctx = await confirm((c) => {
      const blocked = (method: string, field: string) =>
        jest.fn((content: string, extra?: object) =>
          Promise.reject(
            refusal(403, 'Forbidden: bot was blocked by the user', method, {
              chat_id: 555222,
              [field]: content,
              ...extra,
            }),
          ),
        );
      c.replyWithPhoto = blocked('sendPhoto', 'photo');
      c.reply = blocked('sendMessage', 'text');
    });

    expectRegistrationStands(ctx);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('bot was blocked by the user'),
    );
  });
});

describe('employee-registration.scene — kontakt qadami', () => {
  const OWN = { phone_number: '+998901112233', first_name: 'T', user_id: 999 };

  it("begona kontakt kartasi (boshqa user_id) rad etiladi, baza so'ralmaydi", async () => {
    const prisma = buildPrisma();
    const scene = buildScene({ create: jest.fn() }, prisma);
    const ctx = buildContactCtx({ ...OWN, user_id: 1 });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(ctx.session.step).toBe(3);
    expect(ctx.scene.leave).not.toHaveBeenCalled();
  });

  it("user_id'siz karta ham rad etiladi", async () => {
    const prisma = buildPrisma();
    const scene = buildScene({ create: jest.fn() }, prisma);
    const ctx = buildContactCtx({
      phone_number: '+998901112233',
      first_name: 'T',
    });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(ctx.session.step).toBe(3);
  });

  it("o'quvchi hisobidagi raqam xodim bo'lishga to'sqinlik qilmaydi", async () => {
    // Rolsiz so'rov bu raqamda o'quvchi hisobini topardi; xodim roli bilan
    // so'ralsa — yo'q. Sahna aynan xodim roli bilan so'rashi kerak.
    const findFirst = jest
      .fn()
      .mockImplementation(({ where }: any) =>
        Promise.resolve(where.roles ? null : { id: 10018 }),
      );
    const scene = buildScene({ create: jest.fn() }, buildPrisma(findFirst));
    const ctx = buildContactCtx(OWN);

    await scene.middleware()(ctx, async () => {});

    expect(findFirst.mock.calls[0][0].where.roles).toBeDefined();
    expect(ctx.session.step).toBe(4);
    expect(ctx.session.data.phone).toBe('901112233');
    expect(ctx.scene.leave).not.toHaveBeenCalled();
  });

  it("ishlab turgan xodim raqami to'xtatadi va adminga yo'naltiradi", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 10924,
      firstName: 'Nodira',
      lastName: 'Yusupova',
    });
    const scene = buildScene({ create: jest.fn() }, buildPrisma(findFirst));
    const ctx = buildContactCtx(OWN);

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toMatch(/xodim hisobi allaqachon bor/);
    expect(ctx.scene.leave).toHaveBeenCalled();
    expect(ctx.session.step).toBe(3);
  });
});

describe('employee-registration.scene — kirish nomi', () => {
  const data = {
    firstName: 'Nodira',
    lastName: 'Yusupova',
    phone: '901112233',
    gender: 'FEMALE',
    photo: 'https://example.com/photo.jpg',
    branchId: 7,
    roleIds: [3],
  };

  it("telefon bo'sh bo'lsa kirish nomi = telefon", async () => {
    const usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const scene = buildScene(usersService, buildPrisma());

    await scene.middleware()(buildConfirmCtx(data), async () => {});

    expect(usersService.create.mock.calls[0][0].login).toBe('901112233');
  });

  it("telefon boshqa hisobning kirish nomi bo'lsa nom yuborilmaydi, hisob baribir ochiladi", async () => {
    const findFirst = jest
      .fn()
      .mockImplementation(({ where }: any) =>
        Promise.resolve(where.login ? { id: 10018 } : null),
      );
    const usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const scene = buildScene(usersService, buildPrisma(findFirst));

    await scene.middleware()(buildConfirmCtx(data), async () => {});

    expect(usersService.create).toHaveBeenCalledTimes(1);
    expect(usersService.create.mock.calls[0][0].login).toBeUndefined();
    expect(usersService.create.mock.calls[0][0].phone).toBe('901112233');
  });
});

/** A step that throws `error`, noting whether the lock was held when it ran. */
function failingStep(ctx: any, error: Error) {
  return jest.fn(async () => {
    ctx.lockHeldWhenFailed = ctx.session.processing;
    throw error;
  });
}

/** A tap on one of the preview's two buttons (`step 6`). */
function buildButtonCtx(action: string, sessionData: Record<string, any>) {
  const update = {
    update_id: 3,
    callback_query: {
      id: 'cbq3',
      data: action,
      from: { id: 999, is_bot: false, first_name: 'T' },
      message: {
        message_id: 3,
        date: 0,
        chat: { id: 555222, type: 'private' },
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

/**
 * The preview's buttons hold `processing` while they work, and every handler
 * of this scene ignores a chat whose flag is set, as does `/start`. A step
 * that threw with the flag set therefore left the person unable to go on or
 * start over until their 24-hour session expired.
 */
describe('employee-registration.scene — a failed step releases the lock', () => {
  const DATA = {
    firstName: 'Nodira',
    lastName: 'Yusupova',
    phone: '901112233',
    gender: 'FEMALE',
    photo: 'https://example.com/photo.jpg',
    branchId: 7,
    roleIds: [3],
  };

  type Deps = {
    uploadService: { deleteFile: jest.Mock };
    usersService: { create: jest.Mock };
  };

  it.each<{
    action: string;
    what: string;
    fail: (ctx: any, deps: Deps, error: Error) => void;
  }>([
    {
      action: 'confirm_registration',
      what: 'answering the button tap',
      fail: (ctx, _deps, error) => {
        ctx.answerCbQuery = failingStep(ctx, error);
      },
    },
    {
      action: 'confirm_registration',
      what: 'the typing notice',
      fail: (ctx, _deps, error) => {
        ctx.sendChatAction = failingStep(ctx, error);
      },
    },
    {
      action: 'restart_registration',
      what: 'answering the button tap',
      fail: (ctx, _deps, error) => {
        ctx.answerCbQuery = failingStep(ctx, error);
      },
    },
    {
      action: 'restart_registration',
      what: 'deleting the uploaded photo',
      fail: (ctx, deps, error) => {
        deps.uploadService.deleteFile = failingStep(ctx, error);
      },
    },
  ])('$action releases the lock when $what fails', async ({ action, fail }) => {
    const deps: Deps = {
      uploadService: { deleteFile: jest.fn().mockResolvedValue(undefined) },
      usersService: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    const ctx = buildButtonCtx(action, { ...DATA });
    const error = new Error('Request failed');
    fail(ctx, deps, error);
    const scene = createEmployeeRegistrationScene(
      buildPrisma(),
      deps.uploadService as any,
      deps.usersService as any,
      {} as any,
    );

    await expect(scene.middleware()(ctx, async () => {})).rejects.toBe(error);

    expect(ctx.lockHeldWhenFailed).toBe(true);
    expect(ctx.session.processing).toBe(false);
  });
});

/**
 * Xodim kabineti (ADR-0045): ro'yxatdan o'tgan xodim darhol o'z menyusini
 * ko'radi; qayta kelgan xodimga «allaqachon ro'yxatdan o'tgansiz» o'rniga
 * menyu, kabinet o'chiq bo'lsa — o'z portalining manzili.
 */
describe('employee-registration.scene — xodim kabineti', () => {
  function enterCtx() {
    const update = {
      update_id: 5,
      message: {
        message_id: 5,
        date: 0,
        chat: { id: 555222, type: 'private' },
        from: { id: 555222, is_bot: false, first_name: 'T' },
        text: '/start employee_x',
      },
    };
    const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
    ctx.session = { step: 0, data: { branchId: 7, roleIds: [4] } };
    ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
    ctx.reply = jest.fn().mockResolvedValue(undefined);
    return ctx;
  }

  function sceneWith(
    findFirst: jest.Mock,
    cabinet?: { showMenuForChat: jest.Mock },
    usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) },
  ) {
    return createEmployeeRegistrationScene(
      buildPrisma(findFirst),
      { deleteFile: jest.fn() } as any,
      usersService as any,
      {} as any,
      cabinet,
    );
  }

  const enter = (scene: any, ctx: any) =>
    scene.enterMiddleware()(ctx, async () => {});

  it("qayta kelgan xodimga xodim menyusi — boshqa xabar yo'q", async () => {
    const cabinet = { showMenuForChat: jest.fn().mockResolvedValue(true) };
    const findFirst = jest.fn().mockResolvedValue({ roles: [{ roleId: 4 }] });
    const ctx = enterCtx();

    await enter(sceneWith(findFirst, cabinet), ctx);

    expect(cabinet.showMenuForChat).toHaveBeenCalledWith(ctx);
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(ctx.scene.leave).toHaveBeenCalled();
  });

  it.each([
    ['faqat ustoz', [{ roleId: 4 }], 'https://lehrer.dafzentrum.uz'],
    ['administrator', [{ roleId: 3 }], 'https://admin.dafzentrum.uz'],
    [
      'ustoz ham, kassir ham',
      [{ roleId: 4 }, { roleId: 5 }],
      'https://admin.dafzentrum.uz',
    ],
  ])(
    "kabinet o'chiq bo'lsa — %s o'z portaliga yo'naltiriladi",
    async (_label, roles, portalUrl) => {
      const cabinet = { showMenuForChat: jest.fn().mockResolvedValue(false) };
      const ctx = enterCtx();

      await enter(
        sceneWith(jest.fn().mockResolvedValue({ roles }), cabinet),
        ctx,
      );

      expect(ctx.reply.mock.calls[0][0]).toContain(`(${portalUrl})`);
      expect(ctx.scene.leave).toHaveBeenCalled();
    },
  );

  it("ro'yxatdan o'tish tugagach — kirish ma'lumotlaridan keyin xodim menyusi", async () => {
    const cabinet = { showMenuForChat: jest.fn().mockResolvedValue(true) };
    const scene = sceneWith(jest.fn().mockResolvedValue(null), cabinet);
    const ctx = buildConfirmCtx({
      firstName: 'Doston',
      lastName: 'Karimov',
      phone: '901112233',
      gender: 'MALE',
      photo: 'https://example.com/photo.jpg',
      branchId: 7,
      roleIds: [4],
    });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.replyWithPhoto).toHaveBeenCalled();
    expect(cabinet.showMenuForChat).toHaveBeenCalledWith(ctx);
    expect(ctx.replyWithPhoto.mock.invocationCallOrder[0]).toBeLessThan(
      cabinet.showMenuForChat.mock.invocationCallOrder[0],
    );
  });

  it("menyu yuborilmasa ham ro'yxatdan o'tish xato deb aytilmaydi — hisob ochilgan", async () => {
    const cabinet = {
      showMenuForChat: jest.fn().mockRejectedValue(new Error('chat not found')),
    };
    const usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const scene = sceneWith(
      jest.fn().mockResolvedValue(null),
      cabinet,
      usersService,
    );
    const ctx = buildConfirmCtx({
      firstName: 'Doston',
      lastName: 'Karimov',
      phone: '901112233',
      gender: 'MALE',
      photo: 'https://example.com/photo.jpg',
      branchId: 7,
      roleIds: [4],
    });
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await scene.middleware()(ctx, async () => {});
    warn.mockRestore();

    expect(usersService.create).toHaveBeenCalledTimes(1);
    expect(ctx.replyWithPhoto).toHaveBeenCalled();
    expect(JSON.stringify(ctx.reply.mock.calls)).not.toContain('xatolik');
  });
});
