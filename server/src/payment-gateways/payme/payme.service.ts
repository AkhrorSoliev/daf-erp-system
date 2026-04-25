import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { GatewayEventService } from '../gateway-event.service';
import { GatewayConfigService } from '../gateway-config.service';
import { PaymeMethodsService } from './payme-methods.service';
import {
  AUTH_ERROR,
  INTERNAL_ERROR,
  METHOD_NOT_FOUND,
  paymeError,
} from './payme-errors';
import type { PaymeRpcRequest, PaymeRpcResponse } from './payme.types';

const ALLOWED_METHODS = [
  'CheckPerformTransaction',
  'CreateTransaction',
  'PerformTransaction',
  'CancelTransaction',
  'CheckTransaction',
  'GetStatement',
] as const;

type PaymeMethod = (typeof ALLOWED_METHODS)[number];

/**
 * Paycom Merchant API dispatcher.
 *
 * Verifies Basic Auth, logs raw events, and dispatches JSON-RPC method
 * calls to PaymeMethodsService. Always returns HTTP 200 with a JSON-RPC
 * response — never throws HTTP exceptions.
 */
@Injectable()
export class PaymeService {
  private readonly logger = new Logger(PaymeService.name);

  constructor(
    private config: ConfigService,
    private events: GatewayEventService,
    private gatewayConfig: GatewayConfigService,
    private methods: PaymeMethodsService,
  ) {}

  /**
   * Main entry point called from GatewaysController.
   * Returns a JSON-RPC 2.0 response object (success or error).
   */
  async handleWebhook(
    rawBody: unknown,
    headers: Record<string, string>,
    companyId: number,
  ): Promise<PaymeRpcResponse> {
    const body = (rawBody ?? {}) as Partial<PaymeRpcRequest>;
    const rpcId = typeof body.id === 'number' ? body.id : 0;
    const method = typeof body.method === 'string' ? body.method : '';
    const params = body.params ?? {};

    // 1. Verify Basic Auth (per-company credentials)
    if (!(await this.verifySignature(headers, companyId))) {
      this.logger.warn(`Payme auth failed for method=${method}`);
      return paymeError(rpcId, AUTH_ERROR);
    }

    // 2. Log raw event
    const externalId = String(params.id ?? body.id ?? 'unknown');
    const event = await this.events.record({
      provider: PaymentMethod.PAYME,
      externalId,
      eventType: method || 'unknown',
      payload: (rawBody ?? {}) as any,
      signatureValid: true,
      companyId,
    });

    // 3. Validate method exists
    if (!method || !ALLOWED_METHODS.includes(method as PaymeMethod)) {
      await this.events.markFailed(event.id, `Unknown method: ${method}`);
      return paymeError(rpcId, METHOD_NOT_FOUND);
    }

    // 4. Dispatch to method handler
    try {
      const result = await this.dispatch(
        method as PaymeMethod,
        params,
        companyId,
        rpcId,
      );
      await this.events.markProcessed(event.id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Payme ${method} error: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.events.markFailed(event.id, message);
      return paymeError(rpcId, INTERNAL_ERROR);
    }
  }

  /**
   * Dispatch a validated method name to the corresponding handler.
   */
  private dispatch(
    method: PaymeMethod,
    params: Record<string, unknown>,
    companyId: number,
    rpcId: number,
  ): Promise<PaymeRpcResponse> {
    switch (method) {
      case 'CheckPerformTransaction':
        return this.methods.checkPerformTransaction(params, companyId, rpcId);
      case 'CreateTransaction':
        return this.methods.createTransaction(params, companyId, rpcId);
      case 'PerformTransaction':
        return this.methods.performTransaction(params, companyId, rpcId);
      case 'CancelTransaction':
        return this.methods.cancelTransaction(params, companyId, rpcId);
      case 'CheckTransaction':
        return this.methods.checkTransaction(params, companyId, rpcId);
      case 'GetStatement':
        return this.methods.getStatement(params, companyId, rpcId);
    }
  }

  /**
   * Verify Payme Basic Auth: `Authorization: Basic base64("Paycom:<KEY>")`.
   * Uses per-company config with env fallback. Timing-safe comparison.
   */
  private async verifySignature(
    headers: Record<string, string>,
    companyId: number,
  ): Promise<boolean> {
    const auth = headers['authorization'] ?? headers['Authorization'] ?? '';
    if (!auth.startsWith('Basic ')) return false;

    const cfg = await this.gatewayConfig.getConfig(
      companyId,
      PaymentMethod.PAYME,
    );
    if (!cfg) {
      this.logger.error(
        `PAYME credentials not configured for companyId=${companyId}`,
      );
      return false;
    }

    const received = auth.slice(6); // strip "Basic "

    // Try production key first, then test key.
    // Payme sandbox (test.paycom.uz) always sends test key,
    // while production Payme sends the prod key.
    const keysToTry = [cfg.secretKey, cfg.secretKeyTest].filter(
      Boolean,
    ) as string[];

    for (const key of keysToTry) {
      const expected = Buffer.from(`Paycom:${key}`).toString('base64');
      if (expected.length !== received.length) continue;
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
        return true;
      }
    }

    return false;
  }
}
