import { ForbiddenException } from '@nestjs/common';
import { assertCallerMayTouchStudent } from './financial-write-scope';

/**
 * The id-addressed student writes were company-scoped only.
 *
 * `PATCH /students/:id` accepted `branchIds`, so a Namangan director could edit
 * a Fargona student AND MOVE THEM into Namangan — taking their balance, their
 * enrolments and their teacher's future accruals with them.
 * `PATCH /students/:id/status` is worse in a quieter way: EXPELLED or FROZEN
 * cascades to that student's enrolments, stopping lessons in another branch's
 * groups and the accruals that follow from them.
 *
 * `assertSingleValidBranch` was already there and reads like a branch check,
 * which is part of why this survived — but it asks whether the TARGET branch is
 * real, never whether the CALLER may act on this student.
 */
describe('assertCallerMayTouchStudent', () => {
  function prismaFor(opts: {
    studentBranch: number | null;
    caller: { mainBranch: number | null; branchIds: number[]; role: string };
  }) {
    return {
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

  it('fails closed when the student has no branch at all', async () => {
    // `resolveStudentBranchId` throws rather than returning null. A student
    // nobody can attribute is not a student anybody may quietly edit — and by
    // D5 this state should not exist, so hitting it is itself the signal.
    const prisma = prismaFor({ studentBranch: null, caller: FARGONA_DIRECTOR });
    await expect(
      assertCallerMayTouchStudent(prisma, 7, 10264, 1001),
    ).rejects.toThrow(/filial aniqlanmadi/);
  });

  it('refuses an unidentified caller', async () => {
    const prisma = prismaFor({ studentBranch: 1, caller: FARGONA_DIRECTOR });
    await expect(
      assertCallerMayTouchStudent(prisma, undefined, 10264, 1001),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('carries a message about the STUDENT, not about money', async () => {
    // The money variant and this one share an implementation but not a
    // sentence: telling an admin that expelling a student failed because they
    // "may not write money" sends them looking for a payment that does not
    // exist.
    const prisma = prismaFor({ studentBranch: 2, caller: FARGONA_DIRECTOR });
    await expect(
      assertCallerMayTouchStudent(prisma, 7, 10264, 1001),
    ).rejects.toThrow(/u bilan ishlash huquqingiz yo'q/);
  });
});
