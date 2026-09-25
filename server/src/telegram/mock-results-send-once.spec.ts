import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { StudentLeadOriginService } from '../common/student-origin';
import { EntityHistoryService } from '../common/entity-history';
import { PaymentLinkService } from '../payment-gateways/payment-link.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from '../users/users.service';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { TelegramService } from './telegram.service';

/**
 * A results broadcast walks the recipients one Telegram call at a time, so it
 * runs for a while. Nothing stopped a second broadcast of the same exam from
 * starting meanwhile — two admins pressing «PDF yaratib yuborish», two tabs,
 * or a direct API call — and each would send to everyone the other had not
 * reached yet. A participant must get one message per broadcast request.
 */
describe('TelegramService.broadcastMockResults — one message per participant', () => {
  type Row = {
    id: string;
    examId: string;
    publicId: number;
    telegramChatId: string | null;
    deletedAt: Date | null;
    resultSentAt: Date | null;
    resultMessageId: string | null;
    resultSendError: string | null;
    paid: boolean;
    feeAmount: number | null;
    exam: { price: number };
  };

  const EXAM = {
    id: 'exam-1',
    title: 'Mock 2.0 Sentabr',
    status: 'ANNOUNCED',
    resultsPdfFileKey: 'https://files.example/results.pdf',
  };

  /** Equality, `null`, `{ not: null }`, a relation object, AND and OR. */
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
  let sent: string[];

  const tick = () => new Promise((r) => setTimeout(r, 5));

  beforeEach(async () => {
    rows = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i + 1}`,
      examId: EXAM.id,
      publicId: 20001 + i,
      telegramChatId: String(i + 1),
      deletedAt: null,
      resultSentAt: null,
      resultMessageId: null,
      resultSendError: null,
      paid: true,
      feeAmount: 55000,
      exam: { price: 55000 },
    }));
    const pick = (where: object) =>
      rows.filter((r) =>
        matches(r as unknown as Record<string, unknown>, where),
      );
    const prisma = {
      mockExam: { findFirst: jest.fn().mockResolvedValue(EXAM) },
      mockExamParticipant: {
        findMany: jest.fn(async ({ where }: { where: object }) => {
          await tick();
          return pick(where).map((r) => ({ ...r }));
        }),
        update: jest.fn(
          async ({ where, data }: { where: { id: string }; data: object }) => {
            await tick();
            Object.assign(rows.find((r) => r.id === where.id)!, data);
            return {};
          },
        ),
        updateMany: jest.fn(
          async ({ where, data }: { where: object; data: object }) => {
            const hit = pick(where);
            hit.forEach((r) => Object.assign(r, data));
            return { count: hit.length };
          },
        ),
      },
    };

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
      ],
    }).compile();
    service = module.get(TelegramService);

    sent = [];
    (service as unknown as { bot: unknown }).bot = {
      telegram: {
        sendDocument: jest.fn(async (chatId: string) => {
          await tick();
          sent.push(chatId);
          return { message_id: sent.length };
        }),
      },
    };
  });

  const perChat = () =>
    sent.reduce<Record<string, number>>((acc, c) => {
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});

  it('two broadcasts at the same time send each participant one message', async () => {
    await Promise.all([
      service.broadcastMockResults(EXAM.id),
      service.broadcastMockResults(EXAM.id),
    ]);

    expect(Object.values(perChat())).toEqual([1, 1, 1, 1, 1, 1]);
    expect(rows.every((r) => r.resultSentAt !== null)).toBe(true);
  });

  it('a message that went out stays sent even if its id cannot be stored', async () => {
    const participant = (
      service as unknown as { prisma: { mockExamParticipant: any } }
    ).prisma.mockExamParticipant;
    participant.update.mockRejectedValueOnce(new Error('connection reset'));

    await service.broadcastMockResults(EXAM.id);
    await service.broadcastMockResults(EXAM.id);

    expect(Object.values(perChat())).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('a failed send is left for the next broadcast', async () => {
    const telegram = (service as unknown as { bot: { telegram: any } }).bot
      .telegram;
    telegram.sendDocument.mockImplementationOnce(async () => {
      throw new Error('chat not found');
    });

    const result = await service.broadcastMockResults(EXAM.id);

    expect(result).toEqual(expect.objectContaining({ sent: 5, failed: 1 }));
    const failed = rows.filter((r) => r.resultSentAt === null);
    expect(failed).toHaveLength(1);
    expect(failed[0].resultSendError).toBe('chat not found');
  });
});
