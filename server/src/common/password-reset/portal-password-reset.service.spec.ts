import { PortalPasswordResetService } from './portal-password-reset.service';

function build() {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    student: { findFirst: jest.fn() },
  };
  const entityHistory = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
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
      prisma.user.findFirst.mockResolvedValue({ id: 10001, companyId: 2 });
      prisma.student.findFirst.mockResolvedValue({ id: 10050, companyId: 2 });

      const target = await service.resolveByPhone('901234567', [1, 2, 3, 5]);

      expect(target).toEqual({ userId: 10001, studentId: 10050, companyId: 2 });
      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ login: '901234567' }, { phone: '901234567' }]);
      expect(where.deletedAt).toBeNull();
      expect(where.status).toEqual({ in: ['ACTIVE', 'INACTIVE'] });
      expect(where.roles).toEqual({ some: { role: { id: { in: [1, 2, 3, 5] } } } });
      expect(prisma.user.findFirst.mock.calls[0][0].orderBy).toEqual({
        updatedAt: 'desc',
      });
    });

    it('applies no role filter when allowedRoleIds is null (dev/localhost)', async () => {
      const { service, prisma } = build();
      prisma.user.findFirst.mockResolvedValue({ id: 10001, companyId: 2 });
      prisma.student.findFirst.mockResolvedValue(null);

      await service.resolveByPhone('901234567', null);

      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.roles).toBeUndefined();
    });

    it('returns null when no resettable account exists', async () => {
      const { service, prisma } = build();
      prisma.user.findFirst.mockResolvedValue(null);
      expect(await service.resolveByPhone('901234567', [6])).toBeNull();
      expect(prisma.student.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('applyNewPassword', () => {
    it('hashes the password, updates the user, and audits on the student', async () => {
      const { service, prisma, entityHistory } = build();
      const target = { userId: 10001, studentId: 10050, companyId: 2 };

      await service.applyNewPassword(target, 'newpass123', 'SMS orqali tiklandi');

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
