import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { createHash, timingSafeEqual } from 'crypto';
import { GatewayEventService } from '../gateway-event.service';
import { GatewayConfigService } from '../gateway-config.service';
import { ClickMethodsService } from './click-methods.service';
import {
  CLICK_ACTION_NOT_FOUND,
  CLICK_SIGN_CHECK_FAILED,
  clickError,
} from './click-errors';
import type {
  ClickPrepareRequest,
  ClickCompleteRequest,
  ClickWebhookResponse,
} from './click.types';

/**
 * Click SHOP-API webhook dispatcher.
 *
 * Verifies MD5 signature, logs raw events, and dispatches Prepare/Complete
 * requests to ClickMethodsService. Always returns HTTP 200 with a
 * Click response object — never throws HTTP exceptions.
 */
@Injectable()
export class ClickService {
  private readonly logger = new Logger(ClickService.name);

  constructor(
    private config: ConfigService,
    private events: GatewayEventService,
    private gatewayConfig: GatewayConfigService,
    private methods: ClickMethodsService,
  ) {}

  /**
   * Main entry point called from GatewaysController.
   * Returns a Click webhook response object.
   */
  async handleWebhook(
    rawBody: unknown,
    companyId: number,
  ): Promise<ClickWebhookResponse> {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const action = Number(body.action ?? -1);
    const clickTransId = Number(body.click_trans_id ?? 0);
    const merchantTransId =
      (body.merchant_trans_id as string | number | undefined)?.toString() ?? '';
    const eventType =
      action === 0 ? 'Prepare' : action === 1 ? 'Complete' : `Action${action}`;

    // 1. Verify MD5 signature (per-company credentials)
    const signatureValid = await this.verifySignature(body, action, companyId);

    // 2. Log raw event
    const externalId = String(clickTransId || 'unknown');
    const event = await this.events.record({
      provider: PaymentMethod.CLICK,
      externalId,
      eventType,
      payload: body as any,
      signatureValid,
      companyId,
    });

    // 3. Reject invalid signature
    if (!signatureValid) {
      this.logger.warn(
        `Click webhook rejected (invalid signature): ${event.id}`,
      );
      await this.events.markFailed(event.id, 'Invalid signature');
      return clickError(clickTransId, merchantTransId, CLICK_SIGN_CHECK_FAILED);
    }

    // 4. Validate action
    if (action !== 0 && action !== 1) {
      await this.events.markFailed(event.id, `Unknown action: ${action}`);
      return clickError(clickTransId, merchantTransId, CLICK_ACTION_NOT_FOUND);
    }

    // 5. Dispatch to method handler
    try {
      let result: ClickWebhookResponse;

      if (action === 0) {
        result = await this.methods.prepare(
          body as unknown as ClickPrepareRequest,
          companyId,
        );
      } else {
        result = await this.methods.complete(
          body as unknown as ClickCompleteRequest,
          companyId,
        );
      }

      await this.events.markProcessed(event.id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Click ${eventType} error: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.events.markFailed(event.id, message);
      return clickError(clickTransId, merchantTransId, CLICK_SIGN_CHECK_FAILED);
    }
  }

  /**
   * Verify Click MD5 signature using per-company credentials.
   *
   * Prepare (action=0):
   *   md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
   *
   * Complete (action=1):
   *   md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
   */
  private async verifySignature(
    body: Record<string, unknown>,
    action: number,
    companyId: number,
  ): Promise<boolean> {
    const cfg = await this.gatewayConfig.getConfig(
      companyId,
      PaymentMethod.CLICK,
    );
    if (!cfg) {
      this.logger.error(
        `CLICK credentials not configured for companyId=${companyId}`,
      );
      return false;
    }

    const signString = (body.sign_string as string | undefined) ?? '';
    if (!signString) return false;

    let dataToSign: string;

    if (action === 0) {
      // Prepare
      dataToSign = [
        body.click_trans_id,
        body.service_id,
        cfg.secretKey,
        body.merchant_trans_id,
        body.amount,
        body.action,
        body.sign_time,
      ].join('');
    } else if (action === 1) {
      // Complete
      dataToSign = [
        body.click_trans_id,
        body.service_id,
        cfg.secretKey,
        body.merchant_trans_id,
        body.merchant_prepare_id,
        body.amount,
        body.action,
        body.sign_time,
      ].join('');
    } else {
      return false;
    }

    const expectedHash = createHash('md5').update(dataToSign).digest('hex');

    // Timing-safe comparison
    if (expectedHash.length !== signString.length) return false;

    return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(signString));
  }
}
