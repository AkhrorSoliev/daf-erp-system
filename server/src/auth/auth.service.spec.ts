import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;
  let config: any;
  let redis: any;

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
      user: { findFirst: jest.fn(), findMany: jest.fn() },
    };
    jwt = { sign: jest.fn().mockReturnValue('tok') };
    config = { get: jest.fn().mockReturnValue('secret') };
    redis = { get: jest.fn(), del: jest.fn() };
    service = new AuthService(prisma, jwt, config, redis);
  });

  describe('login — portal role gate', () => {
    it('allows a Student when X-Portal=student and attaches studentId', async () => {
      const res = await service.login(student, undefined, 'student');
      expect(res.accessToken).toBe('tok');
      expect(res.user.studentId).toBe(10001);
    });

    it('rejects a non-Student when X-Portal=student (native gate)', async () => {
      await expect(service.login(teacher, undefined, 'student')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
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

      const res = await service.validateUser('972062922', 'pass123', [1, 2, 3, 5]);

      expect(res).toBeTruthy();
      expect((res as any).password).toBeUndefined();
      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([{ phone: '972062922' }, { login: '972062922' }]),
      );
      expect(where.roles).toEqual({ some: { role: { id: { in: [1, 2, 3, 5] } } } });
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
      expect(where.OR).toEqual(expect.arrayContaining([{ phone: '901234567' }]));
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
    it('findAccountByIdentifier bilan AYNAN bir xil shartni ishlatadi (faqat take qo\'shiladi)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findMany.mockResolvedValue([]);

      await service.findAccountByIdentifier('+998 97 206 29 22', [1, 2, 3, 5]);
      const fromSingle = prisma.user.findFirst.mock.calls[0][0];

      await service.findAccountsByIdentifier('+998 97 206 29 22', [1, 2, 3, 5], 2);
      const fromMulti = prisma.user.findMany.mock.calls[0][0];

      const { take, ...rest } = fromMulti;
      expect(take).toBe(2);
      expect(rest).toEqual(fromSingle);
    });

    it('bir raqamdagi ikki akkauntni ikkitasi bilan qaytaradi (noaniqlik ko\'rinadi)', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 5 }, { id: 6 }]);
      const rows = await service.findAccountsByIdentifier('972062922', [1, 2, 3, 5]);
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
});
