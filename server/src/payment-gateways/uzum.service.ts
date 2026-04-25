import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { GatewayEventService } from './gateway-event.service';
import { PaymentsService } from '../payments/payments.service';

/**
 * Uzum Bank integration — SKELETON.
 *
 * Real integration requires:
 *   - Uzum merchant credentials (env)
 *   - Webhook signature verification per Uzum's documented scheme
 *   - Transaction lifecycle handlers (status transitions per Uzum API)
 *
 * Structure mirrors the Payme/Click skeletons. Provider-specific logic is
 * TODO pending real integration from Uzum's current docs.
 */
@Injectable()
export class UzumService {
  private readonly logger = new Logger(UzumService.name);

  constructor(
    private events: GatewayEventService,
    private payments: PaymentsService,
  ) {}

  async handleWebhook(
    rawBody: unknown,
    headers: Record<string, string>,
    companyId: number,
  ) {
    const payload = (rawBody ?? {}) as Record<string, unknown>;
    const externalId =
      (payload.transactionId as string | number | undefined)?.toString() ??
      (payload.id as string | number | undefined)?.toString() ??
      'unknown';
    const eventType =
      (payload.eventType as string | undefined) ??
      (payload.status as string | undefined) ??
      'unknown';
    const signatureValid = this.verifySignature(headers, rawBody);

    const event = await this.events.record({
      provider: PaymentMethod.UZUM,
      externalId,
      eventType,
      payload: payload as any,
      signatureValid,
      companyId,
    });

    if (!signatureValid) {
      this.logger.warn(
        `Uzum webhook rejected (invalid signature): ${event.id}`,
      );
      await this.events.markFailed(event.id, 'Invalid signature');
      return { ok: false, reason: 'Invalid signature' };
    }

    try {
      throw new NotImplementedException(
        'Uzum Bank handler is not yet implemented — see Uzum Merchant API docs',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.events.markFailed(event.id, message);
      throw err;
    }
  }

  private verifySignature(
    _headers: Record<string, string>,
    _body: unknown,
  ): boolean {
    // TODO: implement per Uzum docs (HMAC / header signature).
    return false;
  }
}
