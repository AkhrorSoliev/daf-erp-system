import { Test, TestingModule } from '@nestjs/testing';
import {
  Prisma,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramDigestAuditService } from './telegram-digest-audit.service';
import { TelegramDigestChatResolverService } from './telegram-digest-chat-resolver.service';
import { TelegramDigestPersonalCronService } from './telegram-digest-personal-cron.service';
import {
  RenderedDigest,
  TelegramDigestRenderService,
} from './telegram-digest-render.service';

type QueuedRow = {
  id: string;
  recipientKind: TelegramDigestRecipientKind;
  recipientId: number;
  companyId: number;
  branchId: number | null;
  category: TelegramDigestCategory;
  relatedEntityId: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
};

const queued = (
  id: string,
  recipientKind: TelegramDigestRecipientKind,
  recipientId: number,
  category: TelegramDigestCategory = TelegramDigestCategory.PAYMENT_RECEIVED,
): QueuedRow => ({
  id,
  recipientKind,
  recipientId,
  companyId: 1001,
  branchId: null,
  category,
  relatedEntityId: null,
  payload: {},
  createdAt: new Date('2026-09-23T10:00:00Z'),
});

/** One block per row id, sized so `chars` decides how many parts it makes. */
const rendered = (ids: string[], chars = 10): RenderedDigest => ({
  blocks: ids.map((id) => ({ text: 'x'.repeat(chars), itemIds: [id] })),
  audit: ids.map((id) => ({
    itemId: id,
    content: `c-${id}`,
    senderUserId: null,
    companyId: 1001,
  })),
  hiddenIds: [],
});

const tgError = (error_code: number, description: string) => ({
  response: { error_code, description },
});

describe('TelegramDigestPersonalCronService', () => {
  let service: TelegramDigestPersonalCronService;
  let findMany: jest.Mock;
  let deleteMany: jest.Mock;
  let studentFindFirst: jest.Mock;
  let sendMessage: jest.Mock;
  let getBot: jest.Mock;
  let resolveChatId: jest.Mock;
  let renderStudent: jest.Mock;
  let renderUser: jest.Mock;
  let record: jest.Mock;

  /** Ids passed to every deleteMany call except the age purge. */
  const deletedIds = () =>
    deleteMany.mock.calls
      .map(([arg]) => arg.where.id?.in as string[] | undefined)
      .filter((ids): ids is string[] => Array.isArray(ids))
      .flat()
      .sort();

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue([]);
    deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    studentFindFirst = jest.fn().mockResolvedValue({ id: 10042 });
    sendMessage = jest.fn().mockResolvedValue({ message_id: 700 });
    getBot = jest.fn().mockReturnValue({ telegram: { sendMessage } });
    resolveChatId = jest.fn().mockResolvedValue('chat-1');
    renderStudent = jest.fn();
    renderUser = jest.fn();
    record = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestPersonalCronService,
        {
          provide: PrismaService,
          useValue: {
            telegramDigestItem: { findMany, deleteMany },
            student: { findFirst: studentFindFirst },
          },
        },
        { provide: TelegramService, useValue: { getBot } },
        {
          provide: TelegramDigestChatResolverService,
          useValue: { resolveChatId },
        },
        {
          provide: TelegramDigestRenderService,
          useValue: { renderStudent, renderUser },
        },
        { provide: TelegramDigestAuditService, useValue: { record } },
      ],
    }).compile();
    service = module.get(TelegramDigestPersonalCronService);
  });

  it('purges rows older than 7 days first, even without a bot', async () => {
    getBot.mockReturnValue(null);
    deleteMany.mockResolvedValueOnce({ count: 3 });
    const warn = jest.spyOn((service as any).logger, 'warn');

    await service.flush();

    const purge = deleteMany.mock.calls[0][0];
    expect(purge.where.recipientKind).toEqual({
      in: [
        TelegramDigestRecipientKind.STUDENT,
        TelegramDigestRecipientKind.USER,
      ],
    });
    expect(purge.where.createdAt.lt).toBeInstanceOf(Date);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('3'));
    expect(findMany).not.toHaveBeenCalled();
  });

  it('sends one message per student, audits it, then deletes every row read', async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 10042),
      queued('s2', TelegramDigestRecipientKind.STUDENT, 10042),
    ]);
    renderStudent.mockResolvedValue(rendered(['s1', 's2']));

    await service.flush();

    expect(findMany).toHaveBeenCalledWith({
      where: {
        recipientKind: {
          in: [
            TelegramDigestRecipientKind.STUDENT,
            TelegramDigestRecipientKind.USER,
          ],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(resolveChatId).toHaveBeenCalledWith('STUDENT', 10042);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('chat-1', expect.any(String), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    expect(record).toHaveBeenCalledWith(
      10042,
      [
        expect.objectContaining({ itemId: 's1' }),
        expect.objectContaining({ itemId: 's2' }),
      ],
      { status: 'SENT', telegramMessageId: 700 },
    );
    expect(deletedIds()).toEqual(['s1', 's2']);
  });

  it('never mixes a student and a staff member who share an id', async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 5),
      queued(
        'u1',
        TelegramDigestRecipientKind.USER,
        5,
        TelegramDigestCategory.TASK_ASSIGNED,
      ),
    ]);
    renderStudent.mockResolvedValue(rendered(['s1']));
    renderUser.mockReturnValue(rendered(['u1']));

    await service.flush();

    expect(renderStudent).toHaveBeenCalledWith(5, [
      expect.objectContaining({ id: 's1' }),
    ]);
    expect(renderUser).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'u1' }),
    ]);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(1); // staff messages leave no SmsMessage
  });

  it('drops rows of a student without Telegram; audits only group notices as FAILED', async () => {
    findMany.mockResolvedValue([
      queued('pay', TelegramDigestRecipientKind.STUDENT, 10042),
      queued(
        'enr',
        TelegramDigestRecipientKind.STUDENT,
        10042,
        TelegramDigestCategory.STUDENT_ENROLLED,
      ),
    ]);
    resolveChatId.mockResolvedValue(null);
    renderStudent.mockResolvedValue(rendered(['enr']));

    await service.flush();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(renderStudent).toHaveBeenCalledWith(10042, [
      expect.objectContaining({ id: 'enr' }),
    ]);
    expect(record).toHaveBeenCalledWith(
      10042,
      [expect.objectContaining({ itemId: 'enr' })],
      { status: 'FAILED', errorMessage: "Telegram bog'lanmagan" },
    );
    expect(deletedIds()).toEqual(['enr', 'pay']);
  });

  it('does not audit a deleted student as "not linked"', async () => {
    findMany.mockResolvedValue([
      queued(
        'enr',
        TelegramDigestRecipientKind.STUDENT,
        10042,
        TelegramDigestCategory.STUDENT_ENROLLED,
      ),
    ]);
    resolveChatId.mockResolvedValue(null);
    studentFindFirst.mockResolvedValue(null); // deleted

    await service.flush();

    expect(record).not.toHaveBeenCalled();
    expect(deletedIds()).toEqual(['enr']);
  });

  it('deletes rows that render to nothing without sending', async () => {
    findMany.mockResolvedValue([
      queued('d1', TelegramDigestRecipientKind.STUDENT, 10042),
    ]);
    renderStudent.mockResolvedValue({
      blocks: [],
      audit: [],
      hiddenIds: ['d1'],
    });

    await service.flush();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(deletedIds()).toEqual(['d1']);
  });

  it('drops rows and audits FAILED on a permanent error', async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 10042),
    ]);
    renderStudent.mockResolvedValue(rendered(['s1']));
    sendMessage.mockRejectedValue(
      tgError(403, 'Forbidden: bot was blocked by the user'),
    );

    await service.flush();

    expect(record).toHaveBeenCalledWith(
      10042,
      [expect.objectContaining({ itemId: 's1' })],
      {
        status: 'FAILED',
        errorMessage: 'Forbidden: bot was blocked by the user',
      },
    );
    expect(deletedIds()).toEqual(['s1']);
  });

  it('keeps rows for the next run on a transient error, without audit', async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 10042),
    ]);
    renderStudent.mockResolvedValue(rendered(['s1']));
    sendMessage.mockRejectedValue(new Error('ETIMEDOUT'));

    await service.flush();

    expect(record).not.toHaveBeenCalled();
    expect(deletedIds()).toEqual([]);
  });

  it('keeps rows and logs an error on a content error', async () => {
    findMany.mockResolvedValue([
      queued('u1', TelegramDigestRecipientKind.USER, 7),
    ]);
    renderUser.mockReturnValue(rendered(['u1']));
    sendMessage.mockRejectedValue(
      tgError(400, "Bad Request: can't parse entities"),
    );
    const error = jest.spyOn((service as any).logger, 'error');

    await service.flush();

    expect(deletedIds()).toEqual([]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("can't parse entities"),
    );
  });

  it('splits a long digest; if part 2 fails only part 1 rows are deleted', async () => {
    findMany.mockResolvedValue([
      queued('a', TelegramDigestRecipientKind.STUDENT, 10042),
      queued('b', TelegramDigestRecipientKind.STUDENT, 10042),
    ]);
    renderStudent.mockResolvedValue(rendered(['a', 'b'], 3000)); // 2 × 3000 chars → 2 parts
    sendMessage
      .mockResolvedValueOnce({ message_id: 1 })
      .mockRejectedValueOnce(new Error('ETIMEDOUT'));

    await service.flush();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      10042,
      [expect.objectContaining({ itemId: 'a' })],
      {
        status: 'SENT',
        telegramMessageId: 1,
      },
    );
    expect(deletedIds()).toEqual(['a']);
  });

  it('retries a failed delete once so a delivered part is not sent again tomorrow', async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 10042),
    ]);
    renderStudent.mockResolvedValue(rendered(['s1']));
    deleteMany
      .mockResolvedValueOnce({ count: 0 }) // age purge
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ count: 1 });

    await service.flush();

    expect(deleteMany).toHaveBeenCalledTimes(3);
    expect(deleteMany.mock.calls[2][0]).toEqual({
      where: { id: { in: ['s1'] } },
    });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('never deletes anything but the rows it read, apart from the age purge', async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 10042),
      queued('s2', TelegramDigestRecipientKind.STUDENT, 10042),
    ]);
    renderStudent.mockResolvedValue({ ...rendered(['s1']), hiddenIds: ['s2'] });

    await service.flush();

    const [purge, ...rest] = deleteMany.mock.calls.map(([arg]) => arg.where);
    expect(Object.keys(purge).sort()).toEqual(['createdAt', 'recipientKind']);
    expect(rest.length).toBeGreaterThan(0);
    for (const where of rest) {
      expect(Object.keys(where)).toEqual(['id']);
      for (const id of where.id.in) expect(['s1', 's2']).toContain(id);
    }
    expect(deletedIds()).toEqual(['s1', 's2']);
  });

  it("isolates recipients: one person's failure does not stop the next", async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 1),
      queued('s2', TelegramDigestRecipientKind.STUDENT, 2),
    ]);
    resolveChatId
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValueOnce('chat-2');
    renderStudent.mockResolvedValue(rendered(['s2']));

    await service.flush();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      'chat-2',
      expect.any(String),
      expect.any(Object),
    );
    expect(deletedIds()).toEqual(['s2']);
  });
});
