/**
 * One-off repair: enrollments still FROZEN in a group that was cancelled or
 * completed before closing a group closed its FROZEN enrollments too
 * (`StatusCascadeService.cascade('Group', …)`, ADR-0036).
 *
 * Each one is closed the way the cascade closes one today — DROPPED, a
 * state-log row, the removal in the student's and the group's history — but
 * dated at the group's own status change and attributed to whoever made it,
 * so a report replaying the log sees the student leave when the group closed,
 * not on the day of the repair. A row that changed after the group closed
 * closes at that change instead, so the log never runs backwards. The history
 * rows are written now and carry the close date as `sana`; the state log keeps
 * its own `createdAt` beside the backdated `transitionAt`.
 *
 * Money is out of scope. An enrollment with unused prepaid lessons, or with a
 * live monthly charge from the close month on, is reported and left alone
 * (production on 2026-09-25: none of the 19). The cascade's own money steps
 * could not run here anyway: `reverseChargeForDeparture` refuses a past date.
 */
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EntityHistoryService } from '../../src/common/entity-history';
import {
  GROUP_CANCELLED_REASON,
  GROUP_COMPLETED_WHILE_FROZEN_REASON,
} from '../../src/common/status/status-cascade.service';
import { tashkentMonthKey } from '../../src/common/date/tashkent';

type Db = PrismaService | Prisma.TransactionClient;
type Outcome = 'applied' | 'skipped';
type ClosedGroupStatus =
  | typeof GroupStatus.CANCELLED
  | typeof GroupStatus.COMPLETED;

// Generous limits: the script runs from a laptop against a far-away database.
const LIMITS = { maxWait: 10_000, timeout: 20_000 };

const CLOSED_GROUP_STATUSES: ClosedGroupStatus[] = [
  GroupStatus.CANCELLED,
  GroupStatus.COMPLETED,
];

export interface StrandedEnrollment {
  enrollmentId: string;
  studentId: number;
  studentName: string;
  groupId: string;
  groupName: string;
  groupStatus: ClosedGroupStatus;
  companyId: number;
  /** The group's own status change; null when none was ever recorded. */
  groupClosedAt: Date | null;
  groupClosedById: number | null;
  /**
   * When the enrollment closes: the group's close, or the enrollment's own
   * last change if that came later. Null without a group close date.
   */
  closeAt: Date | null;
  prepaidLessonsRemaining: number;
  /** Live monthly charges from the close month on: money owed back. */
  openMonthlyCharges: number;
}

function latest(...dates: (Date | null | undefined)[]): Date {
  return new Date(Math.max(...dates.filter((d) => d).map((d) => d!.getTime())));
}

/**
 * Charges for the Tashkent month the group closed in, or later. An earlier
 * month's lessons were all over before the group closed.
 */
function chargesFromCloseMonth(
  closedAt: Date,
  charges: { periodYear: number; periodMonth: number }[],
): number {
  const closeMonth = tashkentMonthKey(closedAt);
  return charges.filter(
    (c) =>
      `${c.periodYear}-${String(c.periodMonth).padStart(2, '0')}` >= closeMonth,
  ).length;
}

/** The words the cascade stamps on every enrollment it closes. */
function cascadeReason(row: StrandedEnrollment): string {
  return `Cascade: Group #${row.groupId} → ${row.groupStatus}`;
}

export async function findStrandedEnrollments(
  db: Db,
): Promise<StrandedEnrollment[]> {
  const rows = await db.enrollment.findMany({
    where: {
      deletedAt: null,
      status: EnrollmentStatus.FROZEN,
      group: { deletedAt: null, statusEnum: { in: CLOSED_GROUP_STATUSES } },
    },
    select: {
      id: true,
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
          statusEnum: true,
          statusChangedAt: true,
          statusChangedById: true,
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
    const closedAt = row.group.statusChangedAt;
    return {
      enrollmentId: row.id,
      studentId: row.studentId,
      studentName: `${row.student.firstName} ${row.student.lastName}`.trim(),
      groupId: row.group.id,
      groupName: row.group.name,
      // The query only returns enrollments of cancelled or completed groups.
      groupStatus: row.group.statusEnum as ClosedGroupStatus,
      companyId: row.group.companyId,
      groupClosedAt: closedAt,
      groupClosedById: row.group.statusChangedById,
      closeAt: closedAt
        ? latest(closedAt, row.statusChangedAt, row.stateLog[0]?.transitionAt)
        : null,
      prepaidLessonsRemaining: row.prepaidLessonsRemaining,
      openMonthlyCharges: closedAt
        ? chargesFromCloseMonth(closedAt, row.monthlyCharges)
        : row.monthlyCharges.length,
    };
  });
}

/**
 * Enrollments with money attached, or in a group with no close date to
 * backdate to, go to a person, not to this script.
 */
export function splitForRepair(rows: StrandedEnrollment[]): {
  toClose: StrandedEnrollment[];
  withMoney: StrandedEnrollment[];
  undatedGroup: StrandedEnrollment[];
} {
  const hasMoney = (r: StrandedEnrollment) =>
    r.prepaidLessonsRemaining > 0 || r.openMonthlyCharges > 0;
  return {
    toClose: rows.filter((r) => !hasMoney(r) && r.groupClosedAt),
    withMoney: rows.filter(hasMoney),
    undatedGroup: rows.filter((r) => !hasMoney(r) && !r.groupClosedAt),
  };
}

/** Counts only: the repo is public, and so are logs pasted from it. */
export function summarize(rows: StrandedEnrollment[]) {
  const byGroupStatus: Record<string, number> = {};
  const byCloseMonth: Record<string, number> = {};
  for (const r of rows) {
    byGroupStatus[r.groupStatus] = (byGroupStatus[r.groupStatus] ?? 0) + 1;
    const month = r.groupClosedAt ? tashkentMonthKey(r.groupClosedAt) : '—';
    byCloseMonth[month] = (byCloseMonth[month] ?? 0) + 1;
  }
  return {
    enrollments: rows.length,
    students: new Set(rows.map((r) => r.studentId)).size,
    groups: new Set(rows.map((r) => r.groupId)).size,
    byGroupStatus,
    byCloseMonth: Object.fromEntries(
      Object.entries(byCloseMonth).sort(([a], [b]) => a.localeCompare(b)),
    ),
    closingAfterGroupClosed: rows.filter(
      (r) =>
        r.closeAt &&
        r.groupClosedAt &&
        r.closeAt.getTime() > r.groupClosedAt.getTime(),
    ).length,
  };
}

/**
 * Closes one enrollment. Everything is re-checked inside the transaction and
 * a row that changed since planning — closed or unfrozen by hand, given
 * prepaid lessons, charged, its group reopened or deleted — is skipped, so a
 * second run only picks up what the first left.
 */
export async function applyClose(
  prisma: PrismaService,
  history: EntityHistoryService,
  row: StrandedEnrollment,
): Promise<Outcome> {
  const { closeAt, groupClosedAt } = row;
  if (!closeAt || !groupClosedAt) return 'skipped';

  return prisma.$transaction(async (tx) => {
    const charges = await tx.enrollmentMonthlyCharge.findMany({
      where: {
        enrollmentId: row.enrollmentId,
        status: MonthlyChargeStatus.CHARGED,
      },
      select: { periodYear: true, periodMonth: true },
    });
    if (chargesFromCloseMonth(groupClosedAt, charges) > 0) {
      return 'skipped';
    }

    const reason = cascadeReason(row);
    const closed = await tx.enrollment.updateMany({
      where: {
        id: row.enrollmentId,
        deletedAt: null,
        status: EnrollmentStatus.FROZEN,
        prepaidLessonsRemaining: { lte: 0 },
        group: { deletedAt: null, statusEnum: row.groupStatus },
        // A change after planning would leave `closeAt` behind it.
        OR: [{ statusChangedAt: null }, { statusChangedAt: { lte: closeAt } }],
      },
      data: {
        status: EnrollmentStatus.DROPPED,
        statusChangedAt: closeAt,
        statusChangedById: row.groupClosedById,
        statusChangeReason: reason,
      },
    });
    if (closed.count === 0) return 'skipped';

    await tx.enrollmentStateLog.create({
      data: {
        enrollmentId: row.enrollmentId,
        status: EnrollmentStatus.DROPPED,
        transitionAt: closeAt,
        reason,
        changedById: row.groupClosedById,
      },
    });

    const sabab =
      row.groupStatus === GroupStatus.COMPLETED
        ? GROUP_COMPLETED_WHILE_FROZEN_REASON
        : GROUP_CANCELLED_REASON;
    const sana = groupClosedAt.toISOString();
    const actor = {
      changedById: row.groupClosedById ?? undefined,
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
        sabab,
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
        sabab,
        sana,
      },
      ...actor,
    });
    return 'applied';
  }, LIMITS);
}
