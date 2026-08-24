import { EnrollmentStatus, TransactionType } from '@prisma/client';
import { resolveBilledEnrollmentId } from './resolve-billed-enrollment';

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
