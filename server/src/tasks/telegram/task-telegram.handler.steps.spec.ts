import { Logger } from '@nestjs/common';
import { loadTaskView, staffOfChat } from './task-telegram-view';
import { TaskTelegramHandler } from './task-telegram.handler';
import { TRY_LATER, type TgTaskView } from './task-telegram-text';

// The step tick (spec §6.4). Split off task-telegram.handler.spec.ts, which is
// at the 500-line limit; the fixtures repeat there on purpose (see the note in
// `task-telegram.handler.replies.spec.ts`).

jest.mock('./task-telegram-view', () => ({
  ...jest.requireActual('./task-telegram-view'),
  loadTaskView: jest.fn(),
  staffOfChat: jest.fn(),
}));

const TASK = '0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10';
const STEP = '6c1f2a9d-1d1b-4f3e-8f43-2b7c0e9d5a21';
const actor = {
  userId: 40,
  companyId: 1,
  roleIds: [4],
  roleNames: ['Teacher'],
  scope: { kind: 'branches' as const, branchIds: [1] },
  headerBranchId: null,
};
const view = (): TgTaskView => ({
  id: TASK,
  companyId: 1,
  kind: 'MANUAL',
  title: 'Oktabr banneri',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  dueAt: null,
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
  steps: [{ id: STEP, title: 'Matn qoralamasi', done: false }],
});

function tick() {
  return {
    chat: { id: 700, type: 'private' },
    callbackQuery: {
      data: `tk:step:${STEP}`,
      message: { message_id: 5, text: 'Kichik qadamlar · 0/1\n…' },
    },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    editMessageText: jest.fn().mockResolvedValue(true),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({ message_id: 9 }),
  } as any;
}

let handler: TaskTelegramHandler;
let tasks: any;
let error: jest.SpyInstance;

beforeEach(() => {
  jest.resetAllMocks();
  const prisma = {
    taskStep: { findUnique: jest.fn().mockResolvedValue({ taskId: TASK }) },
  };
  tasks = {
    loadActor: jest.fn().mockResolvedValue(actor),
    loadForAccess: jest.fn().mockResolvedValue({ access: { canManage: true } }),
    updateStep: jest.fn().mockResolvedValue({}),
  };
  (staffOfChat as jest.Mock).mockResolvedValue({
    kind: 'one',
    userId: 40,
    companyId: 1,
    roleIds: [4],
  });
  handler = new TaskTelegramHandler(
    prisma as any,
    tasks,
    { getBot: () => ({}), useBeforeScenes: jest.fn() } as any,
    { openUrl: jest.fn(), record: jest.fn() } as any,
  );
  error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
});

afterEach(() => error.mockRestore());

describe('TaskTelegramHandler — a step tick that is already saved', () => {
  it('a failing redraw is logged and never answers «try again» (a second press would un-tick it)', async () => {
    // 1st read: the access check before the write; 2nd: the redraw after it.
    (loadTaskView as jest.Mock)
      .mockResolvedValueOnce(view())
      .mockRejectedValueOnce(new Error('db down'));
    const ctx = tick();
    await handler.onAction(ctx);

    expect(tasks.updateStep).toHaveBeenCalledTimes(1);
    expect(tasks.updateStep).toHaveBeenCalledWith(
      TASK,
      STEP,
      { done: true },
      { ...actor, via: 'TELEGRAM' },
    );
    // The press is answered once, plainly: the tick is saved.
    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();
    expect(ctx.answerCbQuery).not.toHaveBeenCalledWith(TRY_LATER);
    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toBe('step redraw failed: db down');
  });

  it('a tick that did not save still says «try again» (nothing was written, a retry is right)', async () => {
    (loadTaskView as jest.Mock).mockResolvedValue(view());
    tasks.updateStep.mockRejectedValue(new Error('db down'));
    const ctx = tick();
    await handler.onAction(ctx);

    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(TRY_LATER);
    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('task button failed: db down');
  });
});
