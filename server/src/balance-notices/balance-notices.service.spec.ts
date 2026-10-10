import { Test } from '@nestjs/testing';
import { BalanceNoticesService } from './balance-notices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { EntityHistoryService } from '../common/entity-history';

describe('BalanceNoticesService (ADR-0076)', () => {
  let service: BalanceNoticesService;
  let prisma: any;
  let sms: { sendToStudent: jest.Mock };
  let history: { recordStatusChange: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    jest.setSystemTime(new Date('2026-10-10T07:00:00Z')); // Saturday, 12:00 Tashkent
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue({
          firstName: 'Ali',
          balance: 350_000,
          telegramChatId: '555',
        }),
      },
      branch: {
        findUnique: jest.fn().mockResolvedValue({ phone: '901234567' }),
      },
      company: {
        findUnique: jest.fn().mockResolvedValue({ phone: '712000000' }),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      balanceNotice: {
        create: jest.fn(({ data }: any) =>
          Promise.resolve({ id: 'n-1', createdAt: new Date(), ...data }),
        ),
      },
    };
    sms = {
      sendToStudent: jest
        .fn()
        .mockResolvedValue({ id: 'sms-1', status: 'SENT', errorMessage: null }),
    };
    history = { recordStatusChange: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        BalanceNoticesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsService, useValue: sms },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();
    service = module.get(BalanceNoticesService);
  });
  afterEach(() => jest.useRealTimers());

  it('BOT: sends the pinned text through the student SMS log and keeps the message id', async () => {
    await service.create(10001, { channel: 'BOT' }, 7, 1001);

    expect(sms.sendToStudent).toHaveBeenCalledWith(
      10001,
      "Assalomu alaykum, Ali! DaF Sprachzentrum hisobingizda 350 000 so'm qolgan. Uni qaytarib olish uchun 22-noyabrgacha filial raqamiga qo'ng'iroq qiling: +998 90 123 45 67. Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul markaz hisobiga o'tadi. Rahmat!",
      'AUTO',
      7,
      1001,
      { assertCallerBranch: true },
    );
    expect(prisma.balanceNotice.create).toHaveBeenCalledWith({
      data: {
        studentId: 10001,
        companyId: 1001,
        channel: 'BOT',
        amount: 350_000,
        note: null,
        smsMessageId: 'sms-1',
        createdById: 7,
      },
    });
    expect(history.recordStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 10001,
        oldValues: {},
        newValues: {
          status: 'PUL_HAQIDA_XABAR_BERILDI',
          kanal: 'Telegram bot',
          summa: 350_000,
          izoh: null,
        },
      }),
    );
  });

  it.each([
    [
      "Telegram's English reason",
      '403: Forbidden: bot was blocked by the user',
    ],
    ['no reason at all', null],
  ])(
    'BOT: a failed send (%s) is the fixed Uzbek 400, and no notice',
    async (_label, errorMessage) => {
      sms.sendToStudent.mockResolvedValue({
        id: 'sms-2',
        status: 'FAILED',
        errorMessage,
      });
      await expect(
        service.create(10001, { channel: 'BOT' }, 7, 1001),
      ).rejects.toMatchObject({
        status: 400,
        message: "Botga xabar yetmadi — qo'ng'iroq qiling",
      });
      expect(prisma.balanceNotice.create).not.toHaveBeenCalled();
      expect(history.recordStatusChange).not.toHaveBeenCalled();
    },
  );

  it('BOT: no linked chat → call instead, nothing sent', async () => {
    prisma.student.findFirst.mockResolvedValue({
      firstName: 'Ali',
      balance: 350_000,
      telegramChatId: null,
    });
    await expect(
      service.create(10001, { channel: 'BOT' }, 7, 1001),
    ).rejects.toThrow("Telegram bog'lanmagan — qo'ng'iroq qiling");
    expect(sms.sendToStudent).not.toHaveBeenCalled();
  });

  it("BOT: the company's phone stands in for a branch without one; neither → 400", async () => {
    prisma.branch.findUnique.mockResolvedValue({ phone: null });
    await service.create(10001, { channel: 'BOT' }, 7, 1001);
    expect(sms.sendToStudent.mock.calls[0][1]).toContain('+998 71 200 00 00');

    prisma.company.findUnique.mockResolvedValue({ phone: null });
    await expect(
      service.create(10001, { channel: 'BOT' }, 7, 1001),
    ).rejects.toThrow('Filial telefon raqami kiritilmagan');
  });

  it('CALL: writes the notice with its note, sends nothing', async () => {
    await service.create(
      10001,
      { channel: 'CALL', note: 'Ertaga keladi' },
      7,
      1001,
    );
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(prisma.balanceNotice.create.mock.calls[0][0].data).toMatchObject({
      channel: 'CALL',
      note: 'Ertaga keladi',
      smsMessageId: null,
    });
  });

  it('a student with nothing on the balance gets no notice', async () => {
    prisma.student.findFirst.mockResolvedValue({
      firstName: 'Ali',
      balance: 0,
      telegramChatId: '555',
    });
    await expect(
      service.create(10001, { channel: 'CALL' }, 7, 1001),
    ).rejects.toThrow("O'quvchi hisobida pul yo'q");
  });
});
