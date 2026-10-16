import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  PaymentReceivedPayload,
  PaymentReversedPayload,
} from '../payments/payments-write.service';
import { describeError } from '../telegram-digest/telegram-send';
import { KpiResultsService } from './kpi-results.service';

/**
 * Records KPI results after a payment commits (spec §7.6). A failure is
 * logged and never reaches the payment; `KpiSelfHealCron` repairs it at night.
 */
@Injectable()
export class KpiRecorderListener {
  private readonly logger = new Logger(KpiRecorderListener.name);

  constructor(private results: KpiResultsService) {}

  @OnEvent('payment.received')
  async onReceived(payload: PaymentReceivedPayload): Promise<void> {
    try {
      await this.results.recordForPayment(payload.paymentId);
    } catch (e) {
      this.logger.warn(
        `KPI of payment ${payload.paymentId} not recorded: ${describeError(e)}`,
      );
    }
  }

  @OnEvent('payment.reversed')
  async onReversed(payload: PaymentReversedPayload): Promise<void> {
    try {
      await this.results.cancelForPayment(payload.paymentId, {
        correction: payload.correction === true,
      });
    } catch (e) {
      this.logger.warn(
        `KPI of payment ${payload.paymentId} not cancelled: ${describeError(e)}`,
      );
    }
  }
}
