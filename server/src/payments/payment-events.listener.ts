import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { SmsMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { PAYMENT_METHOD_LABEL } from './shared/method-label';
import type { PaymentReceivedPayload } from './payments-write.service';

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
    private config: ConfigService,
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
      // ERP login. Falls back to the admin host with `/r/<id>` when
      // `INVOICE_BASE_URL` isn't configured (dev / older deploys).
      const invoiceBase = this.config.get<string>('INVOICE_BASE_URL');
      const fallbackBase =
        this.config.get<string>('PUBLIC_BASE_URL') ??
        this.config.get<string>('APP_URL') ??
        'https://admin.dafzentrum.uz';
      const receiptUrl = invoiceBase
        ? `${invoiceBase}/${payload.paymentId}`
        : `${fallbackBase}/r/${payload.paymentId}`;
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

function formatSom(value: number): string {
  // Uzbek locale: space as thousand separator (matches client formatBalance).
  // Negative values keep the leading minus.
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value).toFixed(0);
  const withSeparators = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return sign + withSeparators;
}
