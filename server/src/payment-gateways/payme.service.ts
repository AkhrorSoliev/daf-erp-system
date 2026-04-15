import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { GatewayEventService } from './gateway-event.service';
import { PaymentsService } from '../payments/payments.service';

/**
 * Payme (Paycom) Merchant API integration — SKELETON.
 *
 * Real integration requires:
 *   - Payme merchant secret key (PAYME_MERCHANT_KEY env)
 *   - Merchant ID per company (stored in CompanyConfig, not yet modelled)
 *   - JSON-RPC handler for CheckPerformTransaction / CreateTransaction /
 *     PerformTransaction / CancelTransaction / CheckTransaction / GetStatement
 *     methods (see https://developer.help.paycom.uz)
 *   - Basic auth signature verification using the merchant key
 *
 * This file wires up the control flow and persists the raw event to the
 * universal PaymentGatewayEvent log. The actual RPC logic is intentionally
 * left as TODO so a later iteration — informed by Payme's current docs —
 * can implement it without rewiring the caller side.
 */
@Injectable()
export class PaymeService {
  private readonly logger = new Logger(PaymeService.name);

  constructor(
    private events: GatewayEventService,
    private payments: PaymentsService,
  ) {}

  /**
   * Entry point from the webhook controller. Always logs the raw event first,
   * then decides whether to process.
   */
  async handleWebhook(rawBody: unknown, headers: Record<string, string>, companyId: number) {
    const payload = (rawBody ?? {}) as Record<string, unknown>;
    const externalId = String(payload.id ?? payload.transaction ?? 'unknown');
    const eventType = String(payload.method ?? 'unknown');
    const signatureValid = this.verifySignature(headers, rawBody);

    const event = await this.events.record({
      provider: PaymentMethod.PAYME,
      externalId,
      eventType,
      payload: payload as any,
      signatureValid,
      companyId,
    });

    if (!signatureValid) {
      this.logger.warn(`Payme webhook rejected (invalid signature): ${event.id}`);
      await this.events.markFailed(event.id, 'Invalid signature');
      return { ok: false, reason: 'Invalid signature' };
    }

    try {
      // TODO: dispatch on eventType (CreateTransaction, PerformTransaction, etc.)
      // and call payments.createFromGateway when the transaction is confirmed.
      throw new NotImplementedException(
        'Payme RPC handler is not yet implemented — see Payme Merchant API docs',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.events.markFailed(event.id, message);
      throw err;
    }
  }

  /**
   * Verify Payme basic auth signature.
   * TODO: implement — `Authorization: Basic base64(Paycom:MERCHANT_KEY)`.
   */
  private verifySignature(headers: Record<string, string>, _body: unknown): boolean {
    const auth = headers['authorization'] ?? headers['Authorization'];
    if (!auth) return false;
    // TODO: compare against base64(`Paycom:${env.PAYME_MERCHANT_KEY}`).
    return false;
  }
}
