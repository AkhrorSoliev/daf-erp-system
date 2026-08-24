import {
  resolveStudentBranchId,
  tryResolveStudentBranchId,
  tryResolveUserBranchId,
} from './resolve-branch';

const COMPANY = 1001;

function prismaMock(opts: {
  studentBranch?: { branchId: number } | null;
  enrollment?: { group: { branchId: number } } | null;
  user?: {
    mainBranch: number | null;
    branches: { branchId: number }[];
  } | null;
}) {
  return {
    studentBranch: {
      findFirst: jest.fn().mockResolvedValue(opts.studentBranch ?? null),
    },
    enrollment: {
      findFirst: jest.fn().mockResolvedValue(opts.enrollment ?? null),
    },
    user: { findUnique: jest.fn().mockResolvedValue(opts.user ?? null) },
  } as any;
}

describe('tryResolveStudentBranchId', () => {
  it('prefers the StudentBranch row — it is what every read path filters on', async () => {
    const prisma = prismaMock({
      studentBranch: { branchId: 2 },
      enrollment: { group: { branchId: 1 } },
    });
    await expect(
      tryResolveStudentBranchId(prisma, 10500, COMPANY),
    ).resolves.toBe(2);
    expect(prisma.enrollment.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the active enrollment group branch when no StudentBranch row exists', async () => {
    const prisma = prismaMock({
      studentBranch: null,
      enrollment: { group: { branchId: 1 } },
    });
    await expect(
      tryResolveStudentBranchId(prisma, 10500, COMPANY),
    ).resolves.toBe(1);
  });

  it('returns null when neither source knows the branch', async () => {
    const prisma = prismaMock({ studentBranch: null, enrollment: null });
    await expect(
      tryResolveStudentBranchId(prisma, 10500, COMPANY),
    ).resolves.toBeNull();
  });

  it('scopes both lookups to the company', async () => {
    const prisma = prismaMock({ studentBranch: null, enrollment: null });
    await tryResolveStudentBranchId(prisma, 10500, COMPANY);
    expect(prisma.studentBranch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: 10500, student: { companyId: COMPANY } },
      }),
    );
    expect(prisma.enrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: 10500,
          group: { companyId: COMPANY, deletedAt: null },
        }),
      }),
    );
  });
});

describe('resolveStudentBranchId (fail-closed)', () => {
  it('returns the resolved branch', async () => {
    const prisma = prismaMock({ studentBranch: { branchId: 2 } });
    await expect(resolveStudentBranchId(prisma, 10500, COMPANY)).resolves.toBe(
      2,
    );
  });

  it('throws rather than writing a branch-less financial row', async () => {
    const prisma = prismaMock({ studentBranch: null, enrollment: null });
    await expect(
      resolveStudentBranchId(prisma, 10500, COMPANY),
    ).rejects.toThrow(/filial aniqlanmadi/);
  });
});

describe('tryResolveUserBranchId', () => {
  it('prefers mainBranch — the field payroll scoping already reads', async () => {
    const prisma = prismaMock({
      user: { mainBranch: 2, branches: [{ branchId: 1 }] },
    });
    await expect(tryResolveUserBranchId(prisma, 10768)).resolves.toBe(2);
  });

  it('falls back to the single UserBranch row when mainBranch is null', async () => {
    const prisma = prismaMock({
      user: { mainBranch: null, branches: [{ branchId: 1 }] },
    });
    await expect(tryResolveUserBranchId(prisma, 10737)).resolves.toBe(1);
  });

  it('returns null for a branch-less CEO instead of inventing a branch', async () => {
    const prisma = prismaMock({ user: { mainBranch: null, branches: [] } });
    await expect(tryResolveUserBranchId(prisma, 10000)).resolves.toBeNull();
  });

  it('returns null when several branches are attached (ambiguous, D6 violation)', async () => {
    const prisma = prismaMock({
      user: { mainBranch: null, branches: [{ branchId: 1 }, { branchId: 2 }] },
    });
    await expect(tryResolveUserBranchId(prisma, 10001)).resolves.toBeNull();
  });

  it('returns null for a missing user', async () => {
    const prisma = prismaMock({ user: null });
    await expect(tryResolveUserBranchId(prisma, 99999)).resolves.toBeNull();
  });
});
