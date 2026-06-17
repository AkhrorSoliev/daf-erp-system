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
/** Native app login: t.me/<bot>?start=applogin → bot auto-sends a one-time code. */
export const APP_LOGIN_DEEP_LINK = 'applogin';
/** Native app login (link/poll): t.me/<bot>?start=req_<id> → bot approves, app polls. */
export const APP_LOGIN_REQUEST_PREFIX = 'req_';
export const STUDENT_GROUP_DEEP_LINK_RE = /^student_(\d+)_group_(.+)$/;
export const EMPLOYEE_DEEP_LINK_RE =
  /^employee_(\d+)_roles_([\d,]+)_sig_([0-9a-f]+)$/i;

export const TEACHER_ROLE_ID = 4;
export const VALID_ROLE_IDS = [1, 2, 3, 4, 5] as const;
export const DEFAULT_COMPANY_ID = 1001;
