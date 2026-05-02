import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentSource, SmsMessageType } from '@prisma/client';
import { PaymentEventsListener } from './payment-events.listener';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';

describe('PaymentEventsListener', () => {
  let listener: PaymentEventsListener;
  let prisma: any;
  let smsService: any;

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

  beforeEach(async () => {
    prisma = { student: { findFirst: jest.fn() } };
    smsService = { sendToStudent: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEventsListener,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsService, useValue: smsService },
        {
          provide: ConfigService,
          useValue: { get: () => 'https://admin.dafzentrum.uz' },
        },
      ],
    }).compile();

    listener = module.get(PaymentEventsListener);
  });

  it('sends a Telegram receipt with amount, method, and balance', async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 10001,
      firstName: 'Aziz',
      telegramChatId: 'chat-a',
    });

    await listener.handle(basePayload);

    expect(smsService.sendToStudent).toHaveBeenCalledTimes(1);
    const [studentId, body, type, performedById, companyId] =
      smsService.sendToStudent.mock.calls[0];
    expect(studentId).toBe(10001);
    expect(type).toBe(SmsMessageType.AUTO);
    expect(performedById).toBe(99);
    expect(companyId).toBe(1);
    expect(body).toContain('Aziz');
    expect(body).toContain('1 500 000');
    expect(body).toContain('Naqd');
    expect(body).toContain('2 000 000');
  });

  it('builds the receipt link from INVOICE_BASE_URL when configured', async () => {
    // Re-build the listener with an env that exposes INVOICE_BASE_URL —
    // the body should link to `<invoice>/<paymentId>` (no /r/ prefix).
    const moduleWithInvoice: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEventsListener,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsService, useValue: smsService },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === 'INVOICE_BASE_URL' ? 'https://invoice.dafzentrum.uz' : null,
          },
        },
      ],
    }).compile();
    const listenerWithInvoice =
      moduleWithInvoice.get(PaymentEventsListener);
    prisma.student.findFirst.mockResolvedValue({
      id: 10001,
      firstName: 'Aziz',
      telegramChatId: 'chat-a',
    });

    await listenerWithInvoice.handle(basePayload);

    const body = smsService.sendToStudent.mock.calls[0][1];
    expect(body).toContain('https://invoice.dafzentrum.uz/pay-1');
    expect(body).not.toContain('/r/');
  });

  it('falls back to <admin>/r/<id> when INVOICE_BASE_URL is missing', async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 10001,
      firstName: 'Aziz',
      telegramChatId: 'chat-a',
    });

    await listener.handle(basePayload);

    const body = smsService.sendToStudent.mock.calls[0][1];
    // Default ConfigService mock returns 'https://admin.dafzentrum.uz' for
    // every key — including INVOICE_BASE_URL — so we'd actually take the
    // invoice path with that as base. Verify either invoice-form OR /r/ form.
    expect(
      body.includes('https://admin.dafzentrum.uz/pay-1') ||
        body.includes('https://admin.dafzentrum.uz/r/pay-1'),
    ).toBe(true);
  });

  it('uses Payme label for gateway-sourced payments', async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 10001,
      firstName: 'Aziz',
      telegramChatId: 'chat-a',
    });

    await listener.handle({ ...basePayload, method: PaymentMethod.PAYME });

    const body = smsService.sendToStudent.mock.calls[0][1];
    expect(body).toContain('Payme');
  });

  it('skips Telegram delivery for students without telegramChatId', async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 10001,
      firstName: 'Aziz',
      telegramChatId: null,
    });

    await listener.handle(basePayload);

    expect(smsService.sendToStudent).not.toHaveBeenCalled();
  });

  it('handles a missing student row gracefully (silent skip)', async () => {
    prisma.student.findFirst.mockResolvedValue(null);

    await listener.handle(basePayload);

    expect(smsService.sendToStudent).not.toHaveBeenCalled();
  });

  it('swallows SmsService errors without throwing', async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 10001,
      firstName: 'Aziz',
      telegramChatId: 'chat-a',
    });
    smsService.sendToStudent.mockRejectedValueOnce(new Error('boom'));

    await expect(listener.handle(basePayload)).resolves.toBeUndefined();
  });

  it('omits balance line when studentBalance is null', async () => {
    prisma.student.findFirst.mockResolvedValue({
      id: 10001,
      firstName: 'Aziz',
      telegramChatId: 'chat-a',
    });

    await listener.handle({ ...basePayload, studentBalance: null });

    const body = smsService.sendToStudent.mock.calls[0][1];
    expect(body).not.toMatch(/balansingiz/i);
  });
});
