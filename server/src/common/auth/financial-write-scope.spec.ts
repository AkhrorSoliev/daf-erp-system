import { ForbiddenException } from '@nestjs/common';
import {
  assertCallerMayWriteForStudent,
  assertCallerMayWriteForStudentInTx,
} from './financial-write-scope';

/**
 * Negative cross-branch tests for money WRITES.
 *
 * Every financial write resolved the student's branch correctly and then wrote
 * the row — but nothing asked whether the CALLER was allowed to. A Namangan
 * cashier could post a Fargona student's payment and have it booked, correctly,
 * to Fargona: right branch, wrong hands.
 */
describe('financial write scope', () => {
  const COMPANY = 1001;
  const FARGONA_STUDENT = 10001;

  function prismaFor(caller: any, studentBranchId: number | null = 1) {
    return {
      studentBranch: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            studentBranchId == null ? null : { branchId: studentBranchId },
          ),
      },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue(caller) },
    } as any;
  }

  const CEO = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const namanganCashier = {
    mainBranch: 2,
    branches: [{ branchId: 2 }],
    roles: [{ role: { name: 'Cashier' } }],
  };
  const fargonaCashier = {
    mainBranch: 1,
    branches: [{ branchId: 1 }],
    roles: [{ role: { name: 'Cashier' } }],
  };

  it('REFUSES a Namangan caller writing for a Fargona student', async () => {
    const prisma = prismaFor(namanganCashier, 1);
    await expect(
      assertCallerMayWriteForStudent(prisma, 99, FARGONA_STUDENT, COMPANY),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a caller writing for their own branch, returning that branch', async () => {
    const prisma = prismaFor(fargonaCashier, 1);
    await expect(
      assertCallerMayWriteForStudent(prisma, 99, FARGONA_STUDENT, COMPANY),
    ).resolves.toBe(1);
  });

  it('allows a CEO for any branch', async () => {
    const prisma = prismaFor(CEO, 2);
    await expect(
      assertCallerMayWriteForStudent(prisma, 1, FARGONA_STUDENT, COMPANY),
    ).resolves.toBe(2);
  });

  it('REFUSES a caller with no branch attached (fail-closed)', async () => {
    const prisma = prismaFor({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'Administrator' } }],
    });
    await expect(
      assertCallerMayWriteForStudent(prisma, 99, FARGONA_STUDENT, COMPANY),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('REFUSES when the student has no resolvable branch', async () => {
    // Fail-closed: a row nobody could attribute afterwards must not be written
    // at all, whoever is asking.
    const prisma = prismaFor(CEO, null);
    await expect(
      assertCallerMayWriteForStudent(prisma, 1, FARGONA_STUDENT, COMPANY),
    ).rejects.toThrow();
  });

  it('REFUSES when the caller cannot be identified', async () => {
    const prisma = prismaFor(CEO, 1);
    await expect(
      assertCallerMayWriteForStudent(
        prisma,
        undefined,
        FARGONA_STUDENT,
        COMPANY,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('the in-transaction variant', () => {
    it('uses the TRANSACTION client, not the root one', async () => {
      // The whole point: re-checking against the root client would read outside
      // the snapshot the write happens in, and the window between the
      // pre-check and the write would stay open.
      const tx = prismaFor(fargonaCashier, 1);
      await assertCallerMayWriteForStudentInTx(
        tx,
        99,
        FARGONA_STUDENT,
        COMPANY,
      );
      expect(tx.studentBranch.findFirst).toHaveBeenCalled();
      expect(tx.user.findFirst).toHaveBeenCalled();
    });

    it('catches a branch change that happened after the pre-check', async () => {
      // Pre-check passed against branch 1; by the time the tx runs the student
      // has moved to branch 2, which this caller does not own.
      const tx = prismaFor(fargonaCashier, 2);
      await expect(
        assertCallerMayWriteForStudentInTx(tx, 99, FARGONA_STUDENT, COMPANY),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
