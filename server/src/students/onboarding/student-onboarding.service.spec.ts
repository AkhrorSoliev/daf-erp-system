import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { computeChangedFields } from '../../common/entity-history/diff.util';
import * as bcrypt from 'bcryptjs';
import {
  NUMBER_TAKEN_MESSAGE,
  StudentOnboardingService,
  WRONG_CURRENT_PASSWORD_MESSAGE,
  buildPhoneVerifyMessage,
} from './student-onboarding.service';

/** Minimal in-memory Redis honouring the ops the service uses. */
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
const PHONE = '901234567';
const OWN_PHONE = '935554433'; // the number the student actually uses
const PASSWORD = 'Qalam-2026';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

function build(
  card: Partial<{
    phone: string;
    verifiedPhone: string | null;
    extraPhone: string | null;
    gender: 'MALE' | 'FEMALE' | null;
    dateOfBirth: Date | null;
  }> = {},
  env: Record<string, string> = { STUDENT_PHONE_VERIFICATION_ENABLED: 'true' },
) {
  const row = {
    id: STUDENT_ID,
    phone: PHONE,
    verifiedPhone: null as string | null,
    extraPhone: null as string | null,
    phoneVerifiedAt: null as Date | null,
    gender: null as 'MALE' | 'FEMALE' | null,
    dateOfBirth: null as Date | null,
    companyId: 1,
    userId: USER_ID,
    ...card,
  };
  // The student's sign-in account: login and phone are the card's number.
  const account = {
    id: USER_ID,
    phone: row.phone as string | null,
    login: row.phone as string | null,
    password: PASSWORD_HASH,
  };
  // Numbers other students already sign in with, by card or by account.
  const taken = { cards: new Set<string>(), accounts: new Set<string>() };
  const redis = makeRedis();
  const studentUpdateMany = jest.fn(async ({ where, data }: any) => {
    if (where.phone !== row.phone) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });
  const studentUpdate = jest.fn(async ({ data }: any) => {
    Object.assign(row, data);
    return { ...row };
  });
  const userUpdate = jest.fn(async ({ data }: any) => {
    Object.assign(account, data);
    return {};
  });
  const prisma = {
    student: {
      findFirst: jest.fn(async ({ where }: any) => {
        // assertNumberFree asks for ANOTHER card on a number.
        if (where.phone !== undefined) {
          return taken.cards.has(where.phone) ? { id: 10999 } : null;
        }
        return { ...row };
      }),
      update: studentUpdate,
      updateMany: studentUpdateMany,
    },
    user: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.OR) {
          const number = where.OR[0].phone;
          return taken.accounts.has(number) ? { id: 20999 } : null;
        }
        if (where.login !== undefined) return null; // loginForPhone: free
        return where.id === USER_ID ? { ...account } : null;
      }),
      update: userUpdate,
    },
    smsMessage: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        student: { update: studentUpdate, updateMany: studentUpdateMany },
        user: { update: userUpdate },
      }),
    ),
  };
  const eskiz = {
    isConfigured: jest.fn(() => true),
    sendSms: jest.fn().mockResolvedValue({ status: 'waiting' }),
  };
  const entityHistory = {
    recordUpdate: jest.fn().mockResolvedValue(undefined),
  };
  const config = { get: (k: string, def?: string) => env[k] ?? def };
  const service = new StudentOnboardingService(
    prisma as any,
    redis as any,
    eskiz as any,
    entityHistory as any,
    config as any,
  );
  return { service, row, account, taken, redis, prisma, eskiz, entityHistory };
}

/** Sends a code and returns it, read back from the SMS text. */
async function sendAndCatchCode(b: ReturnType<typeof build>): Promise<string> {
  await b.service.sendPhoneCode(STUDENT_ID);
  const [, message] = b.eskiz.sendSms.mock.calls.at(-1)!;
  return /(\d{4})$/.exec(message)![1];
}

/** «Yo'q, boshqa raqam»: sends a code to `phone` and returns it. */
async function sendChangeAndCatchCode(
  b: ReturnType<typeof build>,
  phone = OWN_PHONE,
): Promise<string> {
  await b.service.sendChangeCode(STUDENT_ID, USER_ID, phone, PASSWORD);
  const [, message] = b.eskiz.sendSms.mock.calls.at(-1)!;
  return /(\d{4})$/.exec(message)![1];
}

describe('StudentOnboardingService (ADR-0039)', () => {
  describe('status', () => {
    it('lists everything a fresh card owes', async () => {
      const { service } = build();
      await expect(service.status(STUDENT_ID)).resolves.toEqual({
        missing: ['PHONE', 'GENDER', 'BIRTH_DATE'],
        phone: PHONE,
        phoneVerified: false,
      });
    });

    it('does not ask for the phone while the switch is off', async () => {
      const { service } = build({}, {});
      expect((await service.status(STUDENT_ID)).missing).toEqual([
        'GENDER',
        'BIRTH_DATE',
      ]);
    });

    it('does not ask for the phone when Eskiz has no credentials', async () => {
      // A code that can never arrive must not become a compulsory step.
      const b = build();
      b.eskiz.isConfigured.mockReturnValue(false);
      expect((await b.service.status(STUDENT_ID)).missing).not.toContain(
        'PHONE',
      );
    });
  });

  describe('updateProfile', () => {
    it('fills gender and birth date, mirrors gender to the account, journals it', async () => {
      const b = build({ verifiedPhone: PHONE });

      const res = await b.service.updateProfile(STUDENT_ID, USER_ID, {
        gender: 'FEMALE',
        dateOfBirth: '2004-03-15',
      });

      expect(res.missing).toEqual([]);
      expect(b.row.gender).toBe('FEMALE');
      // Stored as the UTC midnight of the calendar date, as the staff form does.
      expect(b.row.dateOfBirth).toEqual(new Date('2004-03-15T00:00:00.000Z'));
      expect(b.prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { gender: 'FEMALE' },
      });
      expect(b.entityHistory.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: STUDENT_ID,
          newValues: { gender: 'FEMALE', dateOfBirth: '2004-03-15' },
          changedById: USER_ID,
        }),
      );
    });

    it('never overwrites what staff already entered on the card', async () => {
      const staffDate = new Date('2001-01-01T00:00:00.000Z');
      const b = build({ gender: 'MALE', dateOfBirth: staffDate });

      await b.service.updateProfile(STUDENT_ID, USER_ID, {
        gender: 'FEMALE',
        dateOfBirth: '2004-03-15',
      });

      expect(b.prisma.student.update).not.toHaveBeenCalled();
      expect(b.row.gender).toBe('MALE');
      expect(b.row.dateOfBirth).toBe(staffDate);
      expect(b.entityHistory.recordUpdate).not.toHaveBeenCalled();
    });

    it('refuses an impossible birth date and writes nothing', async () => {
      const b = build();
      await expect(
        b.service.updateProfile(STUDENT_ID, USER_ID, {
          dateOfBirth: '2099-01-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(b.prisma.student.update).not.toHaveBeenCalled();
    });
  });

  describe('sendPhoneCode', () => {
    it("sends the moderated text to the card's own number and stores only a hash", async () => {
      const b = build();

      const res = await b.service.sendPhoneCode(STUDENT_ID);

      expect(res).toEqual({ phone: PHONE, expiresInSec: 300, resendInSec: 60 });
      const [to, message] = b.eskiz.sendSms.mock.calls[0];
      expect(to).toBe(PHONE);
      expect(message).toMatch(
        /^DaF Sprachzentrum mobil ilovasida telefon raqamingizni tasdiqlash uchun kod: \d{4}$/,
      );
      const code = /(\d{4})$/.exec(message)![1];
      const stored = JSON.parse(
        b.redis.store.get(`phone_verify:code:${STUDENT_ID}`)!,
      );
      expect(stored).toEqual({ h: sha(code), n: 3, p: PHONE });
      const audit = b.prisma.smsMessage.create.mock.calls[0][0].data;
      expect(audit.content).not.toMatch(/\d{4}/);
      expect(audit.status).toBe('SENT');
    });

    it('refuses a second send inside the cooldown with 429', async () => {
      const b = build();
      await b.service.sendPhoneCode(STUDENT_ID);

      const err = await b.service.sendPhoneCode(STUDENT_ID).catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(b.eskiz.sendSms).toHaveBeenCalledTimes(1);
    });

    it('stops at the daily limit', async () => {
      const b = build();
      await b.redis.set(`phone_verify:daily:${STUDENT_ID}`, '5');

      const err = await b.service.sendPhoneCode(STUDENT_ID).catch((e) => e);

      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(b.eskiz.sendSms).not.toHaveBeenCalled();
    });

    it('stops at the global hourly cap', async () => {
      const b = build(
        {},
        {
          STUDENT_PHONE_VERIFICATION_ENABLED: 'true',
          PHONE_VERIFY_SMS_GLOBAL_HOURLY_CAP: '1',
        },
      );
      const bucket = Math.floor(Date.now() / 3_600_000);
      await b.redis.set(`phone_verify:global:${bucket}`, '1');

      const err = await b.service.sendPhoneCode(STUDENT_ID).catch((e) => e);

      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(b.eskiz.sendSms).not.toHaveBeenCalled();
    });

    it('gives the attempt back when Eskiz fails, and burns the useless code', async () => {
      const b = build();
      b.eskiz.sendSms.mockRejectedValue(new Error('Eskiz send failed: 400'));

      await expect(b.service.sendPhoneCode(STUDENT_ID)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      expect(b.redis.store.has(`phone_verify:code:${STUDENT_ID}`)).toBe(false);
      expect(b.redis.store.get(`phone_verify:daily:${STUDENT_ID}`)).toBe('0');
      expect(b.prisma.smsMessage.create.mock.calls[0][0].data.status).toBe(
        'FAILED',
      );
    });

    it('refuses when the switch is off, the number is proved, or no SMS can reach it', async () => {
      await expect(
        build({}, {}).service.sendPhoneCode(STUDENT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        build({ verifiedPhone: PHONE }).service.sendPhoneCode(STUDENT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        build({ phone: '4917612345678' }).service.sendPhoneCode(STUDENT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('verifyPhoneCode', () => {
    it('marks the number as proved, burns the code and journals it', async () => {
      const b = build({ gender: 'MALE', dateOfBirth: new Date('2004-03-15') });
      const code = await sendAndCatchCode(b);

      const res = await b.service.verifyPhoneCode(STUDENT_ID, USER_ID, code);

      expect(res).toEqual({ missing: [], phone: PHONE, phoneVerified: true });
      expect(b.row.verifiedPhone).toBe(PHONE);
      expect(b.row.phoneVerifiedAt).toBeInstanceOf(Date);
      expect(b.redis.store.has(`phone_verify:code:${STUDENT_ID}`)).toBe(false);
      expect(b.entityHistory.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          newValues: { telefonTasdigi: `${PHONE} SMS orqali tasdiqlandi` },
        }),
      );
    });

    it('counts down wrong attempts and burns the code on the third', async () => {
      const b = build();
      const code = await sendAndCatchCode(b);
      const wrong = code === '1111' ? '2222' : '1111';

      await expect(
        b.service.verifyPhoneCode(STUDENT_ID, USER_ID, wrong),
      ).rejects.toThrow(/Qolgan urinishlar: 2/);
      await expect(
        b.service.verifyPhoneCode(STUDENT_ID, USER_ID, wrong),
      ).rejects.toThrow(/Qolgan urinishlar: 1/);
      await expect(
        b.service.verifyPhoneCode(STUDENT_ID, USER_ID, wrong),
      ).rejects.toThrow(/yangi kod/);
      // Burned: even the right code no longer works.
      await expect(
        b.service.verifyPhoneCode(STUDENT_ID, USER_ID, code),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(b.row.verifiedPhone).toBeNull();
    });

    it('refuses a code sent to a number staff have since replaced', async () => {
      const b = build();
      const code = await sendAndCatchCode(b);
      b.row.phone = '935554433';

      await expect(
        b.service.verifyPhoneCode(STUDENT_ID, USER_ID, code),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(b.row.verifiedPhone).toBeNull();
    });

    it('caps verify calls per student per hour', async () => {
      const b = build();
      await b.redis.set(`phone_verify:verify:${STUDENT_ID}`, '30');

      const err = await b.service
        .verifyPhoneCode(STUDENT_ID, USER_ID, '1234')
        .catch((e) => e);

      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('is a no-op for an already proved number', async () => {
      const b = build({ verifiedPhone: PHONE });

      const res = await b.service.verifyPhoneCode(STUDENT_ID, USER_ID, '1234');

      expect(res.phoneVerified).toBe(true);
      expect(b.prisma.student.updateMany).not.toHaveBeenCalled();
    });
  });

  // «Bu sizning raqamingizmi?» — «Yo'q». The card carries a number that is
  // not the student's; the code goes to the number they type and, proved,
  // that number replaces the card's (CEO, 2026-09-27).
  describe("replacing the card number (Yo'q, boshqa raqam)", () => {
    it('sends the code to the typed number, bound to the card it replaces', async () => {
      const b = build();

      const res = await b.service.sendChangeCode(
        STUDENT_ID,
        USER_ID,
        OWN_PHONE,
        PASSWORD,
      );

      expect(res.phone).toBe(OWN_PHONE);
      const [to, message] = b.eskiz.sendSms.mock.calls[0];
      expect(to).toBe(OWN_PHONE);
      expect(message).toMatch(/tasdiqlash uchun kod: \d{4}$/);
      const stored = JSON.parse(
        b.redis.store.get(`phone_verify:code:${STUDENT_ID}`)!,
      );
      expect(stored).toMatchObject({ p: OWN_PHONE, from: PHONE, n: 3 });
      // Staff see where the code went in the SMS tab — never the code.
      const audit = b.prisma.smsMessage.create.mock.calls[0][0].data;
      expect(audit.content).toContain(OWN_PHONE);
      expect(audit.content).not.toMatch(/\b\d{4}\b/);
    });

    it('a correct code puts the proved number on the card and the account', async () => {
      const b = build({
        gender: 'FEMALE',
        dateOfBirth: new Date('2004-03-15'),
      });
      const code = await sendChangeAndCatchCode(b);

      const res = await b.service.verifyPhoneCode(STUDENT_ID, USER_ID, code);

      expect(res).toEqual({
        missing: [],
        phone: OWN_PHONE,
        phoneVerified: true,
      });
      expect(b.row.phone).toBe(OWN_PHONE);
      expect(b.row.verifiedPhone).toBe(OWN_PHONE);
      expect(b.row.phoneVerifiedAt).toBeInstanceOf(Date);
      // ADR-0032: the sign-in account moves with the card — the old number
      // no longer opens it.
      expect(b.account.phone).toBe(OWN_PHONE);
      expect(b.account.login).toBe(OWN_PHONE);
      expect(b.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(b.entityHistory.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: STUDENT_ID,
          oldValues: expect.objectContaining({ phone: PHONE, login: PHONE }),
          newValues: expect.objectContaining({
            phone: OWN_PHONE,
            login: OWN_PHONE,
            telefonTasdigi: `${OWN_PHONE} SMS orqali tasdiqlandi`,
          }),
          changedById: USER_ID,
        }),
      );
      // The reason survives the diff only when oldValues carries it too.
      const { oldValues, newValues } =
        b.entityHistory.recordUpdate.mock.calls[0][0];
      expect(
        computeChangedFields(oldValues, newValues)?.newValues,
      ).toHaveProperty(
        'sabab',
        "O'quvchi eski raqam o'rniga o'z raqamini kiritdi",
      );
    });

    it('asks for the current password first — a wrong one sends nothing and reveals nothing', async () => {
      const b = build();
      b.taken.cards.add(OWN_PHONE);

      await expect(
        b.service.sendChangeCode(STUDENT_ID, USER_ID, OWN_PHONE, 'notit'),
      ).rejects.toThrow(WRONG_CURRENT_PASSWORD_MESSAGE);

      expect(b.eskiz.sendSms).not.toHaveBeenCalled();
      // Refused before any limit was spent.
      expect(b.redis.store.has(`phone_verify:daily:${STUDENT_ID}`)).toBe(false);
    });

    it("refuses a number another student's card or account signs in with", async () => {
      const onCard = build();
      onCard.taken.cards.add(OWN_PHONE);
      await expect(sendChangeAndCatchCode(onCard)).rejects.toThrow(
        NUMBER_TAKEN_MESSAGE,
      );

      const onAccount = build();
      onAccount.taken.accounts.add(OWN_PHONE);
      await expect(sendChangeAndCatchCode(onAccount)).rejects.toThrow(
        NUMBER_TAKEN_MESSAGE,
      );
      expect(onAccount.eskiz.sendSms).not.toHaveBeenCalled();
    });

    it('refuses the number already on the card — that is the «Ha» path', async () => {
      const b = build();
      await expect(
        b.service.sendChangeCode(STUDENT_ID, USER_ID, PHONE, PASSWORD),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(b.eskiz.sendSms).not.toHaveBeenCalled();
    });

    it("a new main number that was the card's backup number empties the backup (ADR-0070)", async () => {
      const b = build({ extraPhone: OWN_PHONE });
      await b.service.sendChangeCode(STUDENT_ID, USER_ID, OWN_PHONE, PASSWORD);
      const [, message] = b.eskiz.sendSms.mock.calls.at(-1)!;
      const code = /(\d{4})$/.exec(message)![1];

      await b.service.verifyPhoneCode(STUDENT_ID, USER_ID, code);

      expect(b.row.phone).toBe(OWN_PHONE);
      expect(b.row.extraPhone).toBeNull();
      const history = b.entityHistory.recordUpdate.mock.calls.at(-1)![0];
      expect(history.oldValues.extraPhone).toBe(OWN_PHONE);
      expect(history.newValues.extraPhone).toBeNull();
    });

    it('re-checks the number when the code comes back — taken meanwhile, nothing is written', async () => {
      const b = build();
      const code = await sendChangeAndCatchCode(b);
      b.taken.cards.add(OWN_PHONE);

      await expect(
        b.service.verifyPhoneCode(STUDENT_ID, USER_ID, code),
      ).rejects.toThrow(NUMBER_TAKEN_MESSAGE);

      expect(b.row.phone).toBe(PHONE);
      expect(b.row.verifiedPhone).toBeNull();
      expect(b.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a code sent before staff changed the card is void', async () => {
      const b = build();
      const code = await sendChangeAndCatchCode(b);
      b.row.phone = '977001122'; // staff edited the card meanwhile

      await expect(
        b.service.verifyPhoneCode(STUDENT_ID, USER_ID, code),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(b.row.phone).toBe('977001122');
      expect(b.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('caps the codes one typed number can receive in a day', async () => {
      const b = build();
      await b.redis.set(`phone_verify:number_daily:${OWN_PHONE}`, '3');

      const err = await sendChangeAndCatchCode(b).catch((e) => e);

      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(b.eskiz.sendSms).not.toHaveBeenCalled();
    });

    it('is closed once the card number is proved, and while the switch is off', async () => {
      await expect(
        sendChangeAndCatchCode(build({ verifiedPhone: PHONE })),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        sendChangeAndCatchCode(build({}, {})),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('the SMS text is pure ASCII (one segment) and ends with the code', () => {
    const text = buildPhoneVerifyMessage('4821');
    expect(text).toMatch(/^[\x20-\x7e]+$/);
    expect(text.endsWith(': 4821')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(160);
  });
});
