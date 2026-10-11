import { BadRequestException } from '@nestjs/common';
import { PHOTO_REQUIRED_MESSAGE } from '../task-transitions';
import { loadTaskView, staffOfChat } from './task-telegram-view';
import { TaskTelegramHandler } from './task-telegram.handler';
import { photoPromptText, type TgTaskView } from './task-telegram-text';

// «Bajardim» on a photo task asks for the photo (spec §6.1); the photo reply
// is in `task-telegram-replies.files.spec.ts`. Fixtures repeat on purpose.

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
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  dueAt: null,
  requiresPhoto: true,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
  steps: [],
  ...over,
});

function press(data: string) {
  return {
    chat: { id: 700, type: 'private' },
    callbackQuery: {
      data,
      message: {
        message_id: 5,
        text: 'Yangi topshiriq · Yuqori\nOktabr banneri',
      },
    },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    editMessageText: jest.fn().mockResolvedValue(true),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({ message_id: 9 }),
  } as any;
}

let handler: TaskTelegramHandler;
let tasks: any;
let sender: any;

beforeEach(() => {
  jest.resetAllMocks();
  tasks = {
    loadActor: jest.fn().mockResolvedValue(actorOf(40)),
    loadForAccess: jest
      .fn()
      .mockResolvedValue({ access: { canManage: false } }),
    changeStatus: jest.fn().mockResolvedValue({}),
  };
  sender = {
    openUrl: jest.fn().mockReturnValue(undefined),
    record: jest.fn(),
  };
  handler = new TaskTelegramHandler(
    {} as never,
    tasks,
    { getBot: () => ({}), useBeforeScenes: jest.fn() } as never,
    sender,
    { onMessage: jest.fn() } as never,
  );
  (staffOfChat as jest.Mock).mockResolvedValue({
    kind: 'one',
    userId: 40,
    companyId: 1,
    roleIds: [4],
  });
  (loadTaskView as jest.Mock).mockResolvedValue(view());
});

describe('TaskTelegramHandler — «Bajardim» on a photo task', () => {
  it('without a fresh photo it asks for one as a reply and records the prompt', async () => {
    tasks.changeStatus.mockRejectedValue(
      new BadRequestException(PHOTO_REQUIRED_MESSAGE),
    );
    const ctx = press(`tk:done:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();
    expect(ctx.reply).toHaveBeenCalledWith(photoPromptText('Oktabr banneri'), {
      parse_mode: 'HTML',
      reply_parameters: { message_id: 5, allow_sending_without_reply: true },
      reply_markup: { force_reply: true, input_field_placeholder: 'Rasm' },
    });
    expect(sender.record).toHaveBeenCalledWith(
      '700',
      9,
      expect.objectContaining({ id: TASK }),
      40,
      'PHOTO_PROMPT',
    );
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it('with a fresh photo the press just moves it to review and redraws the card', async () => {
    const ctx = press(`tk:done:${TASK}`);
    await handler.onAction(ctx);
    expect(tasks.changeStatus).toHaveBeenCalledWith(
      TASK,
      'IN_REVIEW',
      expect.objectContaining({ via: 'TELEGRAM' }),
    );
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalled();
  });

  it('any other refusal keeps the alert and the redraw, no prompt', async () => {
    tasks.changeStatus.mockRejectedValue(
      new BadRequestException('Holat allaqachon shunday'),
    );
    const ctx = press(`tk:done:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Holat allaqachon shunday', {
      show_alert: true,
    });
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(sender.record).not.toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalled();
  });
});
