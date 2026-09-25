/**
 * ⚙ Salary settings — who sees what (ADR-0034).
 *
 * The server enforces this rule itself (`teacher-rate-permission.ts`); this
 * file is UI only — a director is not shown something that would 403 anyway
 * the moment they click it.
 */
export interface SalarySettingsAccess {
  /** The "Sozlamalar" button and the "Ustoz stavkalari" list. */
  canOpen: boolean;
  /** Cycle period and "Xodimlar stavkalari" — CEO only. */
  canManageCompanyPayroll: boolean;
  /** Deactivating a rate — CEO only: a deactivated rate means no salary is accrued. */
  canDeactivateRate: boolean;
}

export function resolveSalarySettingsAccess(
  roleIds: number[],
): SalarySettingsAccess {
  const ceo = roleIds.includes(1);
  const director = roleIds.includes(2);
  return {
    canOpen: ceo || director,
    canManageCompanyPayroll: ceo,
    canDeactivateRate: ceo,
  };
}

/**
 * True when the row's own account is not usable — mirrors the server's
 * `teacherRateRefusal` step 4 (`status !== ACTIVE || isActive === false`).
 * Absent fields read as "active", so a caller that never fetched them (or an
 * older cached response) does not spuriously lock every row.
 */
export function isInactiveAccount(target: {
  isActive?: boolean;
  status?: string;
}): boolean {
  return (
    target.isActive === false ||
    (target.status !== undefined && target.status !== "ACTIVE")
  );
}

/**
 * Whether a Branch Director may set THIS target's rate — mirrors the
 * server's `teacher-rate-permission.ts` gate for `POST /salary/config`
 * (ADR-0034): the target must hold Teacher, and must not also hold CEO or
 * Branch Director (an admin/cashier who also teaches is ratable; another
 * director or the CEO never is), must not be the caller themself, and the
 * account must be active — a director must not be offered the pencil for a
 * teacher who has left (R6; the server's own active/isActive check already
 * covers this, so a rateable row still never 403s).
 *
 * The CEO is not gated by this function at all — `SalarySettingsSheet` only
 * calls it when `access.canManageCompanyPayroll` is false, i.e. for a
 * director.
 */
export function canDirectorRate(
  target: {
    id: number;
    roles: { name: string }[];
    isActive?: boolean;
    status?: string;
  },
  selfId: number,
): boolean {
  const holds = (roleName: string) =>
    target.roles.some((r) => r.name === roleName);
  return (
    holds("Teacher") &&
    !holds("CEO") &&
    !holds("Branch Director") &&
    target.id !== selfId &&
    !isInactiveAccount(target)
  );
}
