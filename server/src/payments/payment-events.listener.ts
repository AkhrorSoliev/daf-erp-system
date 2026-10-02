import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SmsMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { describeError } from '../telegram-digest/telegram-send';
import { escapeHtml, formatSum } from '../telegram-groups/utils/format.util';
import { PAYMENT_METHOD_LABEL } from './shared/method-label';
import type {
  PaymentReceivedPayload,
  PaymentReversedPayload,
} from './payments-write.service';

/**
 * Public receipt link — the invoice subdomain when `INVOICE_BASE_URL` is set
 * (no auth wall, one path segment), otherwise `<admin>/r/<id>`. Read from
 * `process.env` directly to avoid ConfigService caching surprises.
 */
export function buildReceiptUrl(paymentId: string): string {
  const invoiceBase = process.env.INVOICE_BASE_URL?.trim();
  if (invoiceBase) return `${invoiceBase}/${paymentId}`;
  const fallbackBase =
    process.env.PUBLIC_BASE_URL?.trim() ??
    process.env.APP_URL?.trim() ??
    'https://admin.dafzentrum.uz';
  return `${fallbackBase}/r/${paymentId}`;
}

/**
 * Sends the student's payment receipt / reversal notice the moment the
 * payment commits (ADR-0065 — these two left the 20:00 digest). SmsService
 * writes the SmsMessage row and the history line the profile "SMS" tab
 * shows. A student without Telegram is skipped, as receipts always were.
 * Errors are logged and swallowed: a notification must never affect the
 * payment write.
 */
@Injectable()
export class PaymentEventsListener {
  private readonly logger = new Logger(PaymentEventsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  @OnEvent('payment.received')
  async handle(payload: PaymentReceivedPayload) {
    await this.send(payload, receiptText(payload), 'receipt');
  }

  @OnEvent('payment.reversed')
  async handleReversed(payload: PaymentReversedPayload) {
    await this.send(payload, reversalText(payload), 'reversal');
  }

  private async send(
    payload: PaymentReceivedPayload | PaymentReversedPayload,
    compose: (firstName: string) => string,
    what: string,
  ) {
    try {
      // Any student not deleted gets it — frozen and departed included
      // (CEO decision, ADR-0025).
      const student = await this.prisma.student.findFirst({
        where: { id: payload.studentId, deletedAt: null },
        select: { firstName: true, telegramChatId: true },
      });
      if (!student?.telegramChatId) return;
      await this.smsService.sendToStudent(
        payload.studentId,
        compose(student.firstName),
        SmsMessageType.AUTO,
        payload.performedById,
        payload.companyId,
      );
    } catch (err) {
      this.logger.warn(
        `Payment ${what} Telegram failed for student ${payload.studentId}: ${describeError(err)}`,
      );
    }
  }
}

const greeting = (firstName: string) =>
  firstName ? `Hurmatli ${escapeHtml(firstName)}!` : 'Assalomu alaykum!';

const balanceLine = (balance: number | null) =>
  balance === null ? [] : [`Joriy balansingiz: <b>${formatSum(balance)}</b>`];

function receiptText(p: PaymentReceivedPayload) {
  const method = PAYMENT_METHOD_LABEL[p.method] ?? p.method;
  return (firstName: string) =>
    [
      greeting(firstName),
      '',
      `<b>${formatSum(p.amount)}</b> to'lovingiz qabul qilindi (${escapeHtml(method)}).`,
      ...balanceLine(p.studentBalance),
      '',
      `📄 Kvitansiya: ${escapeHtml(buildReceiptUrl(p.paymentId))}`,
      '',
      'Rahmat!',
    ].join('\n');
}

function reversalText(p: PaymentReversedPayload) {
  return (firstName: string) =>
    [
      greeting(firstName),
      '',
      `<b>${formatSum(p.amount)}</b> to'lovingiz bekor qilindi.`,
      ...(p.reason ? [`Sabab: ${escapeHtml(p.reason)}`] : []),
      ...balanceLine(p.studentBalance),
      '',
      "Savollar bo'lsa, markazga murojaat qiling.",
    ].join('\n');
}
