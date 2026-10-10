/**
 * CEO decision (10.10.2026): nobody but the CEO pays their own salary or
 * writes, changes or deletes an advance to themselves — another manager does.
 * The server refuses it (`SalaryPaymentService.payPayment`,
 * `ExpensesService`); this keeps the screen from offering it.
 *
 * Role id 1 is the CEO: an identity question, like the all-branches switcher.
 */
export function isOwnPayrollLocked(
  payeeId: number | null | undefined,
  user: { id: number; roles: { id: number }[] } | null | undefined,
): boolean {
  if (!user || payeeId == null || payeeId !== user.id) return false;
  return !user.roles.some((r) => r.id === 1);
}
