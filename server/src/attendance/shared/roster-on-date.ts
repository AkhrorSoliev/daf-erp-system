import { EnrollmentStatus, Prisma } from '@prisma/client';
import { tashkentDateStr } from '../../common/date/tashkent';

export interface RosterEnrollment {
  id: string;
  studentId: number;
}

/**
 * Who was in the group on a past lesson day — the late register's roster
 * (spec 2026-09-29 §3.4). Today's roster (ACTIVE only) would drop a student
 * who left after the lesson, or everyone once the group was closed.
 *
 * The membership rule is the dots tab's (`getLessonSequence`): an enrollment
 * counts from its start until the Tashkent day its status last moved away
 * from ACTIVE, inclusive; an ACTIVE one is open-ended. Unlike the dots tab, a
 * closed enrollment with no change date is left out — writing attendance for
 * someone who may have been gone for months is worse than asking the
 * administrator to add them. One enrollment per student: the ACTIVE one if
 * any, else the first found.
 */
export async function rosterOnDate(
  db: Pick<Prisma.TransactionClient, 'enrollment'>,
  groupId: string,
  lessonDate: Date,
): Promise<RosterEnrollment[]> {
  const day = lessonDate.toISOString().slice(0, 10);
  const rows = await db.enrollment.findMany({
    where: {
      groupId,
      deletedAt: null,
      OR: [{ startDate: null }, { startDate: { lte: lessonDate } }],
    },
    select: { id: true, studentId: true, status: true, statusChangedAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const byStudent = new Map<number, (typeof rows)[number]>();
  for (const e of rows) {
    const member =
      e.status === EnrollmentStatus.ACTIVE ||
      (e.statusChangedAt !== null && tashkentDateStr(e.statusChangedAt) >= day);
    if (!member) continue;
    const kept = byStudent.get(e.studentId);
    if (
      !kept ||
      (kept.status !== EnrollmentStatus.ACTIVE &&
        e.status === EnrollmentStatus.ACTIVE)
    ) {
      byStudent.set(e.studentId, e);
    }
  }
  return [...byStudent.values()].map((e) => ({
    id: e.id,
    studentId: e.studentId,
  }));
}
