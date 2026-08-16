import { Context } from 'telegraf';
import { createEmployeeRegistrationScene } from './employee-registration.scene';

/**
 * Same reasoning as `teacher-registration.scene.spec.ts`: `confirm_registration`
 * is where a Telegram-registered employee becomes a `UsersService.create` call,
 * and Task 3 made `position` required on that call. The employee scene grants
 * an arbitrary role SET (not a single fixed role like the teacher scene), so
 * `position` here must be derived from whichever roles were actually granted —
 * this is what regressed C1 for employee registrations specifically.
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
  const ctx = new Context(update as any, {} as any, undefined) as any;
  ctx.session = { step: 6, data: sessionData, processing: false };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.answerCbQuery = jest.fn().mockResolvedValue(undefined);
  ctx.editMessageCaption = jest.fn().mockResolvedValue(undefined);
  ctx.sendChatAction = jest.fn().mockResolvedValue(undefined);
  ctx.replyWithPhoto = jest.fn().mockResolvedValue(undefined);
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

function buildScene(usersService: { create: jest.Mock }) {
  return createEmployeeRegistrationScene(
    {} as any, // prisma — unused on this path
    { deleteFile: jest.fn() } as any,
    usersService as any,
    {} as any, // bot — unused (`_bot`)
  );
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
