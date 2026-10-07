/**
 * Pure permission rules for tasks (spec 2026-10-07 §5). No Prisma here: the
 * service loads people and passes them in, so every rule is unit-testable and,
 * later, the Ruxsatlar tizimi can replace a function body without touching
 * callers.
 */
export const ROLE_ID = {
  CEO: 1,
  BRANCH_DIRECTOR: 2,
  ADMINISTRATOR: 3,
  TEACHER: 4,
  CASHIER: 5,
} as const;

/** The target's HIGHEST role (smallest id) must be inside the caller's list. */
const ASSIGN_LADDER: Record<number, readonly number[]> = {
  [ROLE_ID.CEO]: [1, 2, 3, 4, 5],
  [ROLE_ID.BRANCH_DIRECTOR]: [2, 3, 4, 5],
  [ROLE_ID.ADMINISTRATOR]: [3, 4, 5],
};

export type PolicyPerson = {
  id: number;
  roleIds: readonly number[];
  /** `'all'` = CEO (branch-less by design). */
  branchIds: readonly number[] | 'all';
};

export type TaskForAccess = {
  authorId: number | null;
  branchId: number | null;
  participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[];
};

export type TaskAccess = {
  isAuthor: boolean;
  isAssignee: boolean;
  isWatcher: boolean;
  isManager: boolean;
  canView: boolean;
  canManage: boolean;
  canWork: boolean;
};

export function highestRoleId(roleIds: readonly number[]): number | null {
  const staff = roleIds.filter((id) => id >= 1 && id <= 5);
  return staff.length ? Math.min(...staff) : null;
}

export function assignableRoleIds(
  callerRoleIds: readonly number[],
): readonly number[] {
  const top = highestRoleId(callerRoleIds);
  return top === null ? [] : (ASSIGN_LADDER[top] ?? []);
}

function sharesBranch(caller: PolicyPerson, target: PolicyPerson): boolean {
  // Hoisted into consts: TypeScript drops a property's narrowing inside a callback.
  const callerIds = caller.branchIds;
  const targetIds = target.branchIds;
  if (callerIds === 'all') return true;
  if (targetIds === 'all') return false;
  return targetIds.some((b) => callerIds.includes(b));
}

export function canAssignTo(
  caller: PolicyPerson,
  target: PolicyPerson,
): boolean {
  if (caller.id === target.id) return true;
  const targetTop = highestRoleId(target.roleIds);
  if (targetTop === null) return false;
  if (!assignableRoleIds(caller.roleIds).includes(targetTop)) return false;
  return sharesBranch(caller, target);
}

/** A watcher is anyone assignable, oneself, or someone more senior (they only read). */
export function canWatch(caller: PolicyPerson, target: PolicyPerson): boolean {
  if (canAssignTo(caller, target)) return true;
  const callerTop = highestRoleId(caller.roleIds);
  const targetTop = highestRoleId(target.roleIds);
  if (callerTop === null || targetTop === null) return false;
  return (
    targetTop < callerTop &&
    (target.branchIds === 'all' || sharesBranch(caller, target))
  );
}

export function resolveAccess(
  caller: PolicyPerson,
  task: TaskForAccess,
): TaskAccess {
  const isAuthor = task.authorId !== null && task.authorId === caller.id;
  const mine = task.participants.filter((p) => p.userId === caller.id);
  const isAssignee = mine.some((p) => p.role === 'ASSIGNEE');
  const isWatcher = mine.some((p) => p.role === 'WATCHER');
  const top = highestRoleId(caller.roleIds);
  const isManager =
    top === ROLE_ID.CEO ||
    (top === ROLE_ID.BRANCH_DIRECTOR &&
      task.branchId !== null &&
      caller.branchIds !== 'all' &&
      caller.branchIds.includes(task.branchId));
  const canView = isAuthor || isAssignee || isWatcher || isManager;
  const canManage = isAuthor || isManager;
  return {
    isAuthor,
    isAssignee,
    isWatcher,
    isManager,
    canView,
    canManage,
    canWork: isAssignee || canManage,
  };
}
