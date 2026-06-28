import { createHash } from 'crypto';
import { TelegramService } from './telegram.service';

/**
 * F-2 — Telegram webhook secret-token verification. The full service has a
 * large DI graph, so we exercise the security-critical pieces off a bare
 * prototype instance (these methods only touch configService / bot / logger).
 */
describe('TelegramService — webhook secret (F-2)', () => {
  const makeInstance = (env: Record<string, string | undefined>) => {
    const inst = Object.create(TelegramService.prototype) as any;
    inst.configService = { get: (k: string) => env[k] };
    inst.logger = { warn: jest.fn(), log: jest.fn() };
    return inst;
  };

  describe('webhookSecret()', () => {
    it('prefers an explicit TELEGRAM_WEBHOOK_SECRET', () => {
      const inst = makeInstance({ TELEGRAM_WEBHOOK_SECRET: 'explicit-secret' });
      expect(inst.webhookSecret()).toBe('explicit-secret');
    });

    it('falls back to sha256(botToken) when no explicit secret', () => {
      const inst = makeInstance({ TELEGRAM_BOT_TOKEN: 'bot-token-123' });
      expect(inst.webhookSecret()).toBe(
        createHash('sha256').update('bot-token-123').digest('hex'),
      );
    });

    it('returns null when neither is configured', () => {
      expect(makeInstance({}).webhookSecret()).toBeNull();
    });
  });

  describe('secretMatches()', () => {
    const inst = makeInstance({});
    it('matches identical secrets', () => {
      expect(inst.secretMatches('abc', 'abc')).toBe(true);
    });
    it('rejects a mismatch', () => {
      expect(inst.secretMatches('abc', 'xyz')).toBe(false);
    });
    it('rejects missing / non-string received tokens', () => {
      expect(inst.secretMatches('abc', undefined)).toBe(false);
      expect(inst.secretMatches('abc', '')).toBe(false);
      expect(inst.secretMatches('abc', 123)).toBe(false);
    });
  });

  describe('handleWebhook()', () => {
    it('rejects a forged update (wrong secret) with 401 and never processes it', async () => {
      const inst = makeInstance({ TELEGRAM_WEBHOOK_SECRET: 'sek' });
      inst.bot = { handleUpdate: jest.fn() };
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      await inst.handleWebhook(
        { headers: { 'x-telegram-bot-api-secret-token': 'wrong' }, body: {} },
        res,
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(inst.bot.handleUpdate).not.toHaveBeenCalled();
    });

    it('processes a genuine update (matching secret header)', async () => {
      const inst = makeInstance({ TELEGRAM_WEBHOOK_SECRET: 'sek' });
      inst.bot = { handleUpdate: jest.fn().mockResolvedValue(undefined) };
      const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
      const req = {
        headers: { 'x-telegram-bot-api-secret-token': 'sek' },
        body: { update_id: 1 },
      };
      await inst.handleWebhook(req, res);
      expect(inst.bot.handleUpdate).toHaveBeenCalledWith(req.body, res);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
