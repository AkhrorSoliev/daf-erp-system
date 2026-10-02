import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethod, PaymentSource, SmsMessageType } from '@prisma/client';
import { PaymentEventsListener } from './payment-events.listener';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';

describe('PaymentEventsListener', () => {
  let listener: PaymentEventsListener;
  let findFirst: jest.Mock;
  let sendToStudent: jest.Mock;

  const basePayload = {
    paymentId: 'pay-1',
    studentId: 10001,
    amount: 1500000,
    method: PaymentMethod.CASH,
    source: PaymentSource.ADMIN_MANUAL,
    studentBalance: 2000000,
    companyId: 1,
    performedById: 99,
  };

  const clearEnv = () => {
    delete process.env.INVOICE_BASE_URL;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.APP_URL;
  };

  const sentText = () => sendToStudent.mock.calls[0][1] as string;

  beforeEach(async () => {
    clearEnv();
    findFirst = jest
      .fn()
      .mockResolvedValue({ firstName: 'Ali', telegramChatId: '555' });
    sendToStudent = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEventsListener,
        { provide: PrismaService, useValue: { student: { findFirst } } },
        { provide: SmsService, useValue: { sendToStudent } },
      ],
    }).compile();
    listener = module.get(PaymentEventsListener);
  });

  afterEach(clearEnv);

  describe('handle (receipt)', () => {
    it('sends the receipt at once, as an AUTO message by the performer', async () => {
      await listener.handle(basePayload);

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 10001, deletedAt: null },
        select: { firstName: true, telegramChatId: true },
      });
      expect(sendToStudent).toHaveBeenCalledWith(
        10001,
        expect.any(String),
        SmsMessageType.AUTO,
        99,
        1,
      );
      const text = sentText();
      expect(text).toContain('Hurmatli Ali!');
      expect(text).toContain("to'lovingiz qabul qilindi (Naqd)");
      expect(text).toContain('Joriy balansingiz:');
      expect(text).toContain(
        '📄 Kvitansiya: https://admin.dafzentrum.uz/r/pay-1',
      );
      expect(text).toContain('Rahmat!');
    });

    it('builds the receipt link from INVOICE_BASE_URL when configured', async () => {
      process.env.INVOICE_BASE_URL = 'https://invoice.dafzentrum.uz';
      await listener.handle(basePayload);
      expect(sentText()).toContain('https://invoice.dafzentrum.uz/pay-1');
    });

    it('falls back to PUBLIC_BASE_URL/r/<id> when INVOICE_BASE_URL is missing', async () => {
      process.env.PUBLIC_BASE_URL = 'https://erp.example.uz';
      await listener.handle(basePayload);
      expect(sentText()).toContain('https://erp.example.uz/r/pay-1');
    });

    it('escapes the name, which goes out as HTML', async () => {
      findFirst.mockResolvedValue({ firstName: 'A<b>', telegramChatId: '1' });
      await listener.handle(basePayload);
      expect(sentText()).toContain('Hurmatli A&lt;b&gt;!');
    });

    it('leaves the balance line out when the balance is unknown', async () => {
      await listener.handle({ ...basePayload, studentBalance: null });
      expect(sentText()).not.toContain('Joriy balansingiz');
    });

    it('skips a student without Telegram, or a deleted one', async () => {
      findFirst.mockResolvedValue({ firstName: 'Ali', telegramChatId: null });
      await listener.handle(basePayload);
      findFirst.mockResolvedValue(null);
      await listener.handle(basePayload);
      expect(sendToStudent).not.toHaveBeenCalled();
    });

    it('swallows send errors without throwing', async () => {
      sendToStudent.mockRejectedValue(new Error('telegram down'));
      await expect(listener.handle(basePayload)).resolves.toBeUndefined();
    });
  });

  describe('handleReversed', () => {
    const reversed = {
      paymentId: 'pay-1',
      studentId: 10001,
      amount: 1500000,
      studentBalance: 500000,
      reason: "Noto'g'ri summa",
      companyId: 1,
      performedById: 7,
    };

    it('sends the reversal notice at once, with its reason', async () => {
      await listener.handleReversed(reversed);

      expect(sendToStudent).toHaveBeenCalledWith(
        10001,
        expect.any(String),
        SmsMessageType.AUTO,
        7,
        1,
      );
      const text = sentText();
      expect(text).toContain("to'lovingiz bekor qilindi.");
      expect(text).toContain("Sabab: Noto'g'ri summa");
      expect(text).toContain("Savollar bo'lsa, markazga murojaat qiling.");
    });

    it('leaves the reason line out when there is none', async () => {
      await listener.handleReversed({ ...reversed, reason: null });
      expect(sentText()).not.toContain('Sabab:');
    });

    it('swallows send errors without throwing', async () => {
      sendToStudent.mockRejectedValue(new Error('telegram down'));
      await expect(listener.handleReversed(reversed)).resolves.toBeUndefined();
    });
  });
});
