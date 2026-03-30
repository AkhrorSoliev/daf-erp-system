export const SCENES = {
  TEACHER_REGISTRATION: 'teacher-registration',
  STUDENT_REGISTRATION: 'student-registration',
} as const;

export const DEEP_LINKS = {
  TEACHER: 'teacher',
  STUDENT: 'student',
} as const;

export const TEACHER_DEEP_LINK_PREFIX = 'teacher_';
export const STUDENT_DEEP_LINK_PREFIX = 'student_';
export const STUDENT_GROUP_DEEP_LINK_RE = /^student_(\d+)_group_(.+)$/;

export const TEACHER_ROLE_ID = 4;
export const DEFAULT_COMPANY_ID = 1001;
