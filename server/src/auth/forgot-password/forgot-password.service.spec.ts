import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ForgotPasswordService } from './forgot-password.service';

/** Minimal in-memory Redis honouring the ops the service uses (EX, ttl, incr). */
function makeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    store,
    ttls,
    async get(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    async set(k: string, v: any, mode?: string, ttl?: number) {
      store.set(k, String(v));
      if (mode === 'EX' && ttl) ttls.set(k, Number(ttl));
      return 'OK';
    },
    async del(k: string) {
      const had = store.delete(k);
      ttls.delete(k);
      return had ? 1 : 0;
    },
    // Atomic get-and-delete (Redis GETDEL / ioredis getdel) used by resetPassword.
    async getdel(k: string) {
      const v = store.has(k) ? store.get(k)! : null;
      store.delete(k);
      ttls.delete(k);
      return v;
    },
    async incr(k: string) {
      const n = (Number(store.get(k)) || 0) + 1;
      store.set(k, String(n));
      return n;
    },
    async expire(k: string, s: number) {
      ttls.set(k, s);
      return 1;
    },
    async ttl(k: string) {
      if (ttls.has(k)) return ttls.get(k)!;
      return store.has(k) ? -1 : -2;
    },
  };
}

const sha = (c: string) => createHash('sha256').update(c).digest('hex');
const PHONE = '901234567';
const TARGET = { userId: 10001, studentId: 10050, companyId: 1 };

function build() {
  const redis = makeRedis();
  const prisma = { smsMessage: { create: jest.fn().mockResolvedValue({}) } };
  const eskiz = { sendSms: jest.fn().mockResolvedValue({ status: 'waiting' }) };
  const reset = {
    resolveByPhone: jest.fn(),
    applyNewPassword: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: (_k: string, def?: any) => def };
  const service = new ForgotPasswordService(
    prisma as any,
    redis as any,
    eskiz as any,
    reset as any,
    config as any,
  );
  return { service, redis, prisma, eskiz, reset };
}

describe('ForgotPasswordService', () => {
  describe('requestCode', () => {
    it('sends a code + stores it + audits when the phone resolves to an account', async () => {
      const { service, redis, prisma, eskiz, reset } = build();
      reset.resolveByPhone.mockResolvedValue(TARGET);

      const res = await service.requestCode(PHONE, '1.1.1.1');

      expect(res.message).toMatch(/tasdiqlash kodi yuborildi/);
      expect(eskiz.sendSms).toHaveBeenCalledTimes(1);
      // The sent message embeds the resource name + type + purpose (Eskiz
      // Punkt 2 — the brand-only form was rejected, so the "mobil ilova" type
      // word is now mandatory in the moderated template; this OTP is for the
      // student app's login/password reset).
      const [, message] = eskiz.sendSms.mock.calls[0];
      // Must byte-match the approved Eskiz template (id 78093): the fixed
      // prefix + the code, and NOTHING after it (no security-advice suffix —
      // that is not in the moderated template and Eskiz would reject it).
      expect(message).toMatch(
        /^DaF Sprachzentrum mobil ilovasining parolini tiklash uchun tasdiqlash kodi: \d{4}$/,
      );
      // A code is stored in Redis (hashed) with attempts left.
      const stored = JSON.parse(redis.store.get(`otp_reset:code:${PHONE}`)!);
      expect(stored.n).toBe(3);
      expect(stored.h).toMatch(/^[a-f0-9]{64}$/);
      // Audited as a masked SMS — the code is never persisted.
      expect(prisma.smsMessage.create).toHaveBeenCalledTimes(1);
      const row = prisma.smsMessage.create.mock.calls[0][0].data;
      expect(row.content).not.toMatch(/\d{4}/);
      expect(row.status).toBe('SENT');
    });

    it('is anti-enumeration: unknown phone returns the SAME message and sends nothing', async () => {
      const { service, eskiz, prisma, reset, redis } = build();
      reset.resolveByPhone.mockResolvedValue(null);

      const res = await service.requestCode(PHONE, '1.1.1.1');

      expect(res.message).toMatch(/tasdiqlash kodi yuborildi/);
      expect(eskiz.sendSms).not.toHaveBeenCalled();
      expect(prisma.smsMessage.create).not.toHaveBeenCalled();
      // Cooldown still applied uniformly (same behaviour as an existing phone).
      expect(await redis.ttl(`otp_reset:cooldown:${PHONE}`)).toBeGreaterThan(0);
    });

    it('respects the resend cooldown (no second SMS while cooling down)', async () => {
      const { service, eskiz, reset } = build();
      reset.resolveByPhone.mockResolvedValue(TARGET);

      await service.requestCode(PHONE, '1.1.1.1');
      await service.requestCode(PHONE, '1.1.1.1');

      expect(eskiz.sendSms).toHaveBeenCalledTimes(1);
    });

    it('stops sending once the per-phone daily limit is reached', async () => {
      const { service, redis, eskiz, reset } = build();
      reset.resolveByPhone.mockResolvedValue(TARGET);
      // Daily limit already hit; cooldown cleared so only the daily cap blocks.
      await redis.set(`otp_reset:daily:${PHONE}`, '3');

      const res = await service.requestCode(PHONE, '1.1.1.1');

      expect(res.message).toMatch(/tasdiqlash kodi yuborildi/);
      expect(eskiz.sendSms).not.toHaveBeenCalled();
    });
  });

  describe('verifyCode', () => {
    it('rejects when there is no pending code', async () => {
      const { service } = build();
      await expect(service.verifyCode(PHONE, '1234')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns a reset token on the correct code and burns the code', async () => {
      const { service, redis, reset } = build();
      reset.resolveByPhone.mockResolvedValue(TARGET);
      await redis.set(
        `otp_reset:code:${PHONE}`,
        JSON.stringify({ h: sha('1234'), n: 3 }),
        'EX',
        300,
      );

      const { resetToken } = await service.verifyCode(PHONE, '1234');

      expect(resetToken).toMatch(/^[a-f0-9]{64}$/);
      expect(redis.store.has(`otp_reset:code:${PHONE}`)).toBe(false); // burned
      expect(redis.store.has(`otp_reset:rtoken:${resetToken}`)).toBe(true);
    });

    it('decrements attempts on a wrong code and burns it after 3 failures', async () => {
      const { service, redis } = build();
      const key = `otp_reset:code:${PHONE}`;
      await redis.set(key, JSON.stringify({ h: sha('1234'), n: 3 }), 'EX', 300);

      await expect(service.verifyCode(PHONE, '0000')).rejects.toThrow(/2/);
      await expect(service.verifyCode(PHONE, '0000')).rejects.toThrow(/1/);
      await expect(service.verifyCode(PHONE, '0000')).rejects.toThrow(
        /yangi kod/i,
      );
      expect(redis.store.has(key)).toBe(false); // burned after 3 wrong tries
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown / expired reset token', async () => {
      const { service } = build();
      await expect(
        service.resetPassword('deadbeef', 'newpass123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('applies the new password and consumes the single-use token', async () => {
      const { service, redis, reset } = build();
      const token = 'tok123';
      // The stored token is phone-bound; resetPassword re-resolves the account
      // by phone and verifies the userId still matches before applying.
      reset.resolveByPhone.mockResolvedValue(TARGET);
      await redis.set(
        `otp_reset:rtoken:${token}`,
        JSON.stringify({ ...TARGET, phone: PHONE }),
        'EX',
        600,
      );

      const res = await service.resetPassword(token, 'newpass123');

      expect(res.message).toMatch(/o'zgartirildi/);
      expect(reset.applyNewPassword).toHaveBeenCalledWith(
        TARGET,
        'newpass123',
        'SMS orqali tiklandi',
      );
      expect(redis.store.has(`otp_reset:rtoken:${token}`)).toBe(false); // consumed
      // Token cannot be reused.
      await expect(
        service.resetPassword(token, 'another123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
