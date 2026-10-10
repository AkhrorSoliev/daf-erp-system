import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Composer, Context } from 'telegraf';
import { loadTaskView, staffOfChat } from './task-telegram-view';
import { TaskTelegramHandler } from './task-telegram.handler';
import {
  NOT_YOURS,
  SEVERAL_ACCOUNTS,
  TRY_LATER,
  type TgTaskView,
} from './task-telegram-text';

jest.mock('./task-telegram-view', () => ({
  ...jest.requireActual('./task-telegram-view'),
  loadTaskView: jest.fn(),
  staffOfChat: jest.fn(),
}));

const TASK = '0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10';
const STEP = '6c1f2a9d-1d1b-4f3e-8f43-2b7c0e9d5a21';
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
  steps: [{ id: STEP, title: 'Matn qoralamasi', done: false }],
  ...over,
});

function press(
  data: string,
  text = 'Yangi topshiriq · Yuqori\nOktabr banneri',
) {
  return {
    chat: { id: 700, type: 'private' },
    callbackQuery: { data, message: { message_id: 5, text } },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    editMessageText: jest.fn().mockResolvedValue(true),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({ message_id: 9 }),
  } as any;
}
const labels = (extra: any) =>
  extra.reply_markup.inline_keyboard.map((r: any[]) => r.map((b) => b.text));

let handler: TaskTelegramHandler;
let prisma: any;
let tasks: any;
let sender: any;
let telegram: any;

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
  prisma = {
    taskStep: { findUnique: jest.fn().mockResolvedValue({ taskId: TASK }) },
    task: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  tasks = {
    loadActor: jest.fn(),
    loadForAccess: jest.fn().mockResolvedValue({ access: { canManage: true } }),
    changeStatus: jest.fn().mockResolvedValue({}),
    review: jest.fn().mockResolvedValue({ assignees: [] }),
    updateStep: jest.fn().mockResolvedValue({}),
  };
  sender = {
    openUrl: jest
      .fn()
      .mockReturnValue(`https://lehrer.dafzentrum.uz/tasks?task=${TASK}`),
    record: jest.fn(),
  };
  telegram = { getBot: () => ({}), useBeforeScenes: jest.fn() };
  handler = new TaskTelegramHandler(prisma, tasks, telegram, sender);
  as(40);
  (loadTaskView as jest.Mock).mockResolvedValue(view());
});

describe('TaskTelegramHandler — registration (before the scenes)', () => {
  const update = (data: string) =>
    new Context(
      {
        update_id: 1,
        callback_query: {
          id: 'q',
          from: { id: 700, is_bot: false, first_name: 'A' },
          chat_instance: 'c',
          data,
        },
      } as any,
      {} as any,
      { username: 'bot' } as any,
    ) as any;

  it('one composer through useBeforeScenes: tk:* to onAction, the rest to next()', async () => {
    const onAction = jest
      .spyOn(handler, 'onAction')
      .mockResolvedValue(undefined);
    handler.onApplicationBootstrap();
    expect(telegram.useBeforeScenes).toHaveBeenCalledTimes(1);
    const mw = Composer.unwrap(telegram.useBeforeScenes.mock.calls[0][0]);

    const next = jest.fn().mockResolvedValue(undefined);
    await mw(update(`tk:start:${TASK}`), next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();

    await mw(update('menu_password'), next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('without a bot it registers nothing and does not throw', () => {
    const useBeforeScenes = jest.fn();
    const off = new TaskTelegramHandler(
      prisma,
      tasks,
      { getBot: () => undefined, useBeforeScenes } as any,
      sender,
    );
    expect(() => off.onApplicationBootstrap()).not.toThrow();
    expect(useBeforeScenes).not.toHaveBeenCalled();
  });
});

describe('TaskTelegramHandler — buttons', () => {
  it("«Boshladim»: through TasksService as the chat's staff, via TELEGRAM; the same message is edited", async () => {
    (loadTaskView as jest.Mock)
      .mockResolvedValueOnce(view())
      .mockResolvedValueOnce(view({ status: 'IN_PROGRESS' }));
    const ctx = press(`tk:start:${TASK}`);
    await handler.onAction(ctx);
    expect(tasks.changeStatus).toHaveBeenCalledWith(TASK, 'IN_PROGRESS', {
      ...actorOf(40),
      via: 'TELEGRAM',
    });
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();
    const [text, extra] = ctx.editMessageText.mock.calls[0];
    expect(text.split('\n')[0]).toBe('<b>Yangi topshiriq · Yuqori</b>');
    expect(text).toContain('Holat: Jarayonda');
    expect(labels(extra)).toEqual([['Bajardim'], ['Qadamlar'], ['Ochish']]);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('«Bajardim»: to review on a shared task, straight to DONE on a self-task', async () => {
    await handler.onAction(press(`tk:done:${TASK}`));
    expect(tasks.changeStatus).toHaveBeenLastCalledWith(
      TASK,
      'IN_REVIEW',
      expect.anything(),
    );
    (loadTaskView as jest.Mock).mockResolvedValue(
      view({
        authorId: 40,
        participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
      }),
    );
    await handler.onAction(press(`tk:done:${TASK}`));
    expect(tasks.changeStatus).toHaveBeenLastCalledWith(
      TASK,
      'DONE',
      expect.anything(),
    );
  });

  it('«Qabul qilish»: the author accepts', async () => {
    as(30);
    (loadTaskView as jest.Mock).mockResolvedValue(
      view({ status: 'IN_REVIEW' }),
    );
    await handler.onAction(
      press(`tk:accept:${TASK}`, 'Tekshiruvga keldi\nOktabr banneri'),
    );
    expect(tasks.review).toHaveBeenCalledWith(TASK, 'ACCEPT', undefined, {
      ...actorOf(30),
      via: 'TELEGRAM',
    });
  });

  it("a stale press: the service's reason, then the task as it is now", async () => {
    tasks.changeStatus.mockRejectedValue(
      new BadRequestException('Holat allaqachon shunday'),
    );
    (loadTaskView as jest.Mock).mockResolvedValue(
      view({ status: 'IN_PROGRESS' }),
    );
    const ctx = press(`tk:start:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Holat allaqachon shunday', {
      show_alert: true,
    });
    expect(labels(ctx.editMessageText.mock.calls[0][1])).toEqual([
      ['Bajardim'],
      ['Qadamlar'],
      ['Ochish'],
    ]);
  });

  it('a task the person cannot see any more: «Bu topshiriq sizda emas», buttons removed', async () => {
    tasks.loadForAccess.mockRejectedValue(
      new NotFoundException('Topshiriq topilmadi'),
    );
    const ctx = press(`tk:start:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS, {
      show_alert: true,
    });
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(tasks.changeStatus).not.toHaveBeenCalled();
  });

  it('visible but no longer on it (a manager who left the task): «Bu topshiriq sizda emas»', async () => {
    as(50);
    const ctx = press(`tk:start:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS, {
      show_alert: true,
    });
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(tasks.changeStatus).not.toHaveBeenCalled();
  });

  it('identity: no staff on the chat, or two — refused before anything else', async () => {
    (staffOfChat as jest.Mock).mockResolvedValue({ kind: 'none' });
    const a = press(`tk:start:${TASK}`);
    await handler.onAction(a);
    expect(a.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS, {
      show_alert: true,
    });
    (staffOfChat as jest.Mock).mockResolvedValue({ kind: 'several' });
    const b = press(`tk:start:${TASK}`);
    await handler.onAction(b);
    expect(b.answerCbQuery).toHaveBeenCalledWith(SEVERAL_ACCOUNTS, {
      show_alert: true,
    });
    expect(tasks.loadActor).not.toHaveBeenCalled();
    expect(tasks.changeStatus).not.toHaveBeenCalled();
  });

  it('identity: an account blocked since the chat was linked is refused', async () => {
    tasks.loadActor.mockRejectedValue(
      new ForbiddenException('Foydalanuvchi aniqlanmadi'),
    );
    const ctx = press(`tk:start:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS, {
      show_alert: true,
    });
    expect(tasks.loadForAccess).not.toHaveBeenCalled();
  });

  it('an alert is clipped to the 200 characters Telegram takes', async () => {
    tasks.changeStatus.mockRejectedValue(
      new BadRequestException('Uzun sabab '.repeat(40)),
    );
    const ctx = press(`tk:start:${TASK}`);
    await handler.onAction(ctx);
    const [alert, opts] = ctx.answerCbQuery.mock.calls[0];
    expect(alert.length).toBeLessThanOrEqual(200);
    expect(alert.endsWith('…')).toBe(true);
    expect(opts).toEqual({ show_alert: true });
  });

  it('the task is lost between the check and the write: «Bu topshiriq sizda emas», buttons removed, the card is not redrawn', async () => {
    tasks.changeStatus.mockRejectedValue(
      new NotFoundException('Topshiriq topilmadi'),
    );
    // The check before the write passed; the one after the refusal does not.
    tasks.loadForAccess
      .mockResolvedValueOnce({ access: { canManage: true } })
      .mockRejectedValueOnce(new NotFoundException('Topshiriq topilmadi'));
    const ctx = press(`tk:start:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS, {
      show_alert: true,
    });
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it('a step that vanished during the tick: the task is still theirs, so the card is redrawn and keeps its buttons', async () => {
    tasks.updateStep.mockRejectedValue(
      new NotFoundException('Qadam topilmadi'),
    );
    const ctx = press(`tk:step:${STEP}`, 'Kichik qadamlar · 0/1\n…');
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Qadam topilmadi', {
      show_alert: true,
    });
    expect(ctx.editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
  });

  it('«Qadamlar» → the step list; a step toggles through the service; «Orqaga» → the card', async () => {
    const steps = press(`tk:steps:${TASK}`);
    await handler.onAction(steps);
    expect(steps.editMessageText.mock.calls[0][0]).toBe(
      '<b>Kichik qadamlar · 0/1</b>\nBosib belgilang yoki belgini olib tashlang',
    );
    expect(labels(steps.editMessageText.mock.calls[0][1])).toEqual([
      ['1. Matn qoralamasi'],
      ['Orqaga'],
    ]);

    (loadTaskView as jest.Mock)
      .mockResolvedValueOnce(view())
      .mockResolvedValueOnce(
        view({ steps: [{ id: STEP, title: 'Matn qoralamasi', done: true }] }),
      );
    const tick = press(`tk:step:${STEP}`, 'Kichik qadamlar · 0/1\n…');
    await handler.onAction(tick);
    expect(prisma.taskStep.findUnique).toHaveBeenCalledWith({
      where: { id: STEP },
      select: { taskId: true },
    });
    expect(tasks.loadForAccess).toHaveBeenLastCalledWith(prisma, TASK, {
      ...actorOf(40),
      via: 'TELEGRAM',
    });
    expect(tasks.updateStep).toHaveBeenCalledWith(
      TASK,
      STEP,
      { done: true },
      { ...actorOf(40), via: 'TELEGRAM' },
    );
    expect(labels(tick.editMessageText.mock.calls[0][1])[0]).toEqual([
      '✓ 1. Matn qoralamasi',
    ]);

    const back = press(`tk:back:${TASK}`, 'Kichik qadamlar · 1/1\n…');
    await handler.onAction(back);
    expect(back.editMessageText.mock.calls[0][0].split('\n')[0]).toBe(
      '<b>Oktabr banneri</b>',
    );
  });

  it("a step of somebody else's task: refused before the toggle", async () => {
    tasks.loadForAccess.mockRejectedValue(
      new NotFoundException('Topshiriq topilmadi'),
    );
    const ctx = press(`tk:step:${STEP}`, 'Kichik qadamlar · 0/1\n…');
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS, {
      show_alert: true,
    });
    expect(tasks.updateStep).not.toHaveBeenCalled();
  });

  it('a step that is gone', async () => {
    prisma.taskStep.findUnique.mockResolvedValue(null);
    const ctx = press(`tk:step:${STEP}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Qadam topilmadi', {
      show_alert: true,
    });
  });

  it("«Topshiriqlarim»: my open assigned tasks except «Dars bo'ldimi?», numbered", async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: 'a', title: 'Kassa', dueAt: null },
      { id: 'b', title: 'Banner', dueAt: null },
    ]);
    prisma.task.count.mockResolvedValue(2);
    const ctx = press('tk:list', 'Xodim kabinetingiz');
    await handler.onAction(ctx);
    const where = {
      companyId: 1,
      status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] },
      kind: { not: 'LESSON_QUESTION' },
      participants: { some: { userId: 40, role: 'ASSIGNEE' } },
    };
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [
        { dueAt: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
      take: 10,
      select: { id: true, title: true, dueAt: true },
    });
    expect(prisma.task.count).toHaveBeenCalledWith({ where });
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();
    const [text, extra] = ctx.reply.mock.calls[0];
    expect(text.split('\n')[0]).toBe('<b>Ochiq topshiriqlar: 2</b>');
    expect(labels(extra)).toEqual([['1', '2']]);
  });

  it('a number from the list sends the task card and remembers it', async () => {
    const ctx = press(`tk:show:${TASK}`, 'Ochiq topshiriqlar: 1\n…');
    await handler.onAction(ctx);
    const [text] = ctx.reply.mock.calls[0];
    expect(text.split('\n')[0]).toBe('<b>Oktabr banneri</b>');
    expect(sender.record).toHaveBeenCalledWith(
      '700',
      9,
      expect.objectContaining({ id: TASK }),
      40,
      'NOTICE',
    );
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it("a number for a task that is not mine any more: only the answer, the list's keyboard stays", async () => {
    tasks.loadForAccess.mockRejectedValue(
      new NotFoundException('Topshiriq topilmadi'),
    );
    const ctx = press(`tk:show:${TASK}`, 'Ochiq topshiriqlar: 1\n…');
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS, {
      show_alert: true,
    });
    expect(ctx.editMessageReplyMarkup).not.toHaveBeenCalled();
    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('junk callback data, or a press outside a private chat: just answered', async () => {
    const ctx = press('tk:nope:1');
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();
    const group = press(`tk:start:${TASK}`);
    group.chat.type = 'group';
    await handler.onAction(group);
    expect(group.answerCbQuery).toHaveBeenCalledWith();
    expect(staffOfChat).not.toHaveBeenCalled();
  });

  it('«message is not modified» is not an error; another edit failure is logged', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      const same = press(`tk:back:${TASK}`, 'Kichik qadamlar · 0/1\n…');
      same.editMessageText.mockRejectedValue(
        new Error(
          '400: Bad Request: message is not modified: specified new message content and reply markup are exactly the same',
        ),
      );
      await handler.onAction(same);
      expect(same.answerCbQuery).toHaveBeenCalledTimes(1);
      expect(same.answerCbQuery).toHaveBeenCalledWith();
      expect(warn).not.toHaveBeenCalled();

      const gone = press(`tk:back:${TASK}`, 'Kichik qadamlar · 0/1\n…');
      gone.editMessageText.mockRejectedValue(
        new Error("400: Bad Request: message can't be edited"),
      );
      await handler.onAction(gone);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("message can't be edited");
    } finally {
      warn.mockRestore();
    }
  });

  it('an unexpected error never escapes the handler', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    tasks.changeStatus.mockRejectedValue(new Error('db down'));
    const ctx = press(`tk:start:${TASK}`);
    await expect(handler.onAction(ctx)).resolves.toBeUndefined();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(TRY_LATER);
    expect(error).toHaveBeenCalledWith('task button failed: db down');
    error.mockRestore();
  });
});
