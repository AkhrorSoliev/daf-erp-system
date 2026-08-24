import { Logger } from '@nestjs/common';
import { PortalPasswordResetService } from './portal-password-reset.service';

function build() {
  const prisma = {
    user: {
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    student: { findFirst: jest.fn() },
  };
  const entityHistory = {
    recordUpdate: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PortalPasswordResetService(
    prisma as any,
    entityHistory as any,
  );
  return { service, prisma, entityHistory };
}

describe('PortalPasswordResetService', () => {
  describe('resolveByPhone', () => {
    it('matches by login OR phone, ACTIVE/INACTIVE, newest first; scopes to the portal roles', async () => {
      const { service, prisma } = build();
      prisma.user.findMany.mockResolvedValue([{ id: 10001, companyId: 2 }]);
      prisma.student.findFirst.mockResolvedValue({ id: 10050, companyId: 2 });

      const target = await service.resolveByPhone('901234567', [1, 2, 3, 5]);

      expect(target).toEqual({ userId: 10001, studentId: 10050, companyId: 2 });
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { login: '901234567' },
        { phone: '901234567' },
      ]);
      expect(where.deletedAt).toBeNull();
      expect(where.status).toEqual({ in: ['ACTIVE', 'INACTIVE'] });
      expect(where.roles).toEqual({
        some: { role: { id: { in: [1, 2, 3, 5] } } },
      });
      expect(prisma.user.findMany.mock.calls[0][0].orderBy).toEqual({
        updatedAt: 'desc',
      });
    });

    it('applies no role filter when allowedRoleIds is null (dev/localhost)', async () => {
      const { service, prisma } = build();
      prisma.user.findMany.mockResolvedValue([{ id: 10001, companyId: 2 }]);
      prisma.student.findFirst.mockResolvedValue(null);

      await service.resolveByPhone('901234567', null);

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.roles).toBeUndefined();
    });

    it('refuses when the phone spans more than one company, and says why', async () => {
      const { service, prisma } = build();
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      prisma.user.findMany.mockResolvedValue([
        { id: 10001, companyId: 1001 },
        { id: 20002, companyId: 2002 },
      ]);

      // Fail closed: guessing the winner would set a password on whichever
      // tenant's account happened to be touched last.
      expect(await service.resolveByPhone('901234567', null)).toBeNull();
      expect(prisma.student.findFirst).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('901234567'));
      error.mockRestore();
    });

    it('still resolves when several accounts share the phone WITHIN one company', async () => {
      const { service, prisma } = build();
      // The real 4-account number in production. Same tenant, so the
      // most-recently-updated tiebreak stays in force.
      prisma.user.findMany.mockResolvedValue([
        { id: 10001, companyId: 1001 },
        { id: 10002, companyId: 1001 },
        { id: 10003, companyId: 1001 },
        { id: 10004, companyId: 1001 },
      ]);
      prisma.student.findFirst.mockResolvedValue(null);

      const target = await service.resolveByPhone('972062922', null);

      expect(target).toEqual({
        userId: 10001,
        studentId: undefined,
        companyId: 1001,
      });
    });

    it('bounds the candidate read instead of loading every match', async () => {
      const { service, prisma } = build();
      prisma.user.findMany.mockResolvedValue([]);

      await service.resolveByPhone('901234567', null);

      expect(prisma.user.findMany.mock.calls[0][0].take).toBe(10);
    });

    it('returns null when no resettable account exists', async () => {
      const { service, prisma } = build();
      prisma.user.findMany.mockResolvedValue([]);
      expect(await service.resolveByPhone('901234567', [6])).toBeNull();
      expect(prisma.student.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('applyNewPassword', () => {
    it('hashes the password, updates the user, and audits on the student', async () => {
      const { service, prisma, entityHistory } = build();
      const target = { userId: 10001, studentId: 10050, companyId: 2 };

      await service.applyNewPassword(
        target,
        'newpass123',
        'SMS orqali tiklandi',
      );

      const update = prisma.user.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 10001 });
      expect(update.data.password).not.toBe('newpass123'); // hashed
      expect(update.data.password).toMatch(/^\$2[aby]\$/); // bcrypt hash
      expect(entityHistory.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: 10050,
          newValues: { parol: 'SMS orqali tiklandi' },
          changedById: 10001,
          companyId: 2,
        }),
      );
    });

    it('skips the audit when there is no linked student', async () => {
      const { service, prisma, entityHistory } = build();
      await service.applyNewPassword(
        { userId: 10001, companyId: null },
        'newpass123',
        'SMS orqali tiklandi',
      );
      expect(prisma.user.update).toHaveBeenCalled();
      expect(entityHistory.recordUpdate).not.toHaveBeenCalled();
    });
  });
});
