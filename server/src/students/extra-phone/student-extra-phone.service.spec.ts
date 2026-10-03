import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  EXTRA_PHONE_DOOR_CLOSED_MESSAGE,
  StudentExtraPhoneService,
} from './student-extra-phone.service';
import {
  EXTRA_PHONE_IS_MAIN_MESSAGE,
  EXTRA_PHONE_TAKEN_STUDENT_MESSAGE,
} from '../shared/extra-phone-rule';
import { WRONG_CURRENT_PASSWORD_MESSAGE } from '../shared/current-password';
import {
  INVALID_CODE_MESSAGE,
  buildPhoneVerifyMessage,
  codeKey,
} from '../shared/phone-code';

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

const sha = (c: string) => createHash('sha256').update(c).digest('hex');
const STUDENT_ID = 10077;
const USER_ID = 20077;
const MAIN = '901234567';
const BACKUP = '935554433';
const PASSWORD = 'Qalam-2026';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

function build(opts: { extraPhone?: string | null; enabled?: boolean } = {}) {
  const row = {
    id: STUDENT_ID,
    phone: MAIN,
    extraPhone: opts.extraPhone ?? null,
    companyId: 1,
    userId: USER_ID,
  };
  const taken = { cards: new Set<string>(), accounts: new Set<string>() };
  const redis = makeRedis();
  const prisma = {
    student: {
      findFirst: jest.fn(async ({ where }: any) => {
        // The rule asks for ANOTHER card holding the number.
        if (where.OR) {
          const n = where.OR[0].phone;
          return taken.cards.has(n)
            ? { id: 10999, firstName: 'Vali', lastName: 'Aliyev' }
            : null;
        }
        return { ...row };
      }),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(row, data);
        return { ...row };
      }),
    },
    user: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.OR) {
          const n = where.OR[0].phone;
          return taken.accounts.has(n) ? { id: 20999 } : null;
        }
        return where.id === USER_ID ? { password: PASSWORD_HASH } : null;
      }),
    },
    smsMessage: { create: jest.fn().mockResolvedValue({}) },
  };
  const eskiz = {
    isConfigured: jest.fn(() => true),
    sendSms: jest.fn().mockResolvedValue({ status: 'waiting' }),
  };
  const entityHistory = {
    recordUpdate: jest.fn().mockResolvedValue(undefined),
  };
  const onboarding = { phoneVerificationEnabled: opts.enabled ?? true };
  const config = { get: (_k: string, def?: string) => def };
  const service = new StudentExtraPhoneService(
    prisma as any,
    redis as any,
    eskiz as any,
    entityHistory as any,
    config as any,
    onboarding as any,
  );
  return { service, row, taken, redis, prisma, eskiz, entityHistory };
}

async function sendAndCatchCode(b: ReturnType<typeof build>, phone = BACKUP) {
  await b.service.sendCode(STUDENT_ID, USER_ID, phone, PASSWORD);
  const [, message] = b.eskiz.sendSms.mock.calls.at(-1)!;
  return /(\d{4})$/.exec(message)![1];
}

describe('StudentExtraPhoneService (ADR-0070)', () => {
  it('status: the number and whether the door is open', async () => {
    expect(
      await build({ extraPhone: BACKUP }).service.status(STUDENT_ID),
    ).toEqual({
      phone: BACKUP,
      editable: true,
    });
    expect(await build({ enabled: false }).service.status(STUDENT_ID)).toEqual({
      phone: null,
      editable: false,
    });
  });

  describe('sendCode', () => {
    it('is closed while SMS verification is switched off', async () => {
      const b = build({ enabled: false });
      await expect(
        b.service.sendCode(STUDENT_ID, USER_ID, BACKUP, PASSWORD),
      ).rejects.toThrow(EXTRA_PHONE_DOOR_CLOSED_MESSAGE);
      expect(b.eskiz.sendSms).not.toHaveBeenCalled();
    });

    it('wants a 9-digit Uzbek number', async () => {
      const b = build();
      await expect(
        b.service.sendCode(STUDENT_ID, USER_ID, '491749493338', PASSWORD),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('checks the password before it tells anything about the number', async () => {
      const b = build();
      b.taken.cards.add(BACKUP);
      await expect(
        b.service.sendCode(STUDENT_ID, USER_ID, BACKUP, 'wrong'),
      ).rejects.toThrow(WRONG_CURRENT_PASSWORD_MESSAGE);
      expect(b.eskiz.sendSms).not.toHaveBeenCalled();
    });

    it("refuses another student's number without naming them", async () => {
      const b = build();
      b.taken.cards.add(BACKUP);
      await expect(
        b.service.sendCode(STUDENT_ID, USER_ID, BACKUP, PASSWORD),
      ).rejects.toThrow(EXTRA_PHONE_TAKEN_STUDENT_MESSAGE);
    });

    it("refuses the card's own main number", async () => {
      const b = build();
      await expect(
        b.service.sendCode(STUDENT_ID, USER_ID, MAIN, PASSWORD),
      ).rejects.toThrow(EXTRA_PHONE_IS_MAIN_MESSAGE);
    });

    it('sends the ADR-0039 text to the typed number and audits it', async () => {
      const b = build();
      const code = await sendAndCatchCode(b);
      expect(b.eskiz.sendSms).toHaveBeenCalledWith(
        BACKUP,
        buildPhoneVerifyMessage(code),
      );
      const audit = b.prisma.smsMessage.create.mock.calls[0][0].data;
      // The exact text: the number, never the code.
      expect(audit.content).toBe(
        `Zaxira raqamni tasdiqlash kodi yuborildi: ${BACKUP}`,
      );
      expect(b.redis.store.has(codeKey('extra', STUDENT_ID))).toBe(true);
      expect(b.redis.store.has(codeKey('card', STUDENT_ID))).toBe(false);
    });
  });

  describe('verify', () => {
    it('a correct code writes the number and a history row by the student', async () => {
      const b = build();
      const code = await sendAndCatchCode(b);
      const status = await b.service.verify(STUDENT_ID, USER_ID, code);
      expect(status).toEqual({ phone: BACKUP, editable: true });
      expect(b.row.extraPhone).toBe(BACKUP);
      expect(b.entityHistory.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: STUDENT_ID,
          oldValues: { extraPhone: null, sabab: null },
          newValues: {
            extraPhone: BACKUP,
            sabab: "O'quvchi o'zi qo'shdi, SMS bilan tasdiqladi",
          },
          changedById: USER_ID,
          companyId: 1,
        }),
      );
      expect(b.redis.store.has(codeKey('extra', STUDENT_ID))).toBe(false);
    });

    it('a wrong code costs an attempt and writes nothing', async () => {
      const b = build();
      const code = await sendAndCatchCode(b);
      const wrong = code === '1234' ? '4321' : '1234';
      await expect(
        b.service.verify(STUDENT_ID, USER_ID, wrong),
      ).rejects.toThrow("Kod noto'g'ri. Qolgan urinishlar: 2");
      expect(b.row.extraPhone).toBeNull();
    });

    it("a code sent for the card's own number does not write the backup number", async () => {
      const b = build();
      await b.redis.set(
        codeKey('card', STUDENT_ID),
        JSON.stringify({ h: sha('1234'), n: 3, p: BACKUP }),
      );
      await expect(
        b.service.verify(STUDENT_ID, USER_ID, '1234'),
      ).rejects.toThrow(INVALID_CODE_MESSAGE);
      expect(b.row.extraPhone).toBeNull();
    });

    it('a number taken between the code and the write is refused', async () => {
      const b = build();
      const code = await sendAndCatchCode(b);
      b.taken.accounts.add(BACKUP);
      await expect(b.service.verify(STUDENT_ID, USER_ID, code)).rejects.toThrow(
        EXTRA_PHONE_TAKEN_STUDENT_MESSAGE,
      );
      expect(b.row.extraPhone).toBeNull();
    });
  });

  describe('remove', () => {
    it('needs the current password', async () => {
      const b = build({ extraPhone: BACKUP });
      await expect(
        b.service.remove(STUDENT_ID, USER_ID, 'wrong'),
      ).rejects.toThrow(WRONG_CURRENT_PASSWORD_MESSAGE);
      expect(b.row.extraPhone).toBe(BACKUP);
    });

    it('clears the number and says who did it', async () => {
      const b = build({ extraPhone: BACKUP });
      const status = await b.service.remove(STUDENT_ID, USER_ID, PASSWORD);
      expect(status).toEqual({ phone: null, editable: true });
      expect(b.row.extraPhone).toBeNull();
      expect(b.entityHistory.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: { extraPhone: BACKUP, sabab: null },
          newValues: { extraPhone: null, sabab: "O'quvchi o'zi o'chirdi" },
          changedById: USER_ID,
        }),
      );
    });

    it('has nothing to remove on a card without one', async () => {
      const b = build();
      await expect(
        b.service.remove(STUDENT_ID, USER_ID, PASSWORD),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
