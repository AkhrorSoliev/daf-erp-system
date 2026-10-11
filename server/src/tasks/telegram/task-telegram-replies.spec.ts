import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Composer, Context } from 'telegraf';
import { STAFF_TASKS_ACTION } from '../../telegram/staff/staff-cabinet';
import { loadTaskView, staffOfChat } from './task-telegram-view';
import { TaskTelegramHandler } from './task-telegram.handler';
import { TaskTelegramReplies } from './task-telegram-replies';
import {
  ADDED_TO_TASK,
  NOT_YOURS,
  PHOTO_PROMPT,
  SEVERAL_ACCOUNTS,
  TRY_LATER,
  parseTk,
  type TgTaskView,
} from './task-telegram-text';

// Replies to task messages (spec §6.2); the buttons and the «Qaytarish» prompt
// are in `task-telegram.handler.spec.ts` and `task-telegram.handler.return.spec.ts`.
// The fixtures repeat there: a shared helper would be built into dist.

jest.mock('./task-telegram-view', () => ({
  ...jest.requireActual('./task-telegram-view'),
  loadTaskView: jest.fn(),
  staffOfChat: jest.fn(),
}));

const TASK = '0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10';
const actorOf = (userId: number) => ({
  userId,
  companyId: 1,
  roleIds: [4],
  roleNames: ['Teacher'],
  scope: { kind: 'branches' as const, branchIds: [1] },
  headerBranchId: null,
});
const view = (over: Partial<TgTaskView> = {}): TgTaskView => ({
  id: TASK,
  companyId: 1,
  kind: 'MANUAL',
  title: 'Oktabr banneri',
  status: 'NEW',
  priority: 'HIGH',
  dueAt: null,
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
  steps: [],
  ...over,
});

let replies: TaskTelegramReplies;
let handler: TaskTelegramHandler;
let prisma: any;
let tasks: any;
let files: any;
let sender: any;
let telegram: any;

/** Keeps the expected log lines out of the output; `afterEach` restores them. */
const mute = (level: 'warn' | 'error') =>
  jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);

function as(userId: number) {
  (staffOfChat as jest.Mock).mockResolvedValue({
    kind: 'one',
    userId,
    companyId: 1,
    roleIds: [4],
  });
  tasks.loadActor.mockResolvedValue(actorOf(userId));
}

beforeEach(() => {
  // The module mocks (`loadTaskView`, `staffOfChat`) keep calls and queued
  // `…Once` values across tests otherwise.
  jest.resetAllMocks();
  prisma = { taskTelegramMessage: { findUnique: jest.fn() } };
  tasks = {
    loadActor: jest.fn(),
    loadForAccess: jest.fn().mockResolvedValue({ access: { canManage: true } }),
    review: jest.fn().mockResolvedValue({ assignees: [] }),
    addComment: jest.fn().mockResolvedValue({}),
  };
  files = { upload: jest.fn() };
  sender = {
    openUrl: jest
      .fn()
      .mockReturnValue(`https://lehrer.dafzentrum.uz/tasks?task=${TASK}`),
    record: jest.fn(),
  };
  telegram = { getBot: () => ({}), useBeforeScenes: jest.fn() };
  replies = new TaskTelegramReplies(prisma, tasks, files);
  handler = new TaskTelegramHandler(prisma, tasks, telegram, sender, replies);
  as(40);
  (loadTaskView as jest.Mock).mockResolvedValue(view());
});

afterEach(() => jest.restoreAllMocks());

describe('TaskTelegramReplies — replies (spec §6.2)', () => {
  const message = (msg: any) =>
    ({
      chat: { id: 700, type: 'private' },
      message: msg,
      reply: jest.fn().mockResolvedValue({ message_id: 12 }),
    }) as any;
  const replyTo = (over: any = {}) => ({
    message_id: 11,
    text: ' Ha, 450 000. ',
    reply_to_message: { message_id: 5 },
    ...over,
  });
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn().mockResolvedValue(undefined);
    prisma.taskTelegramMessage.findUnique.mockResolvedValue({
      taskId: TASK,
      purpose: 'NOTICE',
    });
  });

  it("a reply to a task message becomes a comment by the chat's staff", async () => {
    const ctx = message(replyTo());
    await replies.onMessage(ctx, next);
    expect(prisma.taskTelegramMessage.findUnique).toHaveBeenCalledWith({
      where: { chatId_messageId: { chatId: '700', messageId: 5 } },
      select: { taskId: true, purpose: true },
    });
    expect(tasks.addComment).toHaveBeenCalledWith(TASK, 'Ha, 450 000.', {
      ...actorOf(40),
      via: 'TELEGRAM',
    });
    expect(ctx.reply).toHaveBeenCalledWith(ADDED_TO_TASK);
    expect(next).not.toHaveBeenCalled();
  });

  it('a reply to the «Qaytarish» prompt returns the task with that reason', async () => {
    as(30);
    prisma.taskTelegramMessage.findUnique.mockResolvedValue({
      taskId: TASK,
      purpose: 'RETURN_PROMPT',
    });
    tasks.review.mockResolvedValue({
      assignees: [{ firstName: 'Aziz', lastName: 'Rahimov' }],
    });
    const ctx = message(
      replyTo({
        text: 'Doska artilmagan, qayta qiling',
        reply_to_message: { message_id: 9 },
      }),
    );
    await replies.onMessage(ctx, next);
    expect(tasks.review).toHaveBeenCalledWith(
      TASK,
      'RETURN',
      'Doska artilmagan, qayta qiling',
      { ...actorOf(30), via: 'TELEGRAM' },
    );
    expect(tasks.addComment).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      'Topshiriq qaytarildi. Rahimov A. ga xabar ketdi.',
    );
  });

  it("not a reply, a reply to another message, a command, a group: the bot's own flows", async () => {
    await replies.onMessage(message({ message_id: 11, text: 'salom' }), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.taskTelegramMessage.findUnique).not.toHaveBeenCalled();

    // «/cancel» typed as a reply is still the command, not a comment.
    await replies.onMessage(
      message(
        replyTo({
          text: '/cancel',
          entities: [{ type: 'bot_command', offset: 0, length: 7 }],
        }),
      ),
      next,
    );
    expect(next).toHaveBeenCalledTimes(2);
    expect(prisma.taskTelegramMessage.findUnique).not.toHaveBeenCalled();

    const group = message(replyTo());
    group.chat.type = 'group';
    await replies.onMessage(group, next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(prisma.taskTelegramMessage.findUnique).not.toHaveBeenCalled();

    prisma.taskTelegramMessage.findUnique.mockResolvedValue(null);
    await replies.onMessage(
      message(replyTo({ reply_to_message: { message_id: 6 } })),
      next,
    );
    expect(next).toHaveBeenCalledTimes(4);
    expect(tasks.addComment).not.toHaveBeenCalled();
    expect(staffOfChat).not.toHaveBeenCalled();
  });

  it('the service refuses → its reason; a task out of reach → «Bu topshiriq sizda emas»', async () => {
    tasks.addComment.mockRejectedValueOnce(
      new BadRequestException('Izoh matnini yozing'),
    );
    const a = message(replyTo());
    await replies.onMessage(a, next);
    expect(a.reply).toHaveBeenCalledWith('Izoh matnini yozing');
    tasks.addComment.mockRejectedValueOnce(
      new NotFoundException('Topshiriq topilmadi'),
    );
    const b = message(replyTo());
    await replies.onMessage(b, next);
    expect(b.reply).toHaveBeenCalledWith(NOT_YOURS);
  });

  it('a replier who is not on the task, or left it, is told so before anything is written', async () => {
    as(50); // visible (a manager), neither the author nor a participant
    const a = message(replyTo());
    await replies.onMessage(a, next);
    expect(a.reply).toHaveBeenCalledWith(NOT_YOURS);

    as(40);
    tasks.loadForAccess.mockRejectedValueOnce(
      new NotFoundException('Topshiriq topilmadi'),
    );
    const b = message(replyTo());
    await replies.onMessage(b, next);
    expect(b.reply).toHaveBeenCalledWith(NOT_YOURS);

    (loadTaskView as jest.Mock).mockResolvedValueOnce(null);
    const c = message(replyTo());
    await replies.onMessage(c, next);
    expect(c.reply).toHaveBeenCalledWith(NOT_YOURS);

    expect(tasks.addComment).not.toHaveBeenCalled();
    expect(tasks.review).not.toHaveBeenCalled();
  });

  it('identity: no staff on the chat, two, or an account blocked since — refused', async () => {
    (staffOfChat as jest.Mock).mockResolvedValue({ kind: 'none' });
    const a = message(replyTo());
    await replies.onMessage(a, next);
    expect(a.reply).toHaveBeenCalledWith(NOT_YOURS);

    (staffOfChat as jest.Mock).mockResolvedValue({ kind: 'several' });
    const b = message(replyTo());
    await replies.onMessage(b, next);
    expect(b.reply).toHaveBeenCalledWith(SEVERAL_ACCOUNTS);

    as(40);
    tasks.loadActor.mockRejectedValue(
      new ForbiddenException('Foydalanuvchi aniqlanmadi'),
    );
    const c = message(replyTo());
    await replies.onMessage(c, next);
    expect(c.reply).toHaveBeenCalledWith(NOT_YOURS);

    expect(tasks.addComment).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('an unexpected error is logged through describeError and never escapes', async () => {
    const error = mute('error');
    tasks.addComment.mockRejectedValue(new Error('db down'));
    const ctx = message(replyTo());
    await expect(replies.onMessage(ctx, next)).resolves.toBeUndefined();
    expect(ctx.reply).toHaveBeenCalledWith(TRY_LATER);
    expect(error).toHaveBeenCalledWith('task reply failed: db down');
  });

  it('the write is done but the «done» message does not go out: logged, no TRY_LATER, so nothing is sent twice', async () => {
    const error = mute('error');
    const warn = mute('warn');
    const comment = message(replyTo());
    comment.reply.mockRejectedValue(new Error('403: bot was blocked'));
    await expect(replies.onMessage(comment, next)).resolves.toBeUndefined();
    expect(tasks.addComment).toHaveBeenCalledTimes(1);
    expect(comment.reply).toHaveBeenCalledTimes(1);
    expect(comment.reply).toHaveBeenCalledWith(ADDED_TO_TASK);

    as(30);
    prisma.taskTelegramMessage.findUnique.mockResolvedValue({
      taskId: TASK,
      purpose: 'RETURN_PROMPT',
    });
    const returned = message(replyTo({ text: 'Qayta qiling' }));
    returned.reply.mockRejectedValue(new Error('403: bot was blocked'));
    await expect(replies.onMessage(returned, next)).resolves.toBeUndefined();
    expect(tasks.review).toHaveBeenCalledTimes(1);
    expect(returned.reply).toHaveBeenCalledTimes(1);

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'task reply not confirmed: 403: bot was blocked',
    );
  });

  it('a text reply to the photo prompt asks for the photo again; nothing stored', async () => {
    prisma.taskTelegramMessage.findUnique.mockResolvedValue({
      taskId: TASK,
      purpose: 'PHOTO_PROMPT',
    });
    const ctx = message(replyTo());
    await replies.onMessage(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith(PHOTO_PROMPT);
    expect(tasks.addComment).not.toHaveBeenCalled();
    expect(tasks.review).not.toHaveBeenCalled();
    expect(files.upload).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("a failure further down the chain is not swallowed as the reply's", async () => {
    next.mockRejectedValue(new Error('scene broke'));
    const ctx = message({ message_id: 11, text: 'salom' });
    await expect(replies.onMessage(ctx, next)).rejects.toThrow('scene broke');
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('the staff menu button is the list action', () => {
    expect(parseTk(STAFF_TASKS_ACTION)).toEqual({ action: 'list', id: '' });
  });

  describe('through the composer registered before the scenes', () => {
    const update = (msg: any) => {
      const ctx = new Context(
        {
          update_id: 1,
          message: {
            date: 1,
            chat: { id: 700, type: 'private' },
            from: { id: 700, is_bot: false, first_name: 'A' },
            ...msg,
          },
        } as any,
        {} as any,
        { username: 'bot' } as any,
      ) as any;
      ctx.reply = jest.fn().mockResolvedValue({ message_id: 12 });
      // A registration scene somebody walked away from.
      ctx.session = { __scenes: { current: 'STAFF_LINK' } };
      return ctx;
    };
    const composed = () => {
      handler.onApplicationBootstrap();
      expect(telegram.useBeforeScenes).toHaveBeenCalledTimes(1);
      return Composer.unwrap(telegram.useBeforeScenes.mock.calls[0][0]);
    };

    it('a reply to a task message is answered even while an old scene is open', async () => {
      const mw = composed();
      const ctx = update(replyTo());
      await mw(ctx, next);
      expect(tasks.addComment).toHaveBeenCalledWith(
        TASK,
        'Ha, 450 000.',
        expect.objectContaining({ via: 'TELEGRAM' }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(ADDED_TO_TASK);
      expect(next).not.toHaveBeenCalled();
      expect(ctx.session).toEqual({ __scenes: { current: 'STAFF_LINK' } });
    });

    it('an ordinary message during a scene still reaches the scene', async () => {
      const mw = composed();
      const ctx = update({ message_id: 11, text: '+998901234567' });
      await mw(ctx, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(prisma.taskTelegramMessage.findUnique).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();

      // Replying to some other message of the bot's (the scene's own question).
      prisma.taskTelegramMessage.findUnique.mockResolvedValue(null);
      const answer = update(
        replyTo({ text: 'Doston', reply_to_message: { message_id: 77 } }),
      );
      await mw(answer, next);
      expect(next).toHaveBeenCalledTimes(2);
      expect(tasks.addComment).not.toHaveBeenCalled();
    });
  });
});
