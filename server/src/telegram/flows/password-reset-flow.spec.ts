import { UserStatus } from '@prisma/client';
import {
  checkThrottle,
  findStudentByChatId,
  findStudentByPhone,
  formatRetryAfter,
  linkChatIdToStudent,
  PortalAccountMissingError,
  resetPassword,
  UserNotResettableError,
} from './password-reset-flow';

describe('password-reset-flow', () => {
  let prisma: any;
  let redis: any;
  let entityHistory: any;

  const baseStudent = {
    id: 12345,
    firstName: 'Akmal',
    lastName: 'Karimov',
    phone: '901234567',
    userId: 99001,
    companyId: 1001,
  };

  beforeEach(() => {
    prisma = {
      student: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    redis = {
      ttl: jest.fn().mockResolvedValue(-2),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    entityHistory = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
  });

  describe('findStudentByChatId', () => {
    it('queries by telegramChatId and excludes deleted students', async () => {
      prisma.student.findFirst.mockResolvedValue(baseStudent);

      const result = await findStudentByChatId(prisma, '555');

      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { telegramChatId: '555', deletedAt: null },
        }),
      );
      expect(result).toEqual(baseStudent);
    });
  });

  describe('findStudentByPhone', () => {
    it('queries by phone and excludes deleted students', async () => {
      prisma.student.findFirst.mockResolvedValue(baseStudent);

      await findStudentByPhone(prisma, '901234567');

      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { phone: '901234567', deletedAt: null },
        }),
      );
    });
  });

  describe('linkChatIdToStudent', () => {
    it('updates telegramChatId on the matching student', async () => {
      await linkChatIdToStudent(prisma, 12345, '777');

      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 12345 },
        data: { telegramChatId: '777' },
      });
    });
  });

  describe('checkThrottle', () => {
    it('allows the request when no cooldown and no daily counter', async () => {
      const result = await checkThrottle(redis, 12345);
      expect(result).toEqual({ allowed: true });
    });

    it('blocks when cooldown TTL is still active', async () => {
      redis.ttl.mockImplementation((key: string) =>
        key.includes('cooldown') ? Promise.resolve(120) : Promise.resolve(-2),
      );

      const result = await checkThrottle(redis, 12345);

      expect(result).toEqual({
        allowed: false,
        reason: 'cooldown',
        retryAfterSec: 120,
      });
    });

    it('blocks when daily counter has reached the limit (3)', async () => {
      redis.ttl.mockImplementation((key: string) =>
        key.includes('cooldown') ? Promise.resolve(-2) : Promise.resolve(3600),
      );
      redis.get.mockResolvedValue('3');

      const result = await checkThrottle(redis, 12345);

      expect(result).toEqual({
        allowed: false,
        reason: 'daily_limit',
        retryAfterSec: 3600,
      });
    });

    it('allows the request when daily count is below limit', async () => {
      redis.get.mockResolvedValue('2');
      const result = await checkThrottle(redis, 12345);
      expect(result).toEqual({ allowed: true });
    });
  });

  describe('resetPassword', () => {
    it('throws PortalAccountMissingError when student has no userId', async () => {
      await expect(
        resetPassword(prisma, entityHistory, redis, {
          ...baseStudent,
          userId: null,
        }),
      ).rejects.toBeInstanceOf(PortalAccountMissingError);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws PortalAccountMissingError when User row is missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        resetPassword(prisma, entityHistory, redis, baseStudent),
      ).rejects.toBeInstanceOf(PortalAccountMissingError);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws UserNotResettableError when User is SUSPENDED', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 99001,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        resetPassword(prisma, entityHistory, redis, baseStudent),
      ).rejects.toBeInstanceOf(UserNotResettableError);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('hashes a new password and writes an audit record without leaking it', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 99001,
        status: UserStatus.ACTIVE,
      });

      const { plainPassword } = await resetPassword(
        prisma,
        entityHistory,
        redis,
        baseStudent,
      );

      expect(plainPassword).toMatch(/^.{8}$/);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 99001 },
          data: expect.objectContaining({
            password: expect.any(String),
          }),
        }),
      );
      const passedHash = prisma.user.update.mock.calls[0][0].data.password;
      expect(passedHash).not.toContain(plainPassword);

      expect(entityHistory.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: 12345,
          oldValues: { parol: '***' },
          newValues: expect.objectContaining({ parol: expect.any(String) }),
          changedById: 99001,
          companyId: 1001,
        }),
      );
      const auditNewValues =
        entityHistory.recordUpdate.mock.calls[0][0].newValues;
      expect(auditNewValues.parol).not.toContain(plainPassword);
    });

    it('also accepts INACTIVE users (auth.service allows them to log in)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 99001,
        status: UserStatus.INACTIVE,
      });

      await expect(
        resetPassword(prisma, entityHistory, redis, baseStudent),
      ).resolves.toHaveProperty('plainPassword');
    });

    it('bumps the throttle counters after a successful reset', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 99001,
        status: UserStatus.ACTIVE,
      });
      redis.incr.mockResolvedValue(1);

      await resetPassword(prisma, entityHistory, redis, baseStudent);

      expect(redis.set).toHaveBeenCalledWith(
        'pwd_reset:cooldown:12345',
        '1',
        'EX',
        300,
      );
      expect(redis.incr).toHaveBeenCalledWith('pwd_reset:daily:12345');
      expect(redis.expire).toHaveBeenCalledWith('pwd_reset:daily:12345', 86400);
    });

    it('does not bump the daily TTL on the 2nd hit of the same day', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 99001,
        status: UserStatus.ACTIVE,
      });
      redis.incr.mockResolvedValue(2);

      await resetPassword(prisma, entityHistory, redis, baseStudent);

      expect(redis.expire).not.toHaveBeenCalled();
    });
  });

  describe('formatRetryAfter', () => {
    it('formats seconds under a minute', () => {
      expect(formatRetryAfter(45)).toBe('45 soniya');
    });
    it('rounds up partial minutes', () => {
      expect(formatRetryAfter(61)).toBe('2 daqiqa');
      expect(formatRetryAfter(300)).toBe('5 daqiqa');
    });
    it('formats hours-only durations', () => {
      expect(formatRetryAfter(3600)).toBe('1 soat');
    });
    it('formats hours + minutes', () => {
      expect(formatRetryAfter(3600 + 12 * 60)).toBe('1 soat 12 daqiqa');
    });
  });
});
