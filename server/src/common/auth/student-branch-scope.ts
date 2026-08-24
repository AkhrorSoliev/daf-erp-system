import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCallerInBranch } from './branch-scope';
import { tryResolveStudentBranchId } from '../finance/resolve-branch';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * May this caller act on this student — for anything that is not money?
 *
 * The twin of {@link assertCallerMayTouchGroup}, and the non-money sibling of
 * `assertCallerMayWriteForStudent`. Same question, three deliberate
 * differences from the money version:
 *
 *   1. **The message.** Telling an admin that expelling a student, or opening
 *      their profile, failed because they "may not write money there" sends
 *      them looking for a payment that does not exist.
 *
 *   2. **A student with no branch is REFUSED, not crashed on.** The money path
 *      throws a raw error there on purpose: a ledger row that can never be
 *      attributed is a data emergency, and a loud failure is cheaper than a
 *      silent one. Reading a profile is not that. "I cannot tell whose this
 *      student is" is a refusal — still fail-closed, but a 403 rather than a
 *      500 on a page an admin merely opened. (Production carries 824 live
 *      students and 0 without a branch, so this is the guard holding a line
 *      that already holds, not a case anyone hits today.)
 *
 *   3. **Existence is checked first**, so a deleted or foreign-company student
 *      answers 404 instead of the branch resolver's error. The write paths
 *      already 404 before calling this; this makes the read paths, which have
 *      no lookup of their own, behave the same way.
 *
 * `PATCH /students/:id` carried `branchIds`, so a director could edit another
 * branch's student AND MOVE THEM into their own; `PATCH /students/:id/status`
 * cascades — EXPELLED or FROZEN closes that student's enrolments in another
 * branch's groups, stopping their lessons and their teacher's accruals. The
 * profile READS were open the same way: the student LIST was branch-scoped,
 * but every tab behind it answered on `companyId` alone, so a director who
 * typed another branch's student id into the URL got the balance, the ledger
 * summary, the lesson history and the SMS log in full.
 */
export async function assertCallerMayTouchStudent(
  prisma: PrismaLike,
  userId: number | undefined,
  studentId: number,
  companyId: number,
  message = "Bu o'quvchi boshqa filialga tegishli — u bilan ishlash huquqingiz yo'q",
): Promise<number> {
  // NOT filtered on `deletedAt`, deliberately. This asks "is this a real
  // student of this company", so the caller gets a 404 rather than the branch
  // resolver's error — it is not the place that decides whether ARCHIVED
  // students are visible, and the reads behind it do not agree on that anyway:
  // `getStatusHistory` and `findById` serve archived students, while
  // `getLessonsOverview`, `getClosedEnrollments` and
  // `getActiveEnrollmentsWithPrepaid` each 404 them on their own. Adding the
  // filter here overrode all of them at once and took 23 archived students'
  // profiles offline — a guard should add the branch question, not silently
  // answer a different one.
  const student = await prisma.student.findFirst({
    where: { id: studentId, companyId },
    select: { id: true },
  });
  if (!student) {
    throw new NotFoundException("O'quvchi topilmadi");
  }

  const branchId = await tryResolveStudentBranchId(
    prisma,
    studentId,
    companyId,
  );
  if (branchId == null) {
    throw new ForbiddenException(
      `O'quvchi #${studentId} uchun filial aniqlanmadi — unga filial biriktirilmaguncha bu amal bajarilmaydi`,
    );
  }

  await assertCallerInBranch(prisma, userId, branchId, message);
  return branchId;
}
