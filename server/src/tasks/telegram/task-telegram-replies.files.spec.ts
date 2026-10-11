import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { downloadFile } from '../../telegram/utils/download.util';
import {
  FILE_SIZE_MESSAGE,
  FILE_TYPE_MESSAGE,
  FILES_OFF_MESSAGE,
} from '../task-file-rules';
import { UNSUPPORTED_MEDIA } from './task-telegram-media';
import { TaskTelegramReplies } from './task-telegram-replies';
import {
  ADDED_TO_TASK,
  PHOTO_SENT,
  PHOTO_STILL_NEEDED,
  RETURN_TEXT_ONLY,
  TRY_LATER,
} from './task-telegram-text';
import { loadTaskView, staffOfChat } from './task-telegram-view';
import type { TgTaskView } from './task-telegram-text';

// File, photo and voice replies (spec §6.2); the text replies are in
// `task-telegram-replies.spec.ts`. The fixtures repeat there on purpose.

jest.mock('./task-telegram-view', () => ({
  ...jest.requireActual('./task-telegram-view'),
  loadTaskView: jest.fn(),
  staffOfChat: jest.fn(),
}));
jest.mock('../../telegram/utils/download.util', () => ({
  downloadFile: jest.fn(),
}));

const TASK = '0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10';
const MB = 1024 * 1024;
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

let replies: TaskTelegramReplies;
let prisma: any;
let tasks: any;
let files: any;

const mute = (level: 'warn' | 'error') =>
  jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);

const message = (msg: any) => {
  const ctx = {
    chat: { id: 700, type: 'private' },
    message: msg,
    reply: jest.fn().mockResolvedValue({ message_id: 12 }),
    telegram: {
      getFileLink: jest.fn().mockResolvedValue({
        href: 'https://api.telegram.org/file/botTOKEN/x',
      }),
    },
  };
  return ctx as any;
};
const reply = (purpose: string, media: object) => {
  prisma.taskTelegramMessage.findUnique.mockResolvedValue({
    taskId: TASK,
    purpose,
  });
  return message({
    message_id: 11,
    reply_to_message: { message_id: 5 },
    ...media,
  });
};
const PHOTO = { photo: [{ file_id: 's', file_size: 10 }, { file_id: 'L' }] };

beforeEach(() => {
  jest.resetAllMocks();
  prisma = { taskTelegramMessage: { findUnique: jest.fn() } };
  tasks = {
    loadActor: jest.fn().mockResolvedValue(actorOf(40)),
    loadForAccess: jest.fn().mockResolvedValue({ access: { canManage: true } }),
    addComment: jest.fn().mockResolvedValue({}),
    changeStatus: jest.fn().mockResolvedValue({}),
    review: jest.fn(),
  };
  files = { upload: jest.fn().mockResolvedValue({ file: { kind: 'IMAGE' } }) };
  (downloadFile as jest.Mock).mockResolvedValue(Buffer.from('img'));
  (staffOfChat as jest.Mock).mockResolvedValue({
    kind: 'one',
    userId: 40,
    companyId: 1,
    roleIds: [4],
  });
  (loadTaskView as jest.Mock).mockResolvedValue(view());
  replies = new TaskTelegramReplies(prisma, tasks, files);
});

afterEach(() => jest.restoreAllMocks());

describe('TaskTelegramReplies — files, photos, voice (spec §6.2)', () => {
  const next = jest.fn();

  it('a photo on a notice: the largest size is stored as the staff, via TELEGRAM', async () => {
    const ctx = reply('NOTICE', PHOTO);
    await replies.onMessage(ctx, next);
    expect(ctx.telegram.getFileLink).toHaveBeenCalledWith('L');
    expect(downloadFile).toHaveBeenCalledWith(
      'https://api.telegram.org/file/botTOKEN/x',
    );
    expect(files.upload).toHaveBeenCalledWith(
      TASK,
      { buffer: Buffer.from('img'), name: 'rasm.jpg', durationSec: undefined },
      expect.objectContaining({ via: 'TELEGRAM' }),
    );
    expect(ctx.reply).toHaveBeenCalledWith(ADDED_TO_TASK);
    expect(tasks.changeStatus).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('a voice message keeps its length and name', async () => {
    const ctx = reply('NOTICE', { voice: { file_id: 'o', duration: 42 } });
    await replies.onMessage(ctx, next);
    expect(files.upload).toHaveBeenCalledWith(
      TASK,
      expect.objectContaining({ name: 'ovozli-xabar.ogg', durationSec: 42 }),
      expect.anything(),
    );
  });

  it('a caption becomes a comment, after the file', async () => {
    const ctx = reply('NOTICE', { ...PHOTO, caption: ' Mana chek ' });
    await replies.onMessage(ctx, next);
    expect(tasks.addComment).toHaveBeenCalledWith(
      TASK,
      'Mana chek',
      expect.objectContaining({ via: 'TELEGRAM' }),
    );
    expect(files.upload.mock.invocationCallOrder[0]).toBeLessThan(
      tasks.addComment.mock.invocationCallOrder[0],
    );
  });

  describe('the photo prompt', () => {
    it('a photo reply stores the photo, then sends the task to review', async () => {
      const ctx = reply('PHOTO_PROMPT', PHOTO);
      await replies.onMessage(ctx, next);
      expect(files.upload).toHaveBeenCalledTimes(1);
      expect(tasks.changeStatus).toHaveBeenCalledWith(
        TASK,
        'IN_REVIEW',
        expect.objectContaining({ via: 'TELEGRAM' }),
      );
      expect(files.upload.mock.invocationCallOrder[0]).toBeLessThan(
        tasks.changeStatus.mock.invocationCallOrder[0],
      );
      expect(ctx.reply).toHaveBeenCalledWith(PHOTO_SENT);
    });

    it('a refused move still reports the stored photo, with the reason', async () => {
      tasks.changeStatus.mockRejectedValue(
        new BadRequestException('Holat allaqachon shunday'),
      );
      const ctx = reply('PHOTO_PROMPT', PHOTO);
      await replies.onMessage(ctx, next);
      expect(ctx.reply).toHaveBeenCalledWith(
        "Topshiriqqa qo'shildi. Holat allaqachon shunday",
      );
    });

    it('a document is stored but does not send the task to review', async () => {
      files.upload.mockResolvedValue({ file: { kind: 'DOCUMENT' } });
      const ctx = reply('PHOTO_PROMPT', { document: { file_id: 'd' } });
      await replies.onMessage(ctx, next);
      expect(ctx.reply).toHaveBeenCalledWith(PHOTO_STILL_NEEDED);
      expect(tasks.changeStatus).not.toHaveBeenCalled();
    });
  });

  it('a file replying to the «Qaytarish» prompt: the reason is text, nothing downloaded or stored', async () => {
    const ctx = reply('RETURN_PROMPT', { document: { file_id: 'd' } });
    await replies.onMessage(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith(RETURN_TEXT_ONLY);
    expect(ctx.telegram.getFileLink).not.toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
    expect(files.upload).not.toHaveBeenCalled();
    expect(tasks.review).not.toHaveBeenCalled();
  });

  it('refused before anything is fetched: over 20 MB, a sticker, a music track, a round video', async () => {
    const big = reply('NOTICE', {
      document: { file_id: 'd', file_size: 21 * MB },
    });
    await replies.onMessage(big, next);
    expect(big.reply).toHaveBeenCalledWith(FILE_SIZE_MESSAGE);
    for (const media of [
      { sticker: { file_id: 's' } },
      { audio: { file_id: 'a' } },
      { video_note: { file_id: 'n' } },
    ]) {
      const ctx = reply('NOTICE', media);
      await replies.onMessage(ctx, next);
      expect(ctx.reply).toHaveBeenCalledWith(UNSUPPORTED_MEDIA);
      expect(ctx.telegram.getFileLink).not.toHaveBeenCalled();
    }
    expect(big.telegram.getFileLink).not.toHaveBeenCalled();
    expect(staffOfChat).not.toHaveBeenCalled();
    expect(files.upload).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('Telegram itself says the file is too big (no file_size in the update): the size message', async () => {
    const ctx = reply('NOTICE', PHOTO);
    ctx.telegram.getFileLink.mockRejectedValue(
      new Error('400: Bad Request: file is too big'),
    );
    await replies.onMessage(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith(FILE_SIZE_MESSAGE);
    expect(files.upload).not.toHaveBeenCalled();
  });

  it('the service refuses the file → its message; files switched off → that message', async () => {
    files.upload.mockRejectedValueOnce(
      new BadRequestException(FILE_TYPE_MESSAGE),
    );
    const a = reply('NOTICE', { document: { file_id: 'd' } });
    await replies.onMessage(a, next);
    expect(a.reply).toHaveBeenCalledWith(FILE_TYPE_MESSAGE);

    files.upload.mockRejectedValueOnce(
      new ServiceUnavailableException(FILES_OFF_MESSAGE),
    );
    const b = reply('NOTICE', PHOTO);
    await replies.onMessage(b, next);
    expect(b.reply).toHaveBeenCalledWith(FILES_OFF_MESSAGE);
    expect(tasks.changeStatus).not.toHaveBeenCalled();
  });

  it('a failed download: «try later», and the bot token is nowhere in the log', async () => {
    const error = mute('error');
    (downloadFile as jest.Mock).mockRejectedValue(
      new Error('File download failed: HTTP 404'),
    );
    const ctx = reply('NOTICE', PHOTO);
    await replies.onMessage(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith(TRY_LATER);
    expect(files.upload).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).not.toContain('botTOKEN');
    expect(String(error.mock.calls[0][0])).toContain('HTTP 404');
  });
});
