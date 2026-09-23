import { Test, TestingModule } from '@nestjs/testing';
import { SmsMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { TelegramDigestAuditService } from './telegram-digest-audit.service';
import { AuditEntry } from './telegram-digest-render.service';

describe('TelegramDigestAuditService', () => {
  let service: TelegramDigestAuditService;
  let smsCreate: jest.Mock;
  let recordCreate: jest.Mock;

  const entry = (itemId: string, senderUserId: number | null): AuditEntry => ({
    itemId,
    content: "• <b>100 000 so'm</b> to'lovingiz qabul qilindi (Naqd)",
    senderUserId,
    companyId: 1001,
  });

  beforeEach(async () => {
    smsCreate = jest.fn().mockResolvedValue({});
    recordCreate = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestAuditService,
        {
          provide: PrismaService,
          useValue: { smsMessage: { create: smsCreate } },
        },
        { provide: EntityHistoryService, useValue: { recordCreate } },
      ],
    }).compile();
    service = module.get(TelegramDigestAuditService);
  });

  it('writes one SENT SmsMessage and one history entry per event, sharing the message id', async () => {
    await service.record(10042, [entry('r1', 99), entry('r2', null)], {
      status: 'SENT',
      telegramMessageId: 555,
    });

    expect(smsCreate).toHaveBeenCalledTimes(2);
    expect(smsCreate).toHaveBeenCalledWith({
      data: {
        studentId: 10042,
        content: "• <b>100 000 so'm</b> to'lovingiz qabul qilindi (Naqd)",
        type: SmsMessageType.AUTO,
        status: 'SENT',
        senderUserId: 99,
        telegramMessageId: 555,
        errorMessage: null,
        companyId: 1001,
      },
    });
    expect(recordCreate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 10042,
      newValues: {
        action: 'SMS_YUBORILDI',
        tur: 'Avtomatik',
        xabar: "• 100 000 so'm to'lovingiz qabul qilindi (Naqd)",
        holat: 'Yuborildi',
      },
      changedById: 99,
      companyId: 1001,
    });
  });

  it('writes FAILED rows with the error message', async () => {
    await service.record(10042, [entry('r1', null)], {
      status: 'FAILED',
      errorMessage: "Telegram bog'lanmagan",
    });

    expect(smsCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        telegramMessageId: null,
        errorMessage: "Telegram bog'lanmagan",
      }),
    });
    expect(recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({
          action: 'SMS_YUBORILMADI',
          holat: "Telegram bog'lanmagan",
        }),
        changedById: undefined,
      }),
    );
  });

  it('stores readable text: entities are decoded for the SMS tab and history', async () => {
    await service.record(
      10042,
      [
        {
          itemId: 'r1',
          content: '📚 Guruh: <b>A1 &amp; &lt;B&gt;</b>',
          senderUserId: null,
          companyId: 1001,
        },
      ],
      { status: 'SENT', telegramMessageId: 7 },
    );

    expect(smsCreate.mock.calls[0][0].data.content).toBe(
      '📚 Guruh: <b>A1 & <B></b>',
    );
    expect(recordCreate.mock.calls[0][0].newValues.xabar).toBe(
      '📚 Guruh: A1 & <B>',
    );
  });

  it('keeps going when one write fails and never throws', async () => {
    smsCreate.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.record(10042, [entry('r1', null), entry('r2', null)], {
        status: 'SENT',
        telegramMessageId: 1,
      }),
    ).resolves.toBeUndefined();
    expect(smsCreate).toHaveBeenCalledTimes(2);
  });
});
