import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CHAT_NOT_LINKED_MESSAGE,
  CHAT_UNREACHABLE_MESSAGE,
  SEND_FAILED_MESSAGE,
  TelegramStatementService,
} from './telegram-statement.service';

const CHAT = '5550001';

const model = {
  asOf: '2026-09-27',
  student: {
    id: 10001,
    name: 'Ali Valiyev',
    firstName: 'Ali',
    lastName: 'Valiyev',
    groups: ['#036'],
    course: null,
    discountPercent: 0,
    branch: null,
  },
  balance: 0,
  headline: { kind: 'zero', amount: 0, unpaid: [] },
  equation: {
    paid: 0,
    items: [],
    lessons: 0,
    prepaidAhead: 0,
    unexplained: 0,
    balance: 0,
  },
  packEra: null,
  months: [],
  modelChanges: [],
  allocations: [],
};

/** A Telegraf error as the Bot API returns it. */
const telegramError = (error_code: number, description: string) =>
  Object.assign(new Error(description), {
    response: { error_code, description },
  });

describe('TelegramStatementService', () => {
  let bot: {
    telegram: { sendMessage: jest.Mock; sendDocument: jest.Mock };
  };
  let telegram: { getBot: jest.Mock };
  let prisma: { student: { findFirst: jest.Mock } };
  let statements: { pdf: jest.Mock };
  let service: TelegramStatementService;

  beforeEach(() => {
    bot = {
      telegram: {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
        sendDocument: jest.fn().mockResolvedValue({ message_id: 2 }),
      },
    };
    telegram = { getBot: jest.fn().mockReturnValue(bot) };
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({ telegramChatId: CHAT }),
      },
    };
    statements = {
      pdf: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('%PDF-1.3'), model }),
    };
    service = new TelegramStatementService(
      telegram as never,
      prisma as never,
      statements as never,
    );
  });

  it("sends the bot's answer and the PDF to the chat linked to the card", async () => {
    await service.sendToLinkedChat(10001, 1001);

    expect(prisma.student.findFirst).toHaveBeenCalledWith({
      where: { id: 10001, companyId: 1001, deletedAt: null },
      select: { telegramChatId: true },
    });
    expect(statements.pdf).toHaveBeenCalledWith(10001, 1001);
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      CHAT,
      // The student's voice, as the bot speaks — not the admin wording.
      expect.stringMatching(/^Ali Valiyev · ID 10001\n💳 Qarzingiz yo'q\./),
    );
    expect(bot.telegram.sendDocument).toHaveBeenCalledWith(CHAT, {
      source: Buffer.from('%PDF-1.3'),
      filename: 'Valiyev-A-10001-27-09-2026.pdf',
    });
    // The answer first, the file after it — as «💳 To'lovlar» does.
    expect(bot.telegram.sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
      bot.telegram.sendDocument.mock.invocationCallOrder[0],
    );
  });

  it('says so when the bot is not running', async () => {
    telegram.getBot.mockReturnValue(undefined);
    await expect(service.sendToLinkedChat(10001, 1001)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(statements.pdf).not.toHaveBeenCalled();
  });

  it('refuses a card of another company, or an archived one', async () => {
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(service.sendToLinkedChat(10001, 2)).rejects.toThrow(
      NotFoundException,
    );
    expect(statements.pdf).not.toHaveBeenCalled();
  });

  it('builds nothing for a card with no linked chat', async () => {
    prisma.student.findFirst.mockResolvedValue({ telegramChatId: null });
    await expect(service.sendToLinkedChat(10001, 1001)).rejects.toThrow(
      new ConflictException(CHAT_NOT_LINKED_MESSAGE),
    );
    expect(statements.pdf).not.toHaveBeenCalled();
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('asks the student to restart the bot when the chat refuses it', async () => {
    bot.telegram.sendMessage.mockRejectedValue(
      telegramError(403, 'Forbidden: bot was blocked by the user'),
    );
    await expect(service.sendToLinkedChat(10001, 1001)).rejects.toThrow(
      new ConflictException(CHAT_UNREACHABLE_MESSAGE),
    );
    expect(bot.telegram.sendDocument).not.toHaveBeenCalled();
  });

  it('reports any other failure as a failed send', async () => {
    bot.telegram.sendDocument.mockRejectedValue(
      telegramError(500, 'Internal Server Error'),
    );
    await expect(service.sendToLinkedChat(10001, 1001)).rejects.toThrow(
      new BadGatewayException(SEND_FAILED_MESSAGE),
    );
  });
});
