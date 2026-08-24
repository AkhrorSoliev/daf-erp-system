import { EnrollmentStatus, TransactionType } from '@prisma/client';
import {
  resolveBilledEnrollmentId,
  resolveFundingDeductionId,
} from './resolve-billed-enrollment';

function makeTx(opts: {
  billed?: { enrollmentId: string | null } | null;
  enrollments?: Array<{ id: string; status: EnrollmentStatus }>;
}) {
  const enrollments = opts.enrollments ?? [];
  const tx = {
    transaction: {
      findFirst: jest.fn().mockResolvedValue(opts.billed ?? null),
    },
    enrollment: {
      findMany: jest.fn().mockResolvedValue(enrollments),
    },
  };
  return tx as any;
}

const PARAMS = { attendanceId: 'att-1', studentId: 10321, groupId: 'grp-1' };

describe('resolveBilledEnrollmentId', () => {
  describe('uses the recorded answer', () => {
    it('returns the enrollment the charge was written against', async () => {
      const tx = makeTx({ billed: { enrollmentId: 'enr-charged' } });
      expect(await resolveBilledEnrollmentId(tx, PARAMS)).toBe('enr-charged');
    });

    it('does not fall back to guessing when the answer is recorded', async () => {
      // The whole point: with two live enrollments, the stored id is the only
      // thing that distinguishes them.
      const tx = makeTx({
        billed: { enrollmentId: 'enr-dropped-but-charged' },
        enrollments: [
          { id: 'enr-active', status: EnrollmentStatus.ACTIVE },
          { id: 'enr-dropped-but-charged', status: EnrollmentStatus.DROPPED },
        ],
      });

      expect(await resolveBilledEnrollmentId(tx, PARAMS)).toBe(
        'enr-dropped-but-charged',
      );
      expect(tx.enrollment.findMany).not.toHaveBeenCalled();
    });

    it('looks only at rows that carry an enrollment', async () => {
      const tx = makeTx({ billed: { enrollmentId: 'enr-1' } });
      await resolveBilledEnrollmentId(tx, PARAMS);

      const where = tx.transaction.findFirst.mock.calls[0][0].where;
      expect(where.attendanceId).toBe('att-1');
      expect(where.enrollmentId).toEqual({ not: null });
      expect(where.type.in).toEqual(
        expect.arrayContaining([
          TransactionType.LESSON_CONSUMPTION,
          TransactionType.LESSON_DEDUCTION,
        ]),
      );
    });

    it('prefers a live charge over a reversed one', async () => {
      const tx = makeTx({ billed: { enrollmentId: 'enr-1' } });
      await resolveBilledEnrollmentId(tx, PARAMS);

      // A lesson un-marked and re-marked carries both rows; the standing
      // charge is the one being undone.
      expect(tx.transaction.findFirst.mock.calls[0][0].orderBy).toEqual([
        { reversedAt: 'asc' },
        { createdAt: 'desc' },
      ]);
    });
  });

  describe('falls back only when nothing was billed', () => {
    it('prefers the ACTIVE enrollment whatever order the rows arrive in', async () => {
      const tx = makeTx({
        billed: null,
        enrollments: [
          { id: 'enr-dropped', status: EnrollmentStatus.DROPPED },
          { id: 'enr-active', status: EnrollmentStatus.ACTIVE },
        ],
      });
      expect(await resolveBilledEnrollmentId(tx, PARAMS)).toBe('enr-active');
    });

    it('still answers when every enrollment is closed', async () => {
      // A charge made while ACTIVE must stay refundable after the student
      // drops — refusing here would leave them paying for a cancelled lesson.
      const tx = makeTx({
        billed: null,
        enrollments: [{ id: 'enr-dropped', status: EnrollmentStatus.DROPPED }],
      });
      expect(await resolveBilledEnrollmentId(tx, PARAMS)).toBe('enr-dropped');
    });

    it('returns null when the student has no enrollment in the group', async () => {
      const tx = makeTx({ billed: null, enrollments: [] });
      expect(await resolveBilledEnrollmentId(tx, PARAMS)).toBeNull();
    });

    it('never filters the fallback to ACTIVE only', async () => {
      const tx = makeTx({
        billed: null,
        enrollments: [{ id: 'enr-frozen', status: EnrollmentStatus.FROZEN }],
      });
      await resolveBilledEnrollmentId(tx, PARAMS);

      const where = tx.enrollment.findMany.mock.calls[0][0].where;
      expect(where.status).toBeUndefined();
      expect(where.deletedAt).toBeNull();
    });
  });
});

describe('resolveFundingDeductionId', () => {
  const CONSUMED_AT = new Date('2026-08-20T10:05:00.000Z');
  const PARAMS = {
    attendanceId: 'att-1',
    enrollmentId: 'enr-1',
    consumedAt: CONSUMED_AT,
  };

  function makeTx(opts: {
    priorAccrual?: { deductionTransactionId: string | null } | null;
    deduction?: { id: string } | null;
  }) {
    return {
      salaryAccrual: {
        findFirst: jest.fn().mockResolvedValue(opts.priorAccrual ?? null),
      },
      transaction: {
        findFirst: jest.fn().mockResolvedValue(opts.deduction ?? null),
      },
    } as any;
  }

  it('reuses the funding an existing accrual on this lesson already points at', async () => {
    const tx = makeTx({ priorAccrual: { deductionTransactionId: 'ded-real' } });

    expect(await resolveFundingDeductionId(tx, PARAMS)).toBe('ded-real');
    expect(tx.transaction.findFirst).not.toHaveBeenCalled();
  });

  it('counts a REVERSED accrual — reversal clears the pay, not the link', async () => {
    // A substitute replacing a teacher inherits the same funding; the outgoing
    // teacher's accrual is reversed moments earlier in the same transaction.
    const tx = makeTx({ priorAccrual: { deductionTransactionId: 'ded-real' } });
    await resolveFundingDeductionId(tx, PARAMS);

    expect(
      tx.salaryAccrual.findFirst.mock.calls[0][0].where.reversedAt,
    ).toBeUndefined();
  });

  it('anchors the fallback to the CONSUMPTION moment, not the calendar day', async () => {
    // The old code bounded by UTC midnight of the lesson date, which excluded
    // every deduction written during the lesson day — i.e. all of them.
    const tx = makeTx({ priorAccrual: null, deduction: { id: 'ded-2' } });

    expect(await resolveFundingDeductionId(tx, PARAMS)).toBe('ded-2');
    const where = tx.transaction.findFirst.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ lte: CONSUMED_AT });
    expect(where.reversedAt).toBeNull();
    expect(where.enrollmentId).toBe('enr-1');
  });

  it('takes the newest batch when several are live', async () => {
    const tx = makeTx({ priorAccrual: null, deduction: { id: 'ded-newest' } });
    await resolveFundingDeductionId(tx, PARAMS);

    expect(tx.transaction.findFirst.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('returns null when the lesson was never funded — no accrual is written', async () => {
    // Teachers do not earn for unpaid lessons; the caller skips on null.
    const tx = makeTx({ priorAccrual: null, deduction: null });
    expect(await resolveFundingDeductionId(tx, PARAMS)).toBeNull();
  });

  it('ignores an accrual that carries no funding link', async () => {
    const tx = makeTx({
      priorAccrual: null, // the query already excludes null links
      deduction: { id: 'ded-fallback' },
    });
    expect(await resolveFundingDeductionId(tx, PARAMS)).toBe('ded-fallback');
    expect(
      tx.salaryAccrual.findFirst.mock.calls[0][0].where.deductionTransactionId,
    ).toEqual({ not: null });
  });
});
