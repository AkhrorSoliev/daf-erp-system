export const SCENES = {
  TEACHER_REGISTRATION: 'teacher-registration',
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
export const EMPLOYEE_DEEP_LINK_RE =
  /^employee_(\d+)_roles_([\d,]+)_sig_([0-9a-f]+)$/i;

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
