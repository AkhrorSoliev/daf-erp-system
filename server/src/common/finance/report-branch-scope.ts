/**
 * ONE branch filter for every financial report query.
 *
 * The reports module carried two competing branch parameters — `branchId` (the
 * header switcher's pick) and `branchIds` (the caller's own scope) — and every
 * query chose for itself which to honour. The result was a single workbook with
 * three different scopes in it: a Branch Director's export printed "Namangan
 * filali" on the cover, 162 127 987 so'm of Fargona income on the summary sheet,
 * and 0 on the P&L sheet. On the web page the same split showed Namangan (an
 * empty branch) owing 27 748 684 so'm.
 *
 * `branchWhere` in `period-helpers.ts` made it worse by letting `branchIds`
 * OVERRIDE `branchId`: the branch a user explicitly picked was silently
 * discarded in favour of their whole scope.
 *
 * The rule here is the opposite and is the only one that composes: the caller's
 * scope is a CEILING, the requested branch NARROWS within it. Resolve once at
 * the HTTP boundary, pass the answer everywhere.
 */
import { resolveCallerBranchScope } from '../auth/branch-scope';

/**
 * `null` = no filter, and it means it: a caller who legitimately spans every
 * branch (CEO) and has not picked one.
 *
 * An EMPTY array means NOTHING — never everything. A Branch Director asking for
 * a branch outside their scope, or one with no branch attached at all, gets
 * zeros rather than the whole company. Money reads fail closed, same rule as
 * `payroll-branch-scope.ts`.
 */
export type ReportBranchIds = number[] | null;

/**
 * @param callerBranchIds the caller's ceiling — `null` for a CEO, else their
 *   explicit `UserBranch` list (possibly empty)
 * @param requestedBranchId the branch picked in the header switcher, if any
 */
export function resolveReportBranchIds(
  callerBranchIds: ReportBranchIds,
  requestedBranchId?: number | null,
): ReportBranchIds {
  const requested =
    typeof requestedBranchId === 'number' ? requestedBranchId : undefined;

  // CEO: unrestricted, so the switcher alone decides.
  if (callerBranchIds === null) {
    return requested !== undefined ? [requested] : null;
  }

  // Scoped caller with a pick: honour it only if it is inside their ceiling.
  // Outside → empty, not "fall back to their whole scope" (that would show a
  // branch they did not ask for under a header naming the one they did).
  if (requested !== undefined) {
    return callerBranchIds.includes(requested) ? [requested] : [];
  }

  // Scoped caller, no pick: their whole scope. Multi-branch admins rely on
  // this — see `common/auth/branch-scope.ts`.
  return callerBranchIds;
}

/**
 * `where` fragment for a model carrying `branchId` directly (Payment, Expense,
 * Transaction, CashMovement, Group…).
 *
 * `{ in: [] }` compiles to a false predicate, which is exactly the fail-closed
 * behaviour an empty scope must have.
 */
export function branchIdWhere(ids: ReportBranchIds | undefined): {
  branchId?: { in: number[] };
} {
  // `undefined` is unreachable through the types (every consumer declares the
  // field as required) but is normalised anyway so an untyped caller can never
  // produce `{ in: undefined }`, which Prisma silently drops.
  return ids == null ? {} : { branchId: { in: ids } };
}

/**
 * `where` fragment for Student — the branch lives on the `StudentBranch` join,
 * not on the row. This is the predicate every student LIST already filters on
 * (`/students?branch_id=`, debtors, balance sheet), so the money reports must
 * slice students the same way or two pages disagree about the same total.
 */
export function studentBranchWhere(ids: ReportBranchIds | undefined): {
  branches?: { some: { branchId: { in: number[] } } };
} {
  return ids == null ? {} : { branches: { some: { branchId: { in: ids } } } };
}

/**
 * `where` fragment for a model whose branch lives on its Group — Attendance,
 * Enrollment, SalaryAccrual, GroupTeacher.
 *
 * These carry no `branchId` of their own, and joining live is safe here for the
 * same reason Batch 1c made it safe for payroll: a group's branch is fixed at
 * creation (`UpdateGroupDto.branchId` is discarded), so the join can never
 * retroactively re-attribute settled history.
 */
export function groupBranchWhere(ids: ReportBranchIds | undefined): {
  group?: { branchId: { in: number[] } };
} {
  return ids == null ? {} : { group: { branchId: { in: ids } } };
}

/**
 * `where` fragment for an employee (User). `mainBranch` and `UserBranch` are
 * both consulted because different parts of the system wrote one or the other;
 * `common/auth/branch-scope.ts` merges them for the same reason.
 */
export function userBranchWhere(ids: ReportBranchIds | undefined): {
  OR?: (
    | { mainBranch: { in: number[] } }
    | { branches: { some: { branchId: { in: number[] } } } }
  )[];
} {
  if (ids == null) return {};
  return {
    OR: [
      { mainBranch: { in: ids } },
      { branches: { some: { branchId: { in: ids } } } },
    ],
  };
}

/**
 * The one call a report endpoint makes: the caller's ceiling from their roles
 * and branch attachments, intersected with the branch they picked.
 *
 * Every money endpoint should resolve its scope HERE, at the HTTP boundary, and
 * pass the answer down. Services that re-derive it from a raw `branchId` are how
 * three scopes ended up in one workbook.
 */
export async function resolveCallerReportBranchIds(
  prisma: Parameters<typeof resolveCallerBranchScope>[0],
  userId: number | undefined,
  requestedBranchId?: number | null,
): Promise<ReportBranchIds> {
  const scope = await resolveCallerBranchScope(prisma, userId);
  return resolveReportBranchIds(
    scope.kind === 'all' ? null : scope.branchIds,
    requestedBranchId,
  );
}

/** A confined scope with no branch in it: the caller must be shown NOTHING. */
export function isEmptyScope(ids: ReportBranchIds | undefined): boolean {
  return ids != null && ids.length === 0;
}

/**
 * Collapse a resolved scope into the single `branchId?: number` that the
 * operational reports still speak, refusing every case the narrow shape cannot
 * express faithfully.
 *
 * Those services (KPIs, attendance analytics, departed students, payment
 * reports…) each take one optional branch id, and they took it straight off the
 * query string: omitted meant company-wide and any id meant that branch, so a
 * Namangan director read Fargona's numbers by editing a parameter.
 *
 * Rather than rewrite ~25 service signatures at once, the CONTROLLER narrows the
 * query to the resolved answer. The three refusals matter more than the happy
 * path — each is a case where returning a number would be worse than returning
 * an error:
 *
 *   `[]`         → 403. The caller asked for a branch outside their ceiling, or
 *                  has none attached. Zeros would read as "this branch earned
 *                  nothing", which is a very different claim from "you may not
 *                  look".
 *   many         → 400. A multi-branch caller cannot be expressed as one id, and
 *                  dropping the filter would silently serve the whole company.
 *                  Ask them to pick. (In practice unreachable: employees hold one
 *                  branch, and only a CEO — who resolves to `null` — spans more.)
 *   `null`       → `undefined`. A CEO who picked nothing genuinely wants every
 *                  branch; this is the ONE case where no filter is correct.
 */
export function narrowToSingleBranch(
  ids: ReportBranchIds,
  onEmpty: () => never,
  onAmbiguous: () => never,
): number | undefined {
  if (ids == null) return undefined;
  if (ids.length === 0) onEmpty();
  if (ids.length > 1) onAmbiguous();
  return ids[0];
}

/**
 * The single branch id when the scope names exactly one, else `undefined`.
 *
 * Bridge for the services still typed `branchId?: number` (`getSalaryMonthly`,
 * `getMonthlyNetProfit`). `undefined` there means "no branch filter", so an
 * EMPTY scope must never reach it — **guard with `isEmptyScope` first** and
 * short-circuit the report. A multi-branch scope also degrades to `undefined`,
 * which is safe only because those services re-confine themselves from
 * `performedById` (`resolveMonthlyScope`).
 */
export function singleBranchId(
  ids: ReportBranchIds | undefined,
): number | undefined {
  return ids != null && ids.length === 1 ? ids[0] : undefined;
}
