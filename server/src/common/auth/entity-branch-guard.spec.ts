import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertCallerMayTouchStudent } from './student-branch-scope';

/**
 * The id-addressed student routes were company-scoped only — writes first,
 * and then, when the sweep reached them, the profile READS.
 *
 * `PATCH /students/:id` accepted `branchIds`, so a Namangan director could edit
 * a Fargona student AND MOVE THEM into Namangan — taking their balance, their
 * enrolments and their teacher's future accruals with them.
 * `PATCH /students/:id/status` is worse in a quieter way: EXPELLED or FROZEN
 * cascades to that student's enrolments, stopping lessons in another branch's
 * groups and the accruals that follow from them.
 * The reads leaked the same student without changing anything: the LIST was
 * branch-scoped, but `balance-summary`, `lessons-overview`, `closed-enrollments`
 * and the SMS log behind it answered on `companyId` alone.
 *
 * `assertSingleValidBranch` was already there and reads like a branch check,
 * which is part of why this survived — but it asks whether the TARGET branch is
 * real, never whether the CALLER may act on this student.
 */
describe('assertCallerMayTouchStudent', () => {
  function prismaFor(opts: {
    exists?: boolean;
    studentBranch: number | null;
    caller: { mainBranch: number | null; branchIds: number[]; role: string };
  }) {
    return {
      student: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.exists === false ? null : { id: 10264 }),
      },
      studentBranch: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            opts.studentBranch === null ? null : { branchId: opts.studentBranch },
          ),
      },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: opts.caller.mainBranch,
          branches: opts.caller.branchIds.map((branchId) => ({ branchId })),
          roles: [{ role: { name: opts.caller.role } }],
        }),
      },
    } as never;
  }

  const FARGONA_DIRECTOR = {
    mainBranch: 1,
    branchIds: [1],
    role: 'Branch Director',
  };

  it('allows a director on their own branch student', async () => {
    const prisma = prismaFor({ studentBranch: 1, caller: FARGONA_DIRECTOR });
    await expect(
      assertCallerMayTouchStudent(prisma, 7, 10264, 1001),
    ).resolves.toBe(1);
  });

  it('refuses a director on another branch student', async () => {
    const prisma = prismaFor({ studentBranch: 2, caller: FARGONA_DIRECTOR });
    await expect(
      assertCallerMayTouchStudent(prisma, 7, 10264, 1001),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a CEO through', async () => {
    const prisma = prismaFor({
      studentBranch: 2,
      caller: { mainBranch: null, branchIds: [], role: 'CEO' },
    });
    await expect(
      assertCallerMayTouchStudent(prisma, 1, 10264, 1001),
    ).resolves.toBe(2);
  });

  it('does NOT filter archived students — the reads behind it decide that', async () => {
    // Regression: the first version filtered `deletedAt: null`, which 404'd
    // all 23 archived students' profiles at once. `getStatusHistory` and
    // `findById` serve them; three sibling reads refuse them on their own.
    // The guard adds the branch question and leaves that one alone.
    const prisma = prismaFor({ studentBranch: 1, caller: FARGONA_DIRECTOR });
    await assertCallerMayTouchStudent(prisma, 7, 10264, 1001);
    const where = (
      prisma as never as { student: { findFirst: jest.Mock } }
    ).student.findFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('deletedAt');
    expect(where).toMatchObject({ id: 10264, companyId: 1001 });
  });

  it('404s a foreign-company student before touching branches', async () => {
    // Existence comes first so an admin opening a stale link gets "topilmadi"
    // rather than the branch resolver's error. The money callers all 404
    // themselves before reaching here; the profile reads have no lookup of
    // their own.
    const prisma = prismaFor({
      exists: false,
      studentBranch: 1,
      caller: FARGONA_DIRECTOR,
    });
    await expect(
      assertCallerMayTouchStudent(prisma, 7, 10264, 1001),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (prisma as never as { studentBranch: { findFirst: jest.Mock } })
        .studentBranch.findFirst,
    ).not.toHaveBeenCalled();
  });

  it('REFUSES a student with no branch — it does not crash', async () => {
    // The money guard raises a raw error here on purpose: an unattributable
    // ledger row is a data emergency. Opening a profile is not, so this path
    // fails closed as a 403 rather than a 500 on a page someone merely
    // clicked. (Production: 824 live students, 0 without a branch.)
    const prisma = prismaFor({ studentBranch: null, caller: FARGONA_DIRECTOR });
    const err = await assertCallerMayTouchStudent(
      prisma,
      7,
      10264,
      1001,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as Error).message).toMatch(/filial aniqlanmadi/);
  });

  it('refuses an unidentified caller', async () => {
    const prisma = prismaFor({ studentBranch: 1, caller: FARGONA_DIRECTOR });
    await expect(
      assertCallerMayTouchStudent(prisma, undefined, 10264, 1001),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('carries a message about the STUDENT, not about money', async () => {
    // The money variant and this one are deliberately separate functions, and
    // the sentence is one of the reasons: telling an admin that expelling a
    // student failed because they "may not write money there" sends them
    // looking for a payment that does not exist.
    const prisma = prismaFor({ studentBranch: 2, caller: FARGONA_DIRECTOR });
    await expect(
      assertCallerMayTouchStudent(prisma, 7, 10264, 1001),
    ).rejects.toThrow(/u bilan ishlash huquqingiz yo'q/);
  });
});
