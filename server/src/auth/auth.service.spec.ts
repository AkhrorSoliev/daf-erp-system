import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
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

  describe('exchangeOtp', () => {
    it('rejects an invalid or expired code', async () => {
      redis.get.mockResolvedValue(null);
      await expect(service.exchangeOtp('000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('issues a session for a valid student code and consumes it', async () => {
      redis.get.mockResolvedValue('555');
      prisma.user.findFirst.mockResolvedValue({
        id: 555,
        companyId: 1,
        status: 'ACTIVE',
        roles: [{ role: { id: 6, name: 'Student' } }],
        branches: [],
        company: {},
      });
      const res = await service.exchangeOtp('123456');
      expect(res.accessToken).toBe('tok');
      expect(res.user.studentId).toBe(10001);
      expect(redis.del).toHaveBeenCalled();
    });

    it('rejects a non-student code holder', async () => {
      redis.get.mockResolvedValue('556');
      prisma.user.findFirst.mockResolvedValue({
        id: 556,
        companyId: 1,
        status: 'ACTIVE',
        roles: [{ role: { id: 4, name: 'Teacher' } }],
        branches: [],
        company: {},
      });
      await expect(service.exchangeOtp('123456')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
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
