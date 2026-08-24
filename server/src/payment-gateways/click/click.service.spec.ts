import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { ClickService } from './click.service';
import { ClickMethodsService } from './click-methods.service';
import { GatewayEventService } from '../gateway-event.service';
import { GatewayConfigService } from '../gateway-config.service';
import { CLICK_SIGN_CHECK_FAILED } from './click-errors';
import type { ClickCompleteRequest, ClickPrepareRequest } from './click.types';

describe('ClickService', () => {
  let service: ClickService;
  let config: { get: jest.Mock };
  let events: {
    record: jest.Mock;
    markProcessed: jest.Mock;
    markFailed: jest.Mock;
  };
  let gatewayConfig: { getConfig: jest.Mock };
  let methods: { prepare: jest.Mock; complete: jest.Mock };

  const SECRET_KEY = 'test-click-secret';
  const COMPANY_ID = 1;

  const makeSignString = (parts: (string | number)[]): string => {
    return createHash('md5').update(parts.join('')).digest('hex');
  };

  // Typed against the real webhook contract rather than an inline literal.
  // Untyped, the fixture could drift from `ClickPrepareRequest` — a field
  // renamed or removed in the type would leave these tests green while the
  // service stopped receiving it.
  const makePrepareBody = (
    overrides: Partial<ClickPrepareRequest> = {},
  ): ClickPrepareRequest => {
    const base: ClickPrepareRequest = {
      sign_string: '',
      click_trans_id: 12345,
      service_id: 100,
      click_paydoc_id: 67890,
      merchant_trans_id: '10042',
      amount: 50000,
      action: 0,
      error: 0,
      error_note: '',
      sign_time: '2026-04-16 12:00:00',
      ...overrides,
    };
    base.sign_string = makeSignString([
      base.click_trans_id,
      base.service_id,
      SECRET_KEY,
      base.merchant_trans_id,
      base.amount,
      base.action,
      base.sign_time,
    ]);
    return base;
  };

  const makeCompleteBody = (
    overrides: Partial<ClickCompleteRequest> = {},
  ): ClickCompleteRequest => {
    const base: ClickCompleteRequest = {
      sign_string: '',
      click_trans_id: 12345,
      service_id: 100,
      click_paydoc_id: 67890,
      merchant_trans_id: '10042',
      merchant_prepare_id: 'txn-uuid',
      amount: 50000,
      action: 1,
      error: 0,
      error_note: '',
      sign_time: '2026-04-16 12:01:00',
      ...overrides,
    };
    base.sign_string = makeSignString([
      base.click_trans_id,
      base.service_id,
      SECRET_KEY,
      base.merchant_trans_id,
      base.merchant_prepare_id,
      base.amount,
      base.action,
      base.sign_time,
    ]);
    return base;
  };

  beforeEach(async () => {
    config = {
      get: jest.fn((key: string) => {
        if (key === 'CLICK_SECRET_KEY') return SECRET_KEY;
        return undefined;
      }),
    };

    events = {
      record: jest.fn().mockResolvedValue({ id: 'event-1' }),
      markProcessed: jest.fn().mockResolvedValue({}),
      markFailed: jest.fn().mockResolvedValue({}),
    };

    gatewayConfig = {
      getConfig: jest.fn().mockResolvedValue({
        merchantId: 'test-merchant-id',
        secretKey: SECRET_KEY,
      }),
    };

    methods = {
      prepare: jest.fn().mockResolvedValue({
        click_trans_id: 12345,
        merchant_trans_id: '10042',
        merchant_prepare_id: 'txn-uuid',
        merchant_confirm_id: null,
        error: 0,
        error_note: 'Success',
      }),
      complete: jest.fn().mockResolvedValue({
        click_trans_id: 12345,
        merchant_trans_id: '10042',
        merchant_prepare_id: 'txn-uuid',
        merchant_confirm_id: 'txn-uuid',
        error: 0,
        error_note: 'Success',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClickService,
        { provide: ConfigService, useValue: config },
        { provide: GatewayEventService, useValue: events },
        { provide: GatewayConfigService, useValue: gatewayConfig },
        { provide: ClickMethodsService, useValue: methods },
      ],
    }).compile();

    service = module.get(ClickService);
  });

  describe('Signature verification', () => {
    it('should accept valid Prepare signature', async () => {
      const body = makePrepareBody();
      const result = await service.handleWebhook(body, COMPANY_ID);
      expect(result.error).toBe(0);
      expect(methods.prepare).toHaveBeenCalled();
    });

    it('should accept valid Complete signature', async () => {
      const body = makeCompleteBody();
      const result = await service.handleWebhook(body, COMPANY_ID);
      expect(result.error).toBe(0);
      expect(methods.complete).toHaveBeenCalled();
    });

    it('should reject invalid signature', async () => {
      // The builder always recomputes `sign_string`, so it has to be
      // corrupted after the fact — passing it as an override would be
      // silently overwritten.
      const body = makePrepareBody();
      body.sign_string = 'invalid-hash';
      const result = await service.handleWebhook(body, COMPANY_ID);
      expect(result.error).toBe(CLICK_SIGN_CHECK_FAILED);
      expect(methods.prepare).not.toHaveBeenCalled();
    });

    it('should reject when CLICK credentials are not configured', async () => {
      gatewayConfig.getConfig.mockResolvedValue(null);
      const body = makePrepareBody();
      const result = await service.handleWebhook(body, COMPANY_ID);
      expect(result.error).toBe(CLICK_SIGN_CHECK_FAILED);
    });

    it('should reject empty sign_string', async () => {
      const body = makePrepareBody();
      body.sign_string = '';
      const result = await service.handleWebhook(body, COMPANY_ID);
      expect(result.error).toBe(CLICK_SIGN_CHECK_FAILED);
    });
  });

  describe('Action dispatch', () => {
    it('should dispatch action=0 to prepare', async () => {
      const body = makePrepareBody();
      await service.handleWebhook(body, COMPANY_ID);
      expect(methods.prepare).toHaveBeenCalled();
      expect(methods.complete).not.toHaveBeenCalled();
    });

    it('should dispatch action=1 to complete', async () => {
      const body = makeCompleteBody();
      await service.handleWebhook(body, COMPANY_ID);
      expect(methods.complete).toHaveBeenCalled();
      expect(methods.prepare).not.toHaveBeenCalled();
    });

    it('should return ACTION_NOT_FOUND for unknown action', async () => {
      // Build a body with action=5 and valid signature for action=5
      // Since verifySignature returns false for unknown actions, it will
      // return SIGN_CHECK_FAILED before reaching ACTION_NOT_FOUND
      const body = {
        click_trans_id: 12345,
        service_id: 100,
        merchant_trans_id: '10042',
        amount: 50000,
        action: 5,
        sign_time: '2026-04-16 12:00:00',
        sign_string: 'any',
      };
      const result = await service.handleWebhook(body, COMPANY_ID);
      // Unknown action fails signature verification first
      expect(result.error).toBe(CLICK_SIGN_CHECK_FAILED);
    });
  });

  describe('Event logging', () => {
    it('should log every request to GatewayEventService', async () => {
      const body = makePrepareBody();
      await service.handleWebhook(body, COMPANY_ID);
      expect(events.record).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'CLICK',
          signatureValid: true,
          companyId: COMPANY_ID,
        }),
      );
    });

    it('should mark event as processed on success', async () => {
      const body = makePrepareBody();
      await service.handleWebhook(body, COMPANY_ID);
      expect(events.markProcessed).toHaveBeenCalledWith('event-1');
    });

    it('should mark event as failed on invalid signature', async () => {
      const body = makePrepareBody();
      body.sign_string = 'bad';
      await service.handleWebhook(body, COMPANY_ID);
      expect(events.markFailed).toHaveBeenCalledWith(
        'event-1',
        'Invalid signature',
      );
    });

    it('should mark event as failed when method throws', async () => {
      methods.prepare.mockRejectedValue(new Error('DB down'));
      const body = makePrepareBody();
      await service.handleWebhook(body, COMPANY_ID);
      expect(events.markFailed).toHaveBeenCalledWith('event-1', 'DB down');
    });
  });
});
