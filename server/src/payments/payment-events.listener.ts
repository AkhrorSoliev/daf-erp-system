import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SmsMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { PAYMENT_METHOD_LABEL } from './shared/method-label';
import { formatSom } from './shared/format-som';
import type {
  PaymentReceivedPayload,
  PaymentReversedPayload,
} from './payments-write.service';

/**
 * Sends a Telegram receipt to the student after a payment commits.
 * Reuses `SmsService.sendToStudent` so the message is persisted in the
 * `SmsMessage` table and surfaces in the student profile "SMS" tab
 * automatically (no new storage / UI needed). Students without
 * `telegramChatId` get a `FAILED` row from SmsService — silent skip
 * from the user's perspective.
 *
 * Errors are logged at warn level and swallowed; a failed Telegram
 * delivery must never affect the upstream payment write.
 */
@Injectable()
export class PaymentEventsListener {
  private readonly logger = new Logger(PaymentEventsListener.name);

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
  ) {}

  @OnEvent('payment.received')
  async handle(payload: PaymentReceivedPayload) {
    try {
      const student = await this.prisma.student.findFirst({
        where: { id: payload.studentId, deletedAt: null },
        select: { id: true, firstName: true, telegramChatId: true },
      });
      if (!student?.telegramChatId) {
        // SmsService records a FAILED row regardless — but skipping the
        // call avoids unnecessary work + matches existing per-student
        // listener pattern.
        return;
      }

      // Receipt links go to the public invoice subdomain — no auth wall,
      // single-segment URL (`invoice.dafzentrum.uz/<id>`) so the message
      // looks clean in Telegram and the recipient can open it without an
      // ERP login. Read `INVOICE_BASE_URL` directly from `process.env` to
      // avoid any NestJS ConfigService caching surprises.
      const invoiceBase = process.env.INVOICE_BASE_URL?.trim();
      const fallbackBase =
        process.env.PUBLIC_BASE_URL?.trim() ??
        process.env.APP_URL?.trim() ??
        'https://admin.dafzentrum.uz';
      const receiptUrl = invoiceBase
        ? `${invoiceBase}/${payload.paymentId}`
        : `${fallbackBase}/r/${payload.paymentId}`;
      this.logger.log(`[receipt] sending ${receiptUrl}`);
      const body = composeBody(payload, student.firstName, receiptUrl);
      await this.smsService.sendToStudent(
        payload.studentId,
        body,
        SmsMessageType.AUTO,
        payload.performedById,
        payload.companyId,
      );
    } catch (err) {
      this.logger.warn(
        `Payment receipt Telegram failed for student ${payload.studentId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Sends a Telegram notice to the student when one of their payments is
   * rolled back (standalone reverse, or the first leg of an amount
   * correction). Same fire-and-forget, swallow-errors contract as the
   * receipt handler above.
   */
  @OnEvent('payment.reversed')
  async handleReversed(payload: PaymentReversedPayload) {
    try {
      const student = await this.prisma.student.findFirst({
        where: { id: payload.studentId, deletedAt: null },
        select: { id: true, firstName: true, telegramChatId: true },
      });
      if (!student?.telegramChatId) {
        return;
      }

      const body = composeReversedBody(payload, student.firstName);
      await this.smsService.sendToStudent(
        payload.studentId,
        body,
        SmsMessageType.AUTO,
        payload.performedById,
        payload.companyId,
      );
    } catch (err) {
      this.logger.warn(
        `Payment reversal Telegram failed for student ${payload.studentId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

function composeBody(
  p: PaymentReceivedPayload,
  firstName: string,
  receiptUrl: string,
): string {
  const methodLabel = PAYMENT_METHOD_LABEL[p.method] ?? p.method;
  const lines: string[] = [];
  lines.push(`Salom, ${firstName}!`);
  lines.push(
    `${formatSom(p.amount)} so'm to'lovingiz qabul qilindi (${methodLabel}).`,
  );
  if (p.studentBalance !== null) {
    lines.push(`Joriy balansingiz: ${formatSom(p.studentBalance)} so'm.`);
  }
  lines.push('');
  lines.push(`📄 Kvitansiya: ${receiptUrl}`);
  lines.push('');
  lines.push('Rahmat!');
  return lines.join('\n');
}

function composeReversedBody(
  p: PaymentReversedPayload,
  firstName: string,
): string {
  const lines: string[] = [];
  lines.push(`Salom, ${firstName}!`);
  lines.push(`${formatSom(p.amount)} so'm to'lovingiz bekor qilindi.`);
  if (p.reason) {
    lines.push(`Sabab: ${p.reason}`);
  }
  if (p.studentBalance !== null) {
    lines.push(`Joriy balansingiz: ${formatSom(p.studentBalance)} so'm.`);
  }
  lines.push('');
  lines.push("Savollar bo'lsa, markazga murojaat qiling.");
  return lines.join('\n');
}
