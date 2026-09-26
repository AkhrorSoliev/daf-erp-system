/**
 * One-off repair: enrollments still ACTIVE or FROZEN in a group deleted
 * before deletion closed them (`GroupsWriteService.delete` →
 * `StatusCascadeService.cascadeGroupDeletion`).
 *
 * Each one is closed the way deletion closes one today — DROPPED, a state-log
 * row, the removal in the student's and the group's history — but dated at
 * the group's own `deletedAt` and attributed to whoever deleted it, so a
 * report replaying the log sees the student leave when the group went away,
 * not on the day of the repair. A row that changed after the deletion (a
 * student frozen later, in the dead group) closes at that change instead, so
 * the log never runs backwards. The history rows are written now and carry
 * the deletion date as `sana`; the state log keeps its own `createdAt` beside
 * the backdated `transitionAt`.
 *
 * Money is out of scope. An enrollment with unused prepaid lessons, or with a
 * live monthly charge from the deletion month on, is reported and left alone
 * (production on 2026-09-25: none of the 103).
 */
import { EnrollmentStatus, MonthlyChargeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EntityHistoryService } from '../../src/common/entity-history';
import { GROUP_DELETED_REASON } from '../../src/common/status/status-cascade.service';
import { tashkentMonthKey } from '../../src/common/date/tashkent';

type Db = PrismaService | Prisma.TransactionClient;
type Outcome = 'applied' | 'skipped';

// Generous limits: the script runs from a laptop against a far-away database.
const LIMITS = { maxWait: 10_000, timeout: 20_000 };

const LIVE_STATUSES = [EnrollmentStatus.ACTIVE, EnrollmentStatus.FROZEN];

export interface StrandedEnrollment {
  enrollmentId: string;
  status: EnrollmentStatus;
  studentId: number;
  studentName: string;
  groupId: string;
  groupName: string;
  companyId: number;
  groupDeletedAt: Date;
  groupDeletedById: number | null;
  /**
   * When the enrollment closes: the group's deletion, or the enrollment's own
   * last change if that came later.
   */
  closeAt: Date;
  prepaidLessonsRemaining: number;
  /** Live monthly charges from the deletion month on: money owed back. */
  openMonthlyCharges: number;
}

function latest(...dates: (Date | null | undefined)[]): Date {
  return new Date(Math.max(...dates.filter((d) => d).map((d) => d!.getTime())));
}

/**
 * Charges for the Tashkent month the group was deleted in, or later. An
 * earlier month's lessons were all held before the deletion.
 */
function chargesFromDeletionMonth(
  deletedAt: Date,
  charges: { periodYear: number; periodMonth: number }[],
): number {
  const deletionMonth = tashkentMonthKey(deletedAt);
  return charges.filter(
    (c) =>
      `${c.periodYear}-${String(c.periodMonth).padStart(2, '0')}` >=
      deletionMonth,
  ).length;
}

export async function findStrandedEnrollments(
  db: Db,
): Promise<StrandedEnrollment[]> {
  const rows = await db.enrollment.findMany({
    where: {
      deletedAt: null,
      status: { in: LIVE_STATUSES },
      group: { deletedAt: { not: null } },
    },
    select: {
      id: true,
      status: true,
      studentId: true,
      prepaidLessonsRemaining: true,
      statusChangedAt: true,
      stateLog: {
        orderBy: { transitionAt: 'desc' },
        take: 1,
        select: { transitionAt: true },
      },
      student: { select: { firstName: true, lastName: true } },
      group: {
        select: {
          id: true,
          name: true,
          companyId: true,
          deletedAt: true,
          deletedById: true,
        },
      },
      monthlyCharges: {
        where: { status: MonthlyChargeStatus.CHARGED },
        select: { periodYear: true, periodMonth: true },
      },
    },
    orderBy: { id: 'asc' },
  });

  return rows.map((row) => {
    // The query only returns enrollments of deleted groups.
    const deletedAt = row.group.deletedAt!;
    return {
      enrollmentId: row.id,
      status: row.status,
      studentId: row.studentId,
      studentName: `${row.student.firstName} ${row.student.lastName}`.trim(),
      groupId: row.group.id,
      groupName: row.group.name,
      companyId: row.group.companyId,
      groupDeletedAt: deletedAt,
      groupDeletedById: row.group.deletedById,
      closeAt: latest(
        deletedAt,
        row.statusChangedAt,
        row.stateLog[0]?.transitionAt,
      ),
      prepaidLessonsRemaining: row.prepaidLessonsRemaining,
      openMonthlyCharges: chargesFromDeletionMonth(
        deletedAt,
        row.monthlyCharges,
      ),
    };
  });
}

/** Enrollments with money attached go to a person, not to this script. */
export function splitByMoney(rows: StrandedEnrollment[]): {
  toClose: StrandedEnrollment[];
  withMoney: StrandedEnrollment[];
} {
  const hasMoney = (r: StrandedEnrollment) =>
    r.prepaidLessonsRemaining > 0 || r.openMonthlyCharges > 0;
  return {
    toClose: rows.filter((r) => !hasMoney(r)),
    withMoney: rows.filter(hasMoney),
  };
}

/** Counts only: the repo is public, and so are logs pasted from it. */
export function summarize(rows: StrandedEnrollment[]) {
  const byStatus: Record<string, number> = {};
  const byDeletionMonth: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const month = tashkentMonthKey(r.groupDeletedAt);
    byDeletionMonth[month] = (byDeletionMonth[month] ?? 0) + 1;
  }
  return {
    enrollments: rows.length,
    students: new Set(rows.map((r) => r.studentId)).size,
    groups: new Set(rows.map((r) => r.groupId)).size,
    byStatus,
    byDeletionMonth: Object.fromEntries(
      Object.entries(byDeletionMonth).sort(([a], [b]) => a.localeCompare(b)),
    ),
    closingAfterDeletion: rows.filter(
      (r) => r.closeAt.getTime() > r.groupDeletedAt.getTime(),
    ).length,
  };
}

/**
 * Closes one enrollment. Everything is re-checked inside the transaction and
 * a row that changed since planning — closed by hand, frozen or reopened,
 * given prepaid lessons, charged — is skipped, so a second run only picks up
 * what the first left.
 */
export async function applyClose(
  prisma: PrismaService,
  history: EntityHistoryService,
  row: StrandedEnrollment,
): Promise<Outcome> {
  return prisma.$transaction(async (tx) => {
    const charges = await tx.enrollmentMonthlyCharge.findMany({
      where: {
        enrollmentId: row.enrollmentId,
        status: MonthlyChargeStatus.CHARGED,
      },
      select: { periodYear: true, periodMonth: true },
    });
    if (chargesFromDeletionMonth(row.groupDeletedAt, charges) > 0) {
      return 'skipped';
    }

    const closed = await tx.enrollment.updateMany({
      where: {
        id: row.enrollmentId,
        deletedAt: null,
        status: { in: LIVE_STATUSES },
        prepaidLessonsRemaining: { lte: 0 },
        group: { deletedAt: { not: null } },
        // A change after planning would leave `closeAt` behind it.
        OR: [
          { statusChangedAt: null },
          { statusChangedAt: { lte: row.closeAt } },
        ],
      },
      data: {
        status: EnrollmentStatus.DROPPED,
        statusChangedAt: row.closeAt,
        statusChangedById: row.groupDeletedById,
        statusChangeReason: GROUP_DELETED_REASON,
      },
    });
    if (closed.count === 0) return 'skipped';

    await tx.enrollmentStateLog.create({
      data: {
        enrollmentId: row.enrollmentId,
        status: EnrollmentStatus.DROPPED,
        transitionAt: row.closeAt,
        reason: GROUP_DELETED_REASON,
        changedById: row.groupDeletedById,
      },
    });

    const sana = row.groupDeletedAt.toISOString();
    const actor = {
      changedById: row.groupDeletedById ?? undefined,
      companyId: row.companyId,
      tx,
    };
    await history.recordDelete({
      entityType: 'Student',
      entityId: row.studentId,
      oldValues: {
        guruh: row.groupName,
        guruhId: row.groupId,
        action: 'GURUHDAN_CHIQARILDI',
        sabab: GROUP_DELETED_REASON,
        sana,
      },
      ...actor,
    });
    await history.recordDelete({
      entityType: 'Group',
      entityId: row.groupId,
      oldValues: {
        action: 'OQUVCHI_CHIQARILDI',
        oquvchi: row.studentName,
        oquvchiId: row.studentId,
        sabab: GROUP_DELETED_REASON,
        sana,
      },
      ...actor,
    });
    return 'applied';
  }, LIMITS);
}
