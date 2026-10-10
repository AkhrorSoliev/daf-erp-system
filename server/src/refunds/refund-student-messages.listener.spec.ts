import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SmsMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { RefundStudentMessagesListener } from './refund-student-messages.listener';

jest.mock('../receipts/receipt-urls', () => ({
  refundReceiptPdfUrl: (id: string) =>
    `https://api.example.uz/api/receipts/refund/${id}.pdf`,
}));

const S = ' ';

describe('RefundStudentMessagesListener (spec §5.4)', () => {
  let listener: RefundStudentMessagesListener;
  let prisma: any;
  let sendToStudent: jest.Mock;
  let warn: jest.SpyInstance;

  const payload = {
    refundId: 'ref-1',
    studentId: 10001,
    companyId: 1,
    performedById: 7,
  };
  const sentText = () => sendToStudent.mock.calls[0][1] as string;

  beforeEach(async () => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({
          firstName: 'Mohira',
          telegramChatId: '555',
          balance: 0,
        }),
      },
      refund: {
        findFirst: jest.fn().mockResolvedValue({
          approvedAmount: 350_000,
          requestedAmount: 350_000,
          dueDate: new Date('2026-10-22T19:00:00Z'), // 23.10 00:00 Tashkent
          refundMethod: 'CASH',
          handedOverAt: new Date('2026-10-16T08:00:00Z'),
          cancelReason: "o'qishni davom ettiradi",
        }),
      },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 3 }),
      },
      enrollment: { findFirst: jest.fn() },
      branch: {
        findUnique: jest.fn().mockResolvedValue({ phone: '901234567' }),
      },
      company: { findUnique: jest.fn().mockResolvedValue({ phone: null }) },
    };
    sendToStudent = jest.fn().mockResolvedValue({ status: 'SENT' });
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundStudentMessagesListener,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsService, useValue: { sendToStudent } },
      ],
    }).compile();
    listener = module.get(RefundStudentMessagesListener);
  });

  afterEach(() => warn.mockRestore());

  it('request opened: sends the pinned text at once, as an AUTO message by the performer', async () => {
    await listener.onRequested(payload);

    expect(prisma.student.findFirst).toHaveBeenCalledWith({
      where: { id: 10001, deletedAt: null },
      select: { firstName: true, telegramChatId: true, balance: true },
    });
    expect(sendToStudent).toHaveBeenCalledTimes(1);
    expect(sendToStudent).toHaveBeenCalledWith(
      10001,
      expect.any(String),
      SmsMessageType.AUTO,
      7,
      1,
    );
    expect(sentText()).toBe(
      [
        "<b>🔄 Pulni qaytarish so'rovi qabul qilindi</b>",
        '',
        'Hurmatli Mohira!',
        '',
        `Qaytariladigan summa: <b>350${S}000 so'm</b>`,
        'Pul <b>23-oktabrgacha</b> qaytarib beriladi.',
        "Bu summa hisobingizdan ushlab turiladi — joriy balansingiz: <b>0 so'm</b>",
        '',
        "📞 Savol bo'lsa: +998 90 123 45 67",
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('request opened: the branch phone, else the company phone, else no phone line', async () => {
    prisma.branch.findUnique.mockResolvedValue({ phone: null });
    prisma.company.findUnique.mockResolvedValue({ phone: '711112233' });
    await listener.onRequested(payload);
    expect(sentText()).toContain("📞 Savol bo'lsa: +998 71 111 22 33");

    sendToStudent.mockClear();
    prisma.company.findUnique.mockResolvedValue({ phone: null });
    await listener.onRequested(payload);
    expect(sentText()).not.toContain('📞');
    expect(sentText()).not.toContain('\n\n\n');
  });

  it('handed over: cash and card wording, the Tashkent day and the receipt link', async () => {
    await listener.onHandedOver(payload);
    expect(sentText()).toBe(
      [
        '<b>✅ Pulingiz qaytarib berildi</b>',
        '',
        'Hurmatli Mohira!',
        '',
        `<b>350${S}000 so'm</b> qaytarib berildi — <b>naqd</b>.`,
        'Sana: <b>16.10.2026</b>',
        '',
        '📄 Kvitansiya: https://api.example.uz/api/receipts/refund/ref-1.pdf',
        '',
        "DaF Sprachzentrum'ni tanlaganingiz uchun rahmat!",
      ].join('\n'),
    );

    // 23:30 UTC is already the next day in Tashkent.
    sendToStudent.mockClear();
    prisma.refund.findFirst.mockResolvedValue({
      approvedAmount: null,
      requestedAmount: 120_000,
      refundMethod: 'TRANSFER',
      handedOverAt: new Date('2026-10-16T23:30:00Z'),
    });
    await listener.onHandedOver(payload);
    expect(sentText()).toContain(`<b>120${S}000 so'm</b>`);
    expect(sentText()).toContain('— <b>kartaga</b>.');
    expect(sentText()).toContain('Sana: <b>17.10.2026</b>');
  });

  it('cancelled: the reason and the balance after the unwind', async () => {
    prisma.student.findFirst.mockResolvedValue({
      firstName: 'Mohira',
      telegramChatId: '555',
      balance: 350_000,
    });
    await listener.onCancelled(payload);
    expect(sentText()).toBe(
      [
        "<b>↩️ Pulni qaytarish so'rovi bekor qilindi</b>",
        '',
        'Hurmatli Mohira!',
        '',
        `<b>350${S}000 so'm</b> qaytarish so'rovingiz bekor qilindi.`,
        "Sabab: o'qishni davom ettiradi",
        `Pul hisobingizga qaytdi — joriy balansingiz: <b>350${S}000 so'm</b>`,
        '',
        "📞 Savol bo'lsa: +998 90 123 45 67",
      ].join('\n'),
    );
  });

  it('a student with no Telegram chat (or none on file) gets nothing, for every event', async () => {
    prisma.student.findFirst.mockResolvedValueOnce({
      firstName: 'Mohira',
      telegramChatId: null,
      balance: 0,
    });
    await listener.onRequested(payload);
    prisma.student.findFirst.mockResolvedValueOnce(null);
    await listener.onHandedOver(payload);
    prisma.student.findFirst.mockResolvedValueOnce({
      firstName: 'Mohira',
      telegramChatId: null,
      balance: 0,
    });
    await listener.onCancelled(payload);

    expect(sendToStudent).not.toHaveBeenCalled();
    expect(prisma.refund.findFirst).not.toHaveBeenCalled();
  });

  it('a request that cannot be found gets nothing', async () => {
    prisma.refund.findFirst.mockResolvedValue(null);
    await listener.onRequested(payload);
    expect(sendToStudent).not.toHaveBeenCalled();
  });

  it('a send that throws is logged and swallowed', async () => {
    sendToStudent.mockRejectedValue(new Error('telegram down'));
    await expect(listener.onRequested(payload)).resolves.toBeUndefined();
    await expect(listener.onHandedOver(payload)).resolves.toBeUndefined();
    await expect(listener.onCancelled(payload)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[0][0]).toContain('telegram down');
  });

  it('a database failure is logged and swallowed too', async () => {
    prisma.student.findFirst.mockRejectedValue(new Error('db down'));
    await expect(listener.onRequested(payload)).resolves.toBeUndefined();
    expect(sendToStudent).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
