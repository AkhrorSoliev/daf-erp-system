import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import type { PaymentReceivedPayload } from '../payments/payments-write.service';
import { describeError } from '../telegram-digest/telegram-send';
import { allocatePaymentReceiptCode } from './receipt-code';

/** Every payment gets its R-YYYY-NNNNN right after it commits (spec B4 §4.7); the PDF path stays the fallback. */
@Injectable()
export class ReceiptCodeListener {
  private readonly logger = new Logger(ReceiptCodeListener.name);
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('payment.received')
  async assign(payload: PaymentReceivedPayload): Promise<void> {
    try {
      await allocatePaymentReceiptCode(this.prisma, payload.paymentId);
    } catch (e) {
      this.logger.warn(
        `Receipt code for payment ${payload.paymentId} not assigned: ${describeError(e)}`,
      );
    }
  }
}
