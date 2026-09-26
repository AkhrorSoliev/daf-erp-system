import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { StudentLeadOriginService } from '../common/student-origin';
import { StatementService } from '../statements/statement.service';
import { EntityHistoryService } from '../common/entity-history';
import { PaymentLinkService } from '../payment-gateways/payment-link.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from '../users/users.service';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { TelegramService } from './telegram.service';

/**
 * CEO, 2026-09-25: only those who paid get their mock results. The bot hands
 * results out three ways, and each must leave out a registration that still
 * owes its fee: the broadcast after the announcement, the «Mock natijalari»
 * list, and the PDF behind one of its buttons.
 */
describe('TelegramService — mock results go to those who paid', () => {
  type Row = {
    id: string;
    examId: string;
    publicId: number;
    telegramChatId: string | null;
    deletedAt: Date | null;
    resultSentAt: Date | null;
    paid: boolean;
    feeAmount: number | null;
    exam: {
      id: string;
      title: string;
      status: string;
      deletedAt: Date | null;
      price: number;
      examDate: Date | null;
      resultsPdfFileKey: string | null;
    };
  };

  const EXAM = {
    id: 'exam-1',
    title: 'Mock 2.0 Sentabr',
    status: 'ANNOUNCED',
    deletedAt: null,
    price: 55000,
    examDate: new Date('2026-09-30T00:00:00.000Z'),
    resultsPdfFileKey: 'https://files.example/results.pdf',
  };
  const reg = (id: string, chat: string, over: Partial<Row> = {}): Row => ({
    id,
    examId: EXAM.id,
    publicId: 20000 + Number(chat),
    telegramChatId: chat,
    deletedAt: null,
    resultSentAt: null,
    paid: false,
    feeAmount: 55000,
    exam: EXAM,
    ...over,
  });

  const paid = reg('paid', '1', { paid: true });
  const unpaid = reg('unpaid', '2');
  const free = reg('free', '3', { feeAmount: 0 });

  /**
   * Evaluates a Prisma `where` against in-memory rows, for the operators these
   * queries use: equality, `null`, `{ not }`, a relation object, AND and OR.
   */
  function matches(row: Record<string, unknown>, where: object): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'AND') {
        return (cond as object[]).every((w) => matches(row, w));
      }
      if (key === 'OR') return (cond as object[]).some((w) => matches(row, w));
      const value = row[key];
      if (cond === null) return value === null;
      if (typeof cond === 'object' && !(cond instanceof Date)) {
        if ('not' in cond) {
          return (cond as { not: unknown }).not === null
            ? value !== null
            : value !== (cond as { not: unknown }).not;
        }
        return matches(value as Record<string, unknown>, cond);
      }
      return value === cond;
    });
  }

  let rows: Row[];
  let service: TelegramService;
  let sendDocument: jest.Mock;

  beforeEach(async () => {
    rows = [paid, unpaid, free];
    const prisma = {
      mockExam: { findFirst: jest.fn().mockResolvedValue(EXAM) },
      mockExamParticipant: {
        findMany: jest.fn(({ where }: { where: object }) =>
          Promise.resolve(
            rows.filter((r) =>
              matches(r as unknown as Record<string, unknown>, where),
            ),
          ),
        ),
        findFirst: jest.fn(({ where }: { where: object }) =>
          Promise.resolve(
            rows.find((r) =>
              matches(r as unknown as Record<string, unknown>, where),
            ) ?? null,
          ),
        ),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    // The bot is built in `onModuleInit`, which `compile()` does not run, so
    // everything but Prisma can be an empty stand-in.
    const module = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: RedisService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: EntityHistoryService, useValue: {} },
        { provide: PaymentLinkService, useValue: {} },
        { provide: TelegramChannelGateStatsService, useValue: {} },
        { provide: StudentLeadOriginService, useValue: {} },
        { provide: StatementService, useValue: {} },
      ],
    }).compile();
    service = module.get(TelegramService);

    sendDocument = jest.fn().mockResolvedValue({ message_id: 7 });
    (service as unknown as { bot: unknown }).bot = {
      telegram: { sendDocument },
    };
  });

  const ctx = () => ({
    reply: jest.fn().mockResolvedValue({}),
    replyWithDocument: jest.fn().mockResolvedValue({}),
  });

  it('the announcement broadcast skips a registration that has not paid', async () => {
    const result = await service.broadcastMockResults(EXAM.id);

    const chats = sendDocument.mock.calls.map(([chatId]) => chatId as string);
    expect(chats.sort()).toEqual(['1', '3']);
    expect(result.sent).toBe(2);
  });

  it('«Mock natijalari» does not list an exam the person has not paid for', async () => {
    const c = ctx();
    await (
      service as unknown as {
        showMockResultsMenu: (c: unknown, chatId: string) => Promise<void>;
      }
    ).showMockResultsMenu(c, '2');

    const [text] = c.reply.mock.calls[0] as [string];
    expect(text).toContain("e'lon qilingan mock imtihonlar yo'q");
  });

  it('«Mock natijalari» lists it for someone who paid', async () => {
    const c = ctx();
    await (
      service as unknown as {
        showMockResultsMenu: (c: unknown, chatId: string) => Promise<void>;
      }
    ).showMockResultsMenu(c, '1');

    const [text] = c.reply.mock.calls[0] as [string];
    expect(text).toContain('Qaysi imtihon natijasini');
  });

  it('the PDF button refuses someone who has not paid', async () => {
    const c = ctx();
    await (
      service as unknown as {
        sendMockResultPdf: (
          c: unknown,
          chatId: string,
          examId: string,
        ) => Promise<void>;
      }
    ).sendMockResultPdf(c, '2', EXAM.id);

    expect(c.replyWithDocument).not.toHaveBeenCalled();
    const [text] = c.reply.mock.calls[0] as [string];
    expect(text).toContain("to'lov qilganlarga");
  });

  it('the PDF button finds the paid registration when one chat has two', async () => {
    // A parent registers two children from one Telegram; one of them paid.
    rows = [
      reg('child-unpaid', '5'),
      reg('child-paid', '5', { paid: true, publicId: 20099 }),
    ];
    const c = ctx();
    await (
      service as unknown as {
        sendMockResultPdf: (
          c: unknown,
          chatId: string,
          examId: string,
        ) => Promise<void>;
      }
    ).sendMockResultPdf(c, '5', EXAM.id);

    expect(c.replyWithDocument).toHaveBeenCalledTimes(1);
    const [, extra] = c.replyWithDocument.mock.calls[0] as [
      unknown,
      { caption: string },
    ];
    expect(extra.caption).toContain('20099');
  });

  it('the PDF button says the person is not registered when they are not', async () => {
    const c = ctx();
    await (
      service as unknown as {
        sendMockResultPdf: (
          c: unknown,
          chatId: string,
          examId: string,
        ) => Promise<void>;
      }
    ).sendMockResultPdf(c, '9', EXAM.id);

    const [text] = c.reply.mock.calls[0] as [string];
    expect(text).toContain('ishtirokingiz topilmadi');
  });

  it('the PDF button sends the results to someone who paid', async () => {
    const c = ctx();
    await (
      service as unknown as {
        sendMockResultPdf: (
          c: unknown,
          chatId: string,
          examId: string,
        ) => Promise<void>;
      }
    ).sendMockResultPdf(c, '1', EXAM.id);

    expect(c.replyWithDocument).toHaveBeenCalledTimes(1);
  });
});
