import { BadRequestException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  buildPhoneVerifyMessage,
  clearCode,
  codeKey,
  hashCode,
  issuePhoneCode,
  readStoredCode,
  rejectCode,
} from './phone-code';

/** Minimal in-memory Redis honouring the ops the module uses. */
function makeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    store,
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
    async incr(k: string) {
      const n = (Number(store.get(k)) || 0) + 1;
      store.set(k, String(n));
      return n;
    },
    async decr(k: string) {
      const n = (Number(store.get(k)) || 0) - 1;
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

const STUDENT = { id: 10077, companyId: 1 };
const TARGET = '935554433';

function deps() {
  const redis = makeRedis();
  const eskiz = { sendSms: jest.fn().mockResolvedValue({ status: 'waiting' }) };
  const prisma = { smsMessage: { create: jest.fn().mockResolvedValue({}) } };
  return {
    redis,
    eskiz,
    prisma,
    d: {
      prisma: prisma as any,
      redis: redis as any,
      eskiz,
      logger: new Logger('test'),
      globalHourlyCap: 300,
    },
  };
}

describe('phone-code — one slot per purpose, shared limits', () => {
  it('keeps the card code and the backup-number code in different slots', () => {
    expect(codeKey('card', 1)).toBe('phone_verify:code:1');
    expect(codeKey('extra', 1)).toBe('extra_phone:code:1');
  });

  it('issues a backup-number code into the extra slot only', async () => {
    const { d, redis, eskiz, prisma } = deps();
    const res = await issuePhoneCode(d, 'extra', STUDENT, TARGET, {
      typedByStudent: true,
    });
    expect(res.phone).toBe(TARGET);
    expect(await readStoredCode(redis as any, 'card', STUDENT.id)).toBeNull();
    const stored = await readStoredCode(redis as any, 'extra', STUDENT.id);
    expect(stored?.p).toBe(TARGET);
    expect(stored?.n).toBe(3);
    const [, text] = eskiz.sendSms.mock.calls[0];
    expect(text).toBe(buildPhoneVerifyMessage(/(\d{4})$/.exec(text)![1]));
    expect(stored?.h).toBe(hashCode(/(\d{4})$/.exec(text)![1]));
    // The typed number is counted against its daily cap.
    expect(redis.store.get(`phone_verify:number_daily:${TARGET}`)).toBe('1');
    expect(prisma.smsMessage.create.mock.calls[0][0].data.content).toBe(
      `Zaxira raqamni tasdiqlash kodi yuborildi: ${TARGET}`,
    );
  });

  it('a wrong code costs an attempt, the third burns the code', async () => {
    const { redis } = deps();
    const stored = { h: hashCode('1234'), n: 3, p: TARGET };
    await redis.set(codeKey('extra', STUDENT.id), JSON.stringify(stored));
    await expect(
      rejectCode(redis as any, 'extra', STUDENT.id, stored),
    ).rejects.toThrow("Kod noto'g'ri. Qolgan urinishlar: 2");
    const after = await readStoredCode(redis as any, 'extra', STUDENT.id);
    expect(after?.n).toBe(2);
    await expect(
      rejectCode(redis as any, 'extra', STUDENT.id, { ...stored, n: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await readStoredCode(redis as any, 'extra', STUDENT.id)).toBeNull();
  });

  it('drops a corrupt entry instead of throwing', async () => {
    const { redis } = deps();
    await redis.set(codeKey('card', STUDENT.id), '{not json');
    expect(await readStoredCode(redis as any, 'card', STUDENT.id)).toBeNull();
    expect(redis.store.has(codeKey('card', STUDENT.id))).toBe(false);
  });

  it('clearCode removes only the named slot', async () => {
    const { redis } = deps();
    await redis.set(codeKey('card', STUDENT.id), '{}');
    await redis.set(codeKey('extra', STUDENT.id), '{}');
    await clearCode(redis as any, 'extra', STUDENT.id);
    expect(redis.store.has(codeKey('card', STUDENT.id))).toBe(true);
    expect(redis.store.has(codeKey('extra', STUDENT.id))).toBe(false);
  });

  it('sha256 matches the hash the onboarding spec computes', () => {
    expect(hashCode('1234')).toBe(
      createHash('sha256').update('1234').digest('hex'),
    );
  });
});
