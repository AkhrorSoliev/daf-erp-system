import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCallerInBranch } from './branch-scope';
import { resolveStudentBranchId } from '../finance/resolve-branch';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * "May this caller move money for this student?"
 *
 * Every financial write resolved the STUDENT's branch (so the row was attributed
 * correctly) but none of them checked the CALLER. `assertCallerInBranch` appeared
 * zero times across `payments-write`, `refunds-create`, `withdrawals`,
 * `transactions-write`, `debt-write-off` and `students-write`. A Namangan cashier
 * could post a payment for a Fargona student and it would be booked — correctly —
 * to Fargona. Right branch, wrong hands: money written into another branch's books.
 *
 * Resolving a branch is not authorising one. These are separate questions and
 * both have to be asked.
 *
 * ── WHY TWICE (before AND inside the transaction) ─────────────────────────────
 *
 * `assertBeforeTx` is the cheap early refusal: a clear error, no transaction
 * opened, no lock taken.
 *
 * `assertInTx` is the one that actually holds. Between the pre-check and the
 * write, a student can be moved to another branch or the caller's `UserBranch`
 * rows can change. Re-resolving and re-authorising with the SAME transaction
 * client — inside the same Serializable boundary as the rows being written —
 * closes that window. Dropping either one leaves a real hole: only the first is
 * TOCTOU, only the second means an expensive path is entered before anyone
 * checks whether the caller may take it.
 *
 * ── THE TRUSTED PATH ──────────────────────────────────────────────────────────
 *
 * Gateway webhooks (Payme/Click/Uzum) and bot registration have NO human caller,
 * so neither assertion applies to them. They are safe on a different basis:
 * `companyId` comes from the request URL and merchant config server-side, and the
 * branch comes from the student. A `branchId` in a webhook body is always
 * ignored. Those paths call `resolveStudentBranchId` directly and must NOT be
 * routed through here — passing a synthetic caller id would be worse than the
 * honest exemption.
 */

/**
 * Pre-transaction check. Cheap, and produces the message the operator sees.
 *
 * Returns the student's branch so the caller can avoid resolving it twice on the
 * happy path — but the returned value is advisory: the write must still
 * re-resolve inside its transaction via {@link assertCallerMayWriteForStudentInTx}.
 */
export async function assertCallerMayWriteForStudent(
  prisma: PrismaLike,
  userId: number | undefined,
  studentId: number,
  companyId: number,
  message = "Bu o'quvchi boshqa filialga tegishli — unga pul yozish huquqingiz yo'q",
): Promise<number> {
  // Fail-closed: a student whose branch cannot be determined can take no money
  // at all, because the resulting row could never be attributed afterwards.
  const branchId = await resolveStudentBranchId(prisma, studentId, companyId);
  await assertCallerInBranch(prisma, userId, branchId, message);
  return branchId;
}

/**
 * The NON-money check on a student lives in `auth/student-branch-scope.ts`
 * (`assertCallerMayTouchStudent`), next to the group one it mirrors.
 *
 * It started here as a thin alias of the function above — same implementation,
 * different message. It moved out when the READ paths needed it, because a
 * profile tab must not inherit this file's two money-shaped decisions: a
 * branch-less student raises a raw error here (an unattributable ledger row IS
 * an emergency) and there is no existence check (the money callers all do
 * their own). On a page someone merely opened, those become a 500 where a 403
 * and a 404 belong. Money keeps the hard failure; that is the point of it.
 */

/**
 * In-transaction check. `tx` MUST be the transaction client that will write the
 * financial rows, not the root `PrismaService` — otherwise the check reads
 * outside the snapshot it is supposed to protect.
 */
export async function assertCallerMayWriteForStudentInTx(
  tx: Prisma.TransactionClient,
  userId: number | undefined,
  studentId: number,
  companyId: number,
): Promise<number> {
  return assertCallerMayWriteForStudent(tx, userId, studentId, companyId);
}
