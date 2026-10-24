import { ONLY_GIVER_REVIEWS } from '../task-transitions';
import { loadTaskView, staffOfChat } from './task-telegram-view';
import { TaskTelegramHandler } from './task-telegram.handler';
import {
  NOT_IN_REVIEW,
  RETURN_PROMPT,
  type TgTaskView,
} from './task-telegram-text';

// The «Qaytarish» prompt (spec §6.2); the buttons are in
// `task-telegram.handler.spec.ts`, the replies in `task-telegram-replies.spec.ts`.
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
  history: [],
  ...over,
});

function press(data: string) {
  return {
    chat: { id: 700, type: 'private' },
    callbackQuery: {
      data,
      message: { message_id: 5, text: 'Tekshiruvga keldi\nOktabr banneri' },
    },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    editMessageText: jest.fn().mockResolvedValue(true),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({ message_id: 9 }),
  } as any;
}

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
  prisma = { taskTelegramMessage: { findUnique: jest.fn() } };
  tasks = {
    loadActor: jest.fn(),
    loadForAccess: jest.fn().mockResolvedValue({ access: { canManage: true } }),
    review: jest.fn().mockResolvedValue({ assignees: [] }),
    addComment: jest.fn().mockResolvedValue({}),
  };
  sender = {
    openUrl: jest
      .fn()
      .mockReturnValue(`https://lehrer.dafzentrum.uz/tasks?task=${TASK}`),
    record: jest.fn(),
  };
  telegram = { getBot: () => ({}), useBeforeScenes: jest.fn() };
  handler = new TaskTelegramHandler(
    prisma,
    tasks,
    telegram,
    sender,
    {} as never,
  );
  as(40);
  (loadTaskView as jest.Mock).mockResolvedValue(view());
});

afterEach(() => jest.restoreAllMocks());

describe('TaskTelegramHandler — the «Qaytarish» prompt', () => {
  it('«Qaytarish»: asks for the reason as a reply to the pressed card, names the task, remembers the prompt', async () => {
    as(30);
    (loadTaskView as jest.Mock).mockResolvedValue(
      view({ status: 'IN_REVIEW' }),
    );
    const ctx = press(`tk:return:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(
      `${RETURN_PROMPT}\n<b>Oktabr banneri</b>`,
      {
        parse_mode: 'HTML',
        reply_parameters: { message_id: 5, allow_sending_without_reply: true },
        reply_markup: {
          force_reply: true,
          input_field_placeholder: 'Qaytarish sababi',
        },
      },
    );
    expect(sender.record).toHaveBeenCalledWith(
      '700',
      9,
      expect.objectContaining({ id: TASK }),
      30,
      'RETURN_PROMPT',
    );
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();
    expect(tasks.review).not.toHaveBeenCalled();
  });

  it('«Qaytarish» prompt: the title is escaped and clipped (it goes out as HTML)', async () => {
    as(30);
    (loadTaskView as jest.Mock).mockResolvedValue(
      view({
        status: 'IN_REVIEW',
        title: `<i>A & B</i> ${'x'.repeat(200)}`,
      }),
    );
    const ctx = press(`tk:return:${TASK}`);
    await handler.onAction(ctx);
    const [text] = ctx.reply.mock.calls[0];
    expect(
      text.startsWith(`${RETURN_PROMPT}\n<b>&lt;i&gt;A &amp; B&lt;/i&gt; x`),
    ).toBe(true);
    expect(text.endsWith('…</b>')).toBe(true);
    expect(text.length).toBeLessThan(RETURN_PROMPT.length + 120);
  });

  it('«Qaytarish» by somebody who may not review: told so, no prompt, the card is redrawn', async () => {
    (loadTaskView as jest.Mock).mockResolvedValue(
      view({ status: 'IN_REVIEW' }),
    );
    tasks.loadForAccess.mockResolvedValue({ access: { canManage: false } });
    const ctx = press(`tk:return:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(ONLY_GIVER_REVIEWS, {
      show_alert: true,
    });
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(sender.record).not.toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
  });

  it('«Qaytarish» on a task no longer in review: says so, asks nothing', async () => {
    as(30);
    (loadTaskView as jest.Mock).mockResolvedValue(view({ status: 'DONE' }));
    const ctx = press(`tk:return:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_IN_REVIEW, {
      show_alert: true,
    });
    expect(ctx.reply).not.toHaveBeenCalled();
  });
});
