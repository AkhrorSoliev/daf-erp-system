import { EnrollmentStatus, Prisma, StudentStatus } from '@prisma/client';
import type {
  EntityHistoryService,
  EntityStatusChangedEvent,
} from '../entity-history';

/** Why a student became GRADUATED when their last group completed. */
export const AUTO_GRADUATION_REASON =
  'Avtomatik: guruh tugallanganligi sababli';

/**
 * Graduates every ACTIVE student the completion of `groupId` left without an
 * ACTIVE enrollment: StatusHistory, the student's own history and the student
 * row, all on the caller's transaction. The history's 'entity.status.changed'
 * event goes to `deferredEvents`, so a rollback never announces a graduation
 * that did not happen. Call it AFTER the group's ACTIVE enrollments became
 * COMPLETED. Returns the graduated student ids.
 */
export async function graduateStudentsOfCompletedGroup(
  tx: Prisma.TransactionClient,
  history: EntityHistoryService,
  params: {
    groupId: string;
    userId: number | undefined;
    at: Date;
    deferredEvents: EntityStatusChangedEvent[];
  },
): Promise<number[]> {
  const completed = await tx.enrollment.findMany({
    where: {
      groupId: params.groupId,
      deletedAt: null,
      status: EnrollmentStatus.COMPLETED,
    },
    select: { studentId: true },
  });

  const graduated: number[] = [];
  for (const studentId of [...new Set(completed.map((e) => e.studentId))]) {
    const stillStudying = await tx.enrollment.count({
      where: { studentId, deletedAt: null, status: EnrollmentStatus.ACTIVE },
    });
    if (stillStudying > 0) continue;

    const student = await tx.student.findFirst({
      where: { id: studentId, deletedAt: null, status: StudentStatus.ACTIVE },
      select: { companyId: true },
    });
    if (!student) continue;

    await tx.statusHistory.create({
      data: {
        entityType: 'Student',
        entityId: String(studentId),
        fromStatus: 'ACTIVE',
        toStatus: 'GRADUATED',
        reason: AUTO_GRADUATION_REASON,
        changedById: params.userId,
        companyId: student.companyId,
      },
    });
    await history.recordStatusChange({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { status: 'ACTIVE' },
      newValues: { status: 'GRADUATED', reason: AUTO_GRADUATION_REASON },
      changedById: params.userId,
      companyId: student.companyId,
      tx,
      deferredEvents: params.deferredEvents,
    });
    await tx.student.update({
      where: { id: studentId },
      data: {
        status: StudentStatus.GRADUATED,
        isActive: false,
        statusChangedAt: params.at,
        statusChangedById: params.userId,
        statusChangeReason: AUTO_GRADUATION_REASON,
      },
    });
    graduated.push(studentId);
  }
  return graduated;
}
