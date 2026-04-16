import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymeService } from './payme.service';
import { PaymeMethodsService } from './payme-methods.service';
import { GatewayEventService } from '../gateway-event.service';
import { AUTH_ERROR, INTERNAL_ERROR, METHOD_NOT_FOUND } from './payme-errors';

describe('PaymeService', () => {
  let service: PaymeService;
  let config: { get: jest.Mock };
  let events: { record: jest.Mock; markProcessed: jest.Mock; markFailed: jest.Mock };
  let methods: Record<string, jest.Mock>;

  const MERCHANT_KEY = 'test-secret-key-123';
  const VALID_AUTH = `Basic ${Buffer.from(`Paycom:${MERCHANT_KEY}`).toString('base64')}`;

  beforeEach(async () => {
    config = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'PAYME_MERCHANT_KEY_TEST') return MERCHANT_KEY;
        return undefined;
      }),
    };

    events = {
      record: jest.fn().mockResolvedValue({ id: 'event-1' }),
      markProcessed: jest.fn().mockResolvedValue({}),
      markFailed: jest.fn().mockResolvedValue({}),
    };

    methods = {
      checkPerformTransaction: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1, result: { allow: true } }),
      createTransaction: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1, result: { state: 1 } }),
      performTransaction: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1, result: { state: 2 } }),
      cancelTransaction: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1, result: { state: -1 } }),
      checkTransaction: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1, result: { state: 2 } }),
      getStatement: jest.fn().mockResolvedValue({ jsonrpc: '2.0', id: 1, result: { transactions: [] } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymeService,
        { provide: ConfigService, useValue: config },
        { provide: GatewayEventService, useValue: events },
        { provide: PaymeMethodsService, useValue: methods },
      ],
    }).compile();

    service = module.get(PaymeService);
  });

  const makeRequest = (method: string, params = {}, id = 1) =>
    service.handleWebhook(
      { jsonrpc: '2.0', id, method, params },
      { authorization: VALID_AUTH },
      1,
    );

  describe('Authentication', () => {
    it('should reject missing authorization header', async () => {
      const result = await service.handleWebhook(
        { jsonrpc: '2.0', id: 1, method: 'CheckPerformTransaction', params: {} },
        {},
        1,
      );
      expect(result).toMatchObject({ error: { code: AUTH_ERROR } });
    });

    it('should reject invalid authorization', async () => {
      const result = await service.handleWebhook(
        { jsonrpc: '2.0', id: 1, method: 'CheckPerformTransaction', params: {} },
        { authorization: 'Basic aW52YWxpZA==' },
        1,
      );
      expect(result).toMatchObject({ error: { code: AUTH_ERROR } });
    });

    it('should reject non-Basic auth scheme', async () => {
      const result = await service.handleWebhook(
        { jsonrpc: '2.0', id: 1, method: 'CheckPerformTransaction', params: {} },
        { authorization: 'Bearer some-token' },
        1,
      );
      expect(result).toMatchObject({ error: { code: AUTH_ERROR } });
    });

    it('should accept valid authorization', async () => {
      const result = await makeRequest('CheckPerformTransaction', { amount: 100, account: { student_id: 10001 } });
      expect(result).toMatchObject({ result: { allow: true } });
    });

    it('should use production key when NODE_ENV is production', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'PAYME_MERCHANT_KEY') return 'prod-key';
        return undefined;
      });

      const prodAuth = `Basic ${Buffer.from('Paycom:prod-key').toString('base64')}`;
      const result = await service.handleWebhook(
        { jsonrpc: '2.0', id: 1, method: 'CheckPerformTransaction', params: {} },
        { authorization: prodAuth },
        1,
      );
      expect(result).toMatchObject({ result: { allow: true } });
    });
  });

  describe('Method dispatch', () => {
    it('should dispatch CheckPerformTransaction', async () => {
      await makeRequest('CheckPerformTransaction', { amount: 100 });
      expect(methods.checkPerformTransaction).toHaveBeenCalled();
    });

    it('should dispatch CreateTransaction', async () => {
      await makeRequest('CreateTransaction', { id: 'abc', amount: 100 });
      expect(methods.createTransaction).toHaveBeenCalled();
    });

    it('should dispatch PerformTransaction', async () => {
      await makeRequest('PerformTransaction', { id: 'abc' });
      expect(methods.performTransaction).toHaveBeenCalled();
    });

    it('should dispatch CancelTransaction', async () => {
      await makeRequest('CancelTransaction', { id: 'abc', reason: 1 });
      expect(methods.cancelTransaction).toHaveBeenCalled();
    });

    it('should dispatch CheckTransaction', async () => {
      await makeRequest('CheckTransaction', { id: 'abc' });
      expect(methods.checkTransaction).toHaveBeenCalled();
    });

    it('should dispatch GetStatement', async () => {
      await makeRequest('GetStatement', { from: 0, to: 1000 });
      expect(methods.getStatement).toHaveBeenCalled();
    });

    it('should return METHOD_NOT_FOUND for unknown method', async () => {
      const result = await makeRequest('UnknownMethod');
      expect(result).toMatchObject({ error: { code: METHOD_NOT_FOUND } });
    });

    it('should return METHOD_NOT_FOUND for empty method', async () => {
      const result = await service.handleWebhook(
        { jsonrpc: '2.0', id: 1, params: {} },
        { authorization: VALID_AUTH },
        1,
      );
      expect(result).toMatchObject({ error: { code: METHOD_NOT_FOUND } });
    });
  });

  describe('Event logging', () => {
    it('should log every valid request to GatewayEventService', async () => {
      await makeRequest('CheckPerformTransaction');
      expect(events.record).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'PAYME',
          signatureValid: true,
          companyId: 1,
        }),
      );
    });

    it('should mark event as processed on success', async () => {
      await makeRequest('CheckPerformTransaction');
      expect(events.markProcessed).toHaveBeenCalledWith('event-1');
    });

    it('should mark event as failed on method error', async () => {
      methods.checkPerformTransaction.mockRejectedValue(new Error('DB down'));
      const result = await makeRequest('CheckPerformTransaction');
      expect(result).toMatchObject({ error: { code: INTERNAL_ERROR } });
      expect(events.markFailed).toHaveBeenCalledWith('event-1', 'DB down');
    });
  });

  describe('JSON-RPC format', () => {
    it('should always include jsonrpc and id in response', async () => {
      const result = await makeRequest('CheckPerformTransaction', {}, 42);
      expect(result).toHaveProperty('jsonrpc', '2.0');
    });

    it('should use rpcId 0 for malformed body', async () => {
      const result = await service.handleWebhook(null, { authorization: VALID_AUTH }, 1);
      expect(result).toMatchObject({ id: 0 });
    });
  });
});
