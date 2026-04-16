import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { GatewayEventService } from '../gateway-event.service';
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
    const params = (body.params ?? {}) as Record<string, unknown>;

    // 1. Verify Basic Auth
    if (!this.verifySignature(headers)) {
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
      const result = await this.dispatch(method as PaymeMethod, params, companyId, rpcId);
      await this.events.markProcessed(event.id);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Payme ${method} error: ${message}`, err instanceof Error ? err.stack : undefined);
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
   * Uses timing-safe comparison to prevent timing attacks.
   */
  private verifySignature(headers: Record<string, string>): boolean {
    const auth = headers['authorization'] ?? headers['Authorization'] ?? '';
    if (!auth.startsWith('Basic ')) return false;

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const merchantKey = isProduction
      ? this.config.get<string>('PAYME_MERCHANT_KEY')
      : this.config.get<string>('PAYME_MERCHANT_KEY_TEST');

    if (!merchantKey) {
      this.logger.error('PAYME_MERCHANT_KEY is not configured');
      return false;
    }

    const expected = Buffer.from(`Paycom:${merchantKey}`).toString('base64');
    const received = auth.slice(6); // strip "Basic "

    if (expected.length !== received.length) return false;

    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  }
}
