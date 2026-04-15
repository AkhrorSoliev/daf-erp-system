import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { GatewayEventService } from './gateway-event.service';
import { PaymentsService } from '../payments/payments.service';

/**
 * Click integration — SKELETON.
 *
 * Real integration requires:
 *   - Click service id, merchant id, secret key (env)
 *   - Prepare endpoint (action=0) — validate and reserve
 *   - Complete endpoint (action=1) — confirm and write payment
 *   - Signature: md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id
 *                    + amount + action + sign_time) (see Click docs)
 *   - Two-phase flow: Prepare returns merchant_confirm_id, Complete finalizes
 *
 * This file wires the control flow and event log. The md5 signature and RPC
 * payload parsing are left as TODO for the real integration iteration.
 */
@Injectable()
export class ClickService {
  private readonly logger = new Logger(ClickService.name);

  constructor(
    private events: GatewayEventService,
    private payments: PaymentsService,
  ) {}

  async handleWebhook(rawBody: unknown, companyId: number) {
    const payload = (rawBody ?? {}) as Record<string, unknown>;
    const externalId = String(payload.click_trans_id ?? 'unknown');
    const action = String(payload.action ?? 'unknown');
    const eventType = action === '0' ? 'Prepare' : action === '1' ? 'Complete' : `Action${action}`;
    const signatureValid = this.verifySignature(payload);

    const event = await this.events.record({
      provider: PaymentMethod.CLICK,
      externalId,
      eventType,
      payload: payload as any,
      signatureValid,
      companyId,
    });

    if (!signatureValid) {
      this.logger.warn(`Click webhook rejected (invalid signature): ${event.id}`);
      await this.events.markFailed(event.id, 'Invalid signature');
      return { error: -1, error_note: 'Invalid signature' };
    }

    try {
      // TODO: implement two-phase Prepare/Complete handler, call
      // payments.createFromGateway on successful Complete.
      throw new NotImplementedException(
        'Click Prepare/Complete handler is not yet implemented — see Click Merchant API docs',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.events.markFailed(event.id, message);
      throw err;
    }
  }

  /**
   * md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id
   *     + amount + action + sign_time) and compare with payload.sign_string.
   */
  private verifySignature(_payload: Record<string, unknown>): boolean {
    // TODO: implement md5 signature check against env.CLICK_SECRET_KEY.
    return false;
  }
}
