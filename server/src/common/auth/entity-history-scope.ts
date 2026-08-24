import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCallerInBranch, resolveCallerBranchScope } from './branch-scope';
import { assertCallerMayTouchStudent } from './student-branch-scope';
import { assertCallerMayTouchGroup } from './group-branch-scope';
import { assertCallerMayTouchUser } from './user-branch-scope';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * `GET /entity-history/:entityType/:entityId` had `companyId` and nothing else.
 *
 * Both parameters come straight off the URL, so any staff member could read the
 * full edit trail of any record in the company. Production holds 17 727 rows
 * across 23 entity types, and the payload is `oldValues`/`newValues` — the
 * before-and-after of every changed field. `Student` alone is 9 031 rows, and a
 * password change shows up there as its own entry.
 *
 * The audit log is a VIEW of records, so it is gated as those records are: each
 * type delegates to that record's own guard, or resolves the one branch column
 * it carries. No twenty-fourth branch rule is invented here.
 *
 * ── THE THREE NULL POLICIES, WHICH ARE NOT THE SAME ───────────────────────────
 *
 * A nullable `branchId` means different things in different tables and
 * flattening them would be wrong in both directions:
 *
 *   - **Lead, MockExam, TelegramGroup, Course, Holiday** — null is an
 *     UNASSIGNED POOL that every branch legitimately works. `leadBranchWhere`
 *     already reads it that way. Refusing here would hide a new enquiry's
 *     history from everyone.
 *   - **Payment** — null is a historical row nobody could attribute.
 *     `branchIdWhere` deliberately EXCLUDES those from branch-scoped reads, and
 *     the reporting invariant is `Σ(branches) + unassigned == company`. So a
 *     branch-confined caller must not see them; only a caller who spans every
 *     branch may.
 *   - **Expense, Room, LeadColumn** — NOT NULL in the schema. No policy needed.
 *
 * ── COMPANY-WIDE TYPES ────────────────────────────────────────────────────────
 *
 * Five types carry no branch dimension at all (`CustomForm`, `LeadSource`,
 * `MockExamSection`, `StudentExitReason`, `DepartureReason`). They are named
 * EXPLICITLY rather than falling through a default, because "I do not know what
 * this is" and "this genuinely has no branch" must not produce the same answer.
 * An unrecognised type is refused.
 */

/** Types whose history is readable by any staff member of the company. */
const COMPANY_WIDE_TYPES = new Set([
  'CustomForm',
  'LeadSource',
  'MockExamSection',
  'StudentExitReason',
  'DepartureReason',
]);

/** Tables where a null `branchId` is an unassigned pool, not hidden data. */
type NullPolicy = 'pool' | 'spanningCallerOnly';

async function assertBranchOrNull(
  prisma: PrismaLike,
  userId: number | undefined,
  branchId: number | null,
  policy: NullPolicy,
  message: string,
): Promise<void> {
  if (branchId != null) {
    await assertCallerInBranch(prisma, userId, branchId, message);
    return;
  }
  if (policy === 'pool') return;

  // `spanningCallerOnly`: an unattributed row belongs to the company total, not
  // to any branch, so only a caller who spans every branch may read it.
  const scope = await resolveCallerBranchScope(prisma, userId as number);
  if (scope.kind !== 'all') {
    throw new NotFoundException('Yozuv topilmadi');
  }
}

export async function assertCallerMayReadEntityHistory(
  prisma: PrismaLike,
  userId: number | undefined,
  roles: string[],
  entityType: string,
  entityId: string,
  companyId: number,
): Promise<void> {
  if (COMPANY_WIDE_TYPES.has(entityType)) return;

  const numericId = () => {
    const n = Number(entityId);
    if (!Number.isInteger(n)) {
      throw new BadRequestException("Identifikator noto'g'ri");
    }
    return n;
  };
  const notFound = () => new NotFoundException('Yozuv topilmadi');
  const msg =
    "Bu yozuv boshqa filialga tegishli — tarixini ko'rish huquqingiz yo'q";

  switch (entityType) {
    // ── delegate to the record's own guard ──────────────────────────────────
    case 'Student':
      await assertCallerMayTouchStudent(prisma, userId, numericId(), companyId);
      return;

    case 'Group':
    // `GroupAttendance` records the whole register for one lesson and its
    // `entityId` IS the groupId (`attendance-save.service.ts`), so it is the
    // same question as the group's own history.
    case 'GroupAttendance':
      await assertCallerMayTouchGroup(
        prisma,
        userId as number,
        roles,
        entityId,
        msg,
      );
      return;

    case 'User':
      await assertCallerMayTouchUser(prisma, userId, numericId(), msg);
      return;

    case 'Branch':
      await assertCallerInBranch(prisma, userId, numericId(), msg);
      return;

    // ── one hop to a record that has a guard ────────────────────────────────
    case 'Enrollment': {
      const row = await prisma.enrollment.findFirst({
        where: { id: entityId },
        select: { studentId: true },
      });
      if (!row) throw notFound();
      await assertCallerMayTouchStudent(
        prisma,
        userId,
        row.studentId,
        companyId,
      );
      return;
    }

    case 'Attendance': {
      const row = await prisma.attendance.findFirst({
        where: { id: entityId },
        select: { groupId: true },
      });
      if (!row) throw notFound();
      await assertCallerMayTouchGroup(
        prisma,
        userId as number,
        roles,
        row.groupId,
        msg,
      );
      return;
    }

    case 'MockExamParticipant': {
      const row = await prisma.mockExamParticipant.findFirst({
        where: { id: entityId },
        select: { exam: { select: { branchId: true } } },
      });
      if (!row) throw notFound();
      await assertBranchOrNull(prisma, userId, row.exam.branchId, 'pool', msg);
      return;
    }

    case 'LeadSection': {
      const row = await prisma.leadSection.findFirst({
        where: { id: entityId },
        select: { column: { select: { branchId: true } } },
      });
      if (!row) throw notFound();
      await assertCallerInBranch(prisma, userId, row.column.branchId, msg);
      return;
    }

    // ── the branch is a column on the row itself ────────────────────────────
    case 'Payment': {
      const row = await prisma.payment.findFirst({
        where: { id: entityId, companyId },
        select: { branchId: true },
      });
      if (!row) throw notFound();
      await assertBranchOrNull(
        prisma,
        userId,
        row.branchId,
        'spanningCallerOnly',
        msg,
      );
      return;
    }

    case 'Expense': {
      const row = await prisma.expense.findFirst({
        where: { id: entityId, companyId },
        select: { branchId: true },
      });
      if (!row) throw notFound();
      await assertCallerInBranch(prisma, userId, row.branchId, msg);
      return;
    }

    case 'Room': {
      const row = await prisma.room.findFirst({
        where: { id: entityId },
        select: { branchId: true },
      });
      if (!row) throw notFound();
      await assertCallerInBranch(prisma, userId, row.branchId, msg);
      return;
    }

    case 'LeadColumn': {
      const row = await prisma.leadColumn.findFirst({
        where: { id: entityId },
        select: { branchId: true },
      });
      if (!row) throw notFound();
      await assertCallerInBranch(prisma, userId, row.branchId, msg);
      return;
    }

    case 'Lead': {
      // No `deletedAt` filter: deleting a lead means marking it LOST and
      // archiving it, and the archive page is where its history is read.
      const row = await prisma.lead.findFirst({
        where: { id: entityId },
        select: { branchId: true },
      });
      if (!row) throw notFound();
      await assertBranchOrNull(prisma, userId, row.branchId, 'pool', msg);
      return;
    }

    case 'MockExam': {
      const row = await prisma.mockExam.findFirst({
        where: { id: entityId, companyId },
        select: { branchId: true },
      });
      if (!row) throw notFound();
      await assertBranchOrNull(prisma, userId, row.branchId, 'pool', msg);
      return;
    }

    case 'TelegramGroup': {
      const row = await prisma.telegramGroup.findFirst({
        where: { id: entityId },
        select: { branchId: true },
      });
      if (!row) throw notFound();
      await assertBranchOrNull(prisma, userId, row.branchId, 'pool', msg);
      return;
    }

    case 'Course': {
      const row = await prisma.course.findFirst({
        where: { id: entityId, companyId },
        select: { branchId: true },
      });
      if (!row) throw notFound();
      await assertBranchOrNull(prisma, userId, row.branchId, 'pool', msg);
      return;
    }

    case 'Holiday': {
      const row = await prisma.holiday.findFirst({
        where: { id: entityId },
        select: { branchId: true },
      });
      if (!row) throw notFound();
      await assertBranchOrNull(prisma, userId, row.branchId, 'pool', msg);
      return;
    }

    default:
      // Fail closed. A type nobody has classified is one nobody can scope, and
      // the audit log is exactly where a silent "sure, here you go" is worst.
      // Adding a new `entityType` to `EntityHistoryService` means adding it
      // here too — `entity-history-scope.spec.ts` asserts the production list
      // is covered so the omission surfaces as a failing test, not a leak.
      throw new BadRequestException(
        `Tarix uchun qo'llab-quvvatlanmaydigan obyekt turi: ${entityType}`,
      );
  }
}
