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
      user: { findFirst: jest.fn() },
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
