import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;
  let config: any;
  let redis: any;
  let history: any;

  const student = {
    id: 1,
    companyId: 1,
    roles: [{ role: { id: 6, name: 'Student' } }],
    branches: [],
    company: {},
  };
  const teacher = {
    id: 2,
    companyId: 1,
    roles: [{ role: { id: 4, name: 'Teacher' } }],
    branches: [],
    company: {},
  };

  beforeEach(() => {
    prisma = {
      student: { findFirst: jest.fn().mockResolvedValue({ id: 10001 }) },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('tok'), verify: jest.fn() };
    config = { get: jest.fn().mockReturnValue('secret') };
    redis = {
      get: jest.fn(),
      del: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
    };
    history = { recordUpdate: jest.fn() };
    service = new AuthService(prisma, jwt, config, redis, history);
  });

  describe('login — portal role gate', () => {
    it('allows a Student when X-Portal=student and attaches studentId', async () => {
      const res = await service.login(student, undefined, 'student');
      expect(res.accessToken).toBe('tok');
      expect(res.user.studentId).toBe(10001);
    });

    it('rejects a non-Student when X-Portal=student (native gate)', async () => {
      await expect(
        service.login(teacher, undefined, 'student'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a Student on the admin web portal (Origin gate still works)', async () => {
      await expect(
        service.login(student, 'https://admin.dafzentrum.uz', undefined),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('applies no restriction when neither Origin nor X-Portal is present (dev)', async () => {
      const res = await service.login(teacher, undefined, undefined);
      expect(res.accessToken).toBe('tok');
    });
  });

  describe('validateUser — phone-based login', () => {
    it('matches by phone field, scopes to the portal roles, strips the password', async () => {
      const hash = await bcrypt.hash('pass123', 10);
      prisma.user.findFirst.mockResolvedValue({
        id: 5,
        password: hash,
        roles: [{ role: { id: 3, name: 'Administrator' } }],
        branches: [],
        company: {},
      });

      const res = await service.validateUser(
        '972062922',
        'pass123',
        [1, 2, 3, 5],
      );

      expect(res).toBeTruthy();
      expect((res as any).password).toBeUndefined();
      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { phone: '972062922' },
          { login: '972062922' },
        ]),
      );
      expect(where.roles).toEqual({
        some: { role: { id: { in: [1, 2, 3, 5] } } },
      });
      expect(where.status).toEqual({ in: ['ACTIVE', 'INACTIVE'] });
      expect(prisma.user.findFirst.mock.calls[0][0].orderBy).toEqual({
        updatedAt: 'desc',
      });
    });

    it('normalizes a +998-prefixed phone to 9 digits', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await service.validateUser('+998 97 206 29 22', 'x', null);
      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([{ phone: '972062922' }]),
      );
    });

    it('falls back to the legacy username when the identifier is not a phone', async () => {
      const hash = await bcrypt.hash('pass123', 10);
      prisma.user.findFirst.mockResolvedValue({
        id: 1,
        password: hash,
        roles: [],
        branches: [],
        company: {},
      });

      await service.validateUser('ceo', 'pass123', [1, 2, 3, 5]);

      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ login: 'ceo' }]);
    });

    it('returns null on a wrong password', async () => {
      const hash = await bcrypt.hash('pass123', 10);
      prisma.user.findFirst.mockResolvedValue({
        id: 5,
        password: hash,
        roles: [],
        branches: [],
        company: {},
      });
      expect(await service.validateUser('972062922', 'WRONG', null)).toBeNull();
    });

    it('applies no role filter when allowedRoleIds is null (dev)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await service.validateUser('972062922', 'x', null);
      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.roles).toBeUndefined();
    });

    it('finds a foreign-number account by its stored country-coded digits', async () => {
      // normalizeSharedPhone bunday raqamni kod bilan saqlaydi (491749493338).
      // Bugungi kod uni tanimaydi — shu sabab chet el raqamli akkaunt kira olmaydi.
      prisma.user.findFirst.mockResolvedValue(null);

      await service.validateUser('+49 174 9493338', 'x', null);

      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { phone: '491749493338' },
          { login: '491749493338' },
        ]),
      );
    });

    it('lets a legacy username account sign in with its phone number', async () => {
      // `namangantest` — bot username bergan eski akkaunt. Uning telefoni
      // 9 xonali saqlangan, ya'ni telefon bo'yicha topilishi SHART.
      const hash = await bcrypt.hash('pass123', 10);
      prisma.user.findFirst.mockResolvedValue({
        id: 7,
        login: 'namangantest',
        phone: '901234567',
        password: hash,
        roles: [{ role: { id: 4, name: 'Teacher' } }],
        branches: [],
        company: {},
      });

      const res = await service.validateUser('901234567', 'pass123', [4]);

      expect(res).toBeTruthy();
      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([{ phone: '901234567' }]),
      );
    });

    it('keeps the OR clauses deduplicated', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await service.validateUser('901234567', 'x', null);

      const where = prisma.user.findFirst.mock.calls[0][0].where;
      const seen = where.OR.map((c: any) => JSON.stringify(c));
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('parolsiz xodimni hech qanday portal filtri bilan kirita olmaydi', async () => {
      // A role-less employee (a cleaner, a guard) is created without a password.
      // This is the guarantee that holds even on localhost, where the portal
      // role filter is null and therefore applies nothing.
      prisma.user.findFirst.mockResolvedValue({
        id: 10500,
        firstName: 'Zulfiya',
        lastName: 'Karimova',
        position: 'Farrosh',
        password: null,
        roles: [],
        branches: [{ branch: { id: 7, name: "Farg'ona filiali" } }],
      });

      await expect(
        service.validateUser('901234567', 'nimadir', null),
      ).resolves.toBeNull();

      await expect(
        service.validateUser('901234567', 'nimadir', [1, 2, 3, 5]),
      ).resolves.toBeNull();
    });
  });

  describe('findAccountByIdentifier', () => {
    it('validateUser bilan AYNAN bir xil OR shartlarini yasaydi', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await service.validateUser('+998 97 206 29 22', 'x', [1, 2, 3, 5]);
      const fromValidate = prisma.user.findFirst.mock.calls[0][0];

      prisma.user.findFirst.mockClear();
      prisma.user.findFirst.mockResolvedValue(null);

      await service.findAccountByIdentifier('+998 97 206 29 22', [1, 2, 3, 5]);
      const fromFinder = prisma.user.findFirst.mock.calls[0][0];

      expect(fromFinder).toEqual(fromValidate);
    });

    it('parolni tekshirmaydi — topilgan qatorni qaytaradi', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 5,
        password: 'hash',
        roles: [],
        branches: [],
        company: {},
      });

      const found = await service.findAccountByIdentifier('901234567', null);
      expect(found).toMatchObject({ id: 5 });
    });
  });

  describe('findAccountsByIdentifier', () => {
    it("findAccountByIdentifier bilan AYNAN bir xil shartni ishlatadi (faqat take qo'shiladi)", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findMany.mockResolvedValue([]);

      await service.findAccountByIdentifier('+998 97 206 29 22', [1, 2, 3, 5]);
      const fromSingle = prisma.user.findFirst.mock.calls[0][0];

      await service.findAccountsByIdentifier(
        '+998 97 206 29 22',
        [1, 2, 3, 5],
        2,
      );
      const fromMulti = prisma.user.findMany.mock.calls[0][0];

      const { take, ...rest } = fromMulti;
      expect(take).toBe(2);
      expect(rest).toEqual(fromSingle);
    });

    it("bir raqamdagi ikki akkauntni ikkitasi bilan qaytaradi (noaniqlik ko'rinadi)", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 5 }, { id: 6 }]);
      const rows = await service.findAccountsByIdentifier(
        '972062922',
        [1, 2, 3, 5],
      );
      expect(rows).toHaveLength(2);
    });
  });

  describe('pollLoginRequest', () => {
    it('returns pending for an empty requestId', async () => {
      const res = await service.pollLoginRequest('');
      expect(res).toEqual({ status: 'pending' });
    });

    it('returns pending until the bot approves the request', async () => {
      redis.get.mockResolvedValue(null);
      const res = await service.pollLoginRequest('req-abc12345');
      expect(res.status).toBe('pending');
    });

    it('returns an approved session once the bot approves', async () => {
      redis.get.mockResolvedValue('555');
      prisma.user.findFirst.mockResolvedValue({
        id: 555,
        companyId: 1,
        status: 'ACTIVE',
        roles: [{ role: { id: 6, name: 'Student' } }],
        branches: [],
        company: {},
      });
      const res = await service.pollLoginRequest('req-abc12345');
      expect(res.status).toBe('approved');
      expect((res as { accessToken?: string }).accessToken).toBe('tok');
      expect(redis.del).toHaveBeenCalled();
    });
  });

  describe('session version (ADR-0030)', () => {
    const liveTeacher = {
      ...teacher,
      status: 'ACTIVE',
      deletedAt: null,
      sessionVersion: 3,
    };

    it('stamps the account session version into both tokens', async () => {
      await service.login(liveTeacher, undefined, undefined);

      expect(jwt.sign.mock.calls[0][0]).toMatchObject({ sub: 2, sv: 3 });
      expect(jwt.sign.mock.calls[1][0]).toEqual({
        sub: 2,
        type: 'refresh',
        sv: 3,
      });
    });

    it('refreshes a token that carries the current version', async () => {
      jwt.verify.mockReturnValue({ sub: 2, type: 'refresh', sv: 3 });
      prisma.user.findFirst.mockResolvedValue(liveTeacher);

      const res = await service.refresh('refresh-token');

      expect(res.accessToken).toBe('tok');
      expect(jwt.sign.mock.calls[1][0]).toEqual({
        sub: 2,
        type: 'refresh',
        sv: 3,
      });
    });

    it('refuses a token minted before the last password change', async () => {
      jwt.verify.mockReturnValue({ sub: 2, type: 'refresh', sv: 2 });
      prisma.user.findFirst.mockResolvedValue(liveTeacher);

      await expect(service.refresh('refresh-token')).rejects.toThrow(
        'Sessiya tugagan. Iltimos, qaytadan kiring.',
      );
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('keeps a pre-deploy token (no sv) alive only until the first bump', async () => {
      jwt.verify.mockReturnValue({ sub: 2, type: 'refresh' });

      prisma.user.findFirst.mockResolvedValue({
        ...liveTeacher,
        sessionVersion: 0,
      });
      await expect(service.refresh('old-token')).resolves.toHaveProperty(
        'accessToken',
      );

      prisma.user.findFirst.mockResolvedValue({
        ...liveTeacher,
        sessionVersion: 1,
      });
      await expect(service.refresh('old-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses a malformed session version', async () => {
      jwt.verify.mockReturnValue({ sub: 2, type: 'refresh', sv: '3' });
      prisma.user.findFirst.mockResolvedValue(liveTeacher);

      await expect(service.refresh('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    describe('issueSession', () => {
      it("signs with the version the caller's own write produced, never a re-read one", async () => {
        // A bump that lands between the caller's write and this read (the
        // owner's password change) must win: re-reading 9 here would hand the
        // caller a session that survives it.
        prisma.user.findFirst.mockResolvedValue({
          ...liveTeacher,
          sessionVersion: 9,
        });

        const res = await service.issueSession(2, 7);

        expect(res.accessToken).toBe('tok');
        expect(jwt.sign.mock.calls[0][0]).toMatchObject({ sub: 2, sv: 7 });
        expect(jwt.sign.mock.calls[1][0]).toEqual({
          sub: 2,
          type: 'refresh',
          sv: 7,
        });
        expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
          id: 2,
          deletedAt: null,
        });
      });

      it('refuses a blocked account', async () => {
        prisma.user.findFirst.mockResolvedValue({
          ...liveTeacher,
          status: 'SUSPENDED',
        });

        await expect(service.issueSession(2, 3)).rejects.toThrow(
          'Hisobingiz bloklangan',
        );
      });
    });

    describe('logoutOtherSessions', () => {
      it("bumps only from the caller's own version, mirrors it, journals it and re-issues this device", async () => {
        prisma.user.updateMany.mockResolvedValue({ count: 1 });
        prisma.user.findUnique.mockResolvedValue({
          companyId: 1,
          student: { id: 10001 },
        });
        prisma.user.findFirst.mockResolvedValue({
          ...student,
          status: 'ACTIVE',
          deletedAt: null,
          sessionVersion: 5,
        });

        const res = await service.logoutOtherSessions(1, 4);

        expect(prisma.user.updateMany.mock.calls[0][0]).toEqual({
          where: { id: 1, sessionVersion: 4 },
          data: { sessionVersion: { increment: 1 } },
        });
        expect(redis.set).toHaveBeenCalledWith(
          'user:session-version:1',
          '5',
          'EX',
          expect.any(Number),
        );
        expect(history.recordUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'Student',
            entityId: 10001,
            newValues: { kirishlar: 'boshqa qurilmalardan chiqildi' },
            changedById: 1,
            companyId: 1,
          }),
        );
        expect(res.accessToken).toBe('tok');
        expect(jwt.sign.mock.calls[0][0]).toMatchObject({ sub: 1, sv: 5 });
      });

      it('refuses a caller whose session is already behind, and changes nothing', async () => {
        // The guard lets a stale token through while Redis is down, or a
        // bump lands mid-request. Either way this route must not turn that
        // token into a current session.
        prisma.user.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.logoutOtherSessions(1, 2)).rejects.toThrow(
          'Sessiya tugagan. Iltimos, qaytadan kiring.',
        );
        expect(redis.set).not.toHaveBeenCalled();
        expect(history.recordUpdate).not.toHaveBeenCalled();
        expect(jwt.sign).not.toHaveBeenCalled();
      });

      it('signs with its own new version even when a later bump already landed', async () => {
        prisma.user.updateMany.mockResolvedValue({ count: 1 });
        prisma.user.findUnique.mockResolvedValue({
          companyId: 1,
          student: null,
        });
        prisma.user.findFirst.mockResolvedValue({
          ...teacher,
          status: 'ACTIVE',
          deletedAt: null,
          sessionVersion: 6, // the owner's password change came right after
        });

        await service.logoutOtherSessions(2, 4);

        expect(jwt.sign.mock.calls[0][0]).toMatchObject({ sub: 2, sv: 5 });
      });

      it('journals a staff account on the employee record', async () => {
        prisma.user.updateMany.mockResolvedValue({ count: 1 });
        prisma.user.findUnique.mockResolvedValue({
          companyId: 1,
          student: null,
        });
        prisma.user.findFirst.mockResolvedValue({
          ...teacher,
          status: 'ACTIVE',
          deletedAt: null,
          sessionVersion: 3,
        });

        await service.logoutOtherSessions(2, 2);

        expect(history.recordUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ entityType: 'User', entityId: 2 }),
        );
      });
    });
  });
});
