export const SCENES = {
  STUDENT_REGISTRATION: 'student-registration',
  EMPLOYEE_REGISTRATION: 'employee-registration',
  MOCK_EXAM_REGISTRATION: 'mock-exam-registration',
  PASSWORD_RESET: 'password-reset',
} as const;

export const TEACHER_DEEP_LINK_PREFIX = 'teacher_';
export const STUDENT_DEEP_LINK_PREFIX = 'student_';
export const EMPLOYEE_DEEP_LINK_PREFIX = 'employee_';
export const MOCK_EXAM_DEEP_LINK_PREFIX = 'mock_';
/** Native app login (link/poll): t.me/<bot>?start=req_<id> → bot approves, app polls. */
export const APP_LOGIN_REQUEST_PREFIX = 'req_';
export const STUDENT_GROUP_DEEP_LINK_RE = /^student_(\d+)_group_(.+)$/;

/** `Branch.id` is a Postgres int4: a larger number makes the lookup throw. */
const MAX_BRANCH_ID = 2_147_483_647;

/**
 * The branch number in a `student_` link, or null unless it is plain digits
 * within int4. `Number()` alone let `1.5` through (Prisma truncates it to
 * branch 1), read `1e3` and `0x10` as branches 1000 and 16, and passed
 * `Infinity` and numbers past int4, which make the lookup throw.
 */
export function parseDeepLinkBranchId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const branchId = Number(raw);
  return branchId <= MAX_BRANCH_ID ? branchId : null;
}

/**
 * `employee_<branch>_roles_<ids>_t_<issued>_sig_<hmac>`, groups in that order.
 *
 * Role ids are joined with `-`, not `,`: Telegram only delivers a `?start=`
 * parameter made of base64url characters (`A-Z a-z 0-9 _ -`). A comma made the
 * client drop the parameter outright, so every multi-role link silently opened
 * the plain menu instead of the registration flow. `<issued>` is the base36
 * issue time the link expires by (ADR-0029). See `signed-link.util.ts`.
 */
export const EMPLOYEE_DEEP_LINK_RE =
  /^employee_(\d+)_roles_(\d+(?:-\d+)*)_t_([0-9a-z]+)_sig_([0-9a-f]+)$/i;
/**
 * The shape every employee link had before links carried an issue time
 * (ADR-0029). The bot answers it as expired instead of letting it fall
 * through to the plain menu.
 */
export const UNDATED_EMPLOYEE_DEEP_LINK_RE =
  /^employee_\d+_roles_\d+(?:-\d+)*_sig_[0-9a-f]+$/i;
/** Separator between role ids inside an employee deep-link payload. */
export const EMPLOYEE_ROLE_SEPARATOR = '-';

export const TEACHER_ROLE_ID = 4;
export const VALID_ROLE_IDS = [1, 2, 3, 4, 5] as const;

/**
 * Which roles each caller may hand out in a registration deep link.
 *
 * A signed link IS an account: whoever opens it registers with exactly those
 * roles. Without this ceiling an Administrator could generate a CEO link for
 * their own branch and grant themselves full access — the branch check alone
 * would not stop them. Nobody can grant above their own level.
 */
export const GRANTABLE_ROLE_IDS = {
  CEO: [1, 2, 3, 4, 5],
  BRANCH_DIRECTOR: [3, 4, 5],
  ADMINISTRATOR: [4, 5],
} as const satisfies Record<string, readonly number[]>;

/**
 * The ceiling for a caller holding these role names: the most senior of CEO,
 * Branch Director and Administrator decides. Holding none of them means
 * nothing is grantable, never a default row.
 *
 * Both doors that let a caller choose the roles read the map through this
 * function: the registration link (`generateEmployeeLinkPayload`) and the
 * signed-in employee write (`UsersService`). What they pass in differs. The
 * link takes the role names from the access token; the employee write reads
 * them from the database, where an archived caller has none (ADR-0026).
 */
export function grantableRoleIdsFor(
  roleNames: readonly string[],
): readonly number[] {
  if (roleNames.includes('CEO')) return GRANTABLE_ROLE_IDS.CEO;
  if (roleNames.includes('Branch Director')) {
    return GRANTABLE_ROLE_IDS.BRANCH_DIRECTOR;
  }
  if (roleNames.includes('Administrator')) {
    return GRANTABLE_ROLE_IDS.ADMINISTRATOR;
  }
  return [];
}

export const DEFAULT_COMPANY_ID = 1001;

/**
 * The `User.position` job title to write for a bot-registered employee, keyed
 * by role id. Mirrors `roleLabel` in
 * `client/src/components/payments/salary-utils.ts` exactly — same ids, same
 * labels — so the position shown on an employee registered via Telegram
 * matches what the salary/employee UI would already call that role.
 */
export const POSITION_LABELS: Record<number, string> = {
  1: 'Direktor',
  2: 'Filial direktori',
  3: 'Administrator',
  4: "O'qituvchi",
  5: 'Kassir',
};

/**
 * Derives the position to store for an employee granted these roles. When a
 * link grants several roles at once, the LOWEST role id wins (the senior
 * role), same tiebreak as `roleLabel`. Empty/unknown input yields ''  — the
 * caller (`assertRoleAndBranchRules`) is what turns that into a rejection.
 */
export function derivePositionForRoles(roleIds: number[]): string {
  if (!roleIds.length) return '';
  const lowestRoleId = [...roleIds].sort((a, b) => a - b)[0];
  return POSITION_LABELS[lowestRoleId] ?? '';
}
