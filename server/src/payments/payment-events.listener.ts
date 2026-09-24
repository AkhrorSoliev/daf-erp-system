import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { describeError } from '../telegram-digest/telegram-send';
import type {
  PaymentReceivedPayload,
  PaymentReversedPayload,
} from './payments-write.service';

/**
 * Public receipt link — the rule the instant receipt used: the invoice
 * subdomain when `INVOICE_BASE_URL` is set (no auth wall, one path segment),
 * otherwise `<admin>/r/<id>`. Read from `process.env` directly to avoid
 * ConfigService caching surprises.
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
 * Queues the student's payment receipt / reversal notice for the 20:00
 * Telegram digest (ADR-0025). The digest cron renders and sends it and writes
 * the SmsMessage row the profile "SMS" tab shows. Errors are logged and
 * swallowed: a notification must never affect the payment write.
 */
@Injectable()
export class PaymentEventsListener {
  private readonly logger = new Logger(PaymentEventsListener.name);

  constructor(private readonly digestQueue: TelegramDigestQueueService) {}

  @OnEvent('payment.received')
  async handle(payload: PaymentReceivedPayload) {
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: payload.studentId,
        companyId: payload.companyId,
        category: TelegramDigestCategory.PAYMENT_RECEIVED,
        relatedEntityId: payload.paymentId,
        payload: {
          paymentId: payload.paymentId,
          amount: payload.amount,
          method: payload.method,
          receiptUrl: buildReceiptUrl(payload.paymentId),
          performedById: payload.performedById ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Payment receipt digest enqueue failed for student ${payload.studentId}: ${describeError(err)}`,
      );
    }
  }

  @OnEvent('payment.reversed')
  async handleReversed(payload: PaymentReversedPayload) {
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: payload.studentId,
        companyId: payload.companyId,
        category: TelegramDigestCategory.PAYMENT_REVERSED,
        relatedEntityId: payload.paymentId,
        payload: {
          paymentId: payload.paymentId,
          amount: payload.amount,
          reason: payload.reason,
          performedById: payload.performedById ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Payment reversal digest enqueue failed for student ${payload.studentId}: ${describeError(err)}`,
      );
    }
  }
}
