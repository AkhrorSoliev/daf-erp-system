import {
  A,
  D,
  K,
  LOCK,
  T,
  type PermissionDef,
} from './permission-catalog.types';

/**
 * Capabilities of the sections O'quvchilar, Guruhlar va davomat, Lidlar,
 * Aloqa markazi and Mock imtihonlar. `allowedRoles` and `lockReasons` follow
 * ADR-0087's table; a lock other than OWN_GROUPS names its cause.
 */
export const PEOPLE_PERMISSIONS = {
  // O'quvchilar
  'students.list': {
    section: 'students',
    label: "O'quvchilar ro'yxati",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'students.profile': {
    section: 'students',
    label: "O'quvchi profilini ochish",
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'students.details': {
    section: 'students',
    label:
      "O'quvchi profilidagi tablar: to'lovlar, darslar, izohlar, lid tarixi, ilova",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile'],
  },
  // A cashier holding it is still refused the discount field by
  // `students/discount-role.guard.ts` (it only narrows).
  'students.manage': {
    section: 'students',
    label: "O'quvchi qo'shish, tahrirlash va holatini o'zgartirish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile'],
  },
  'students.enroll': {
    section: 'students',
    label: "Guruhga qo'shish va guruhdan chiqarish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile', 'groups.view'],
  },
  'students.sms': {
    section: 'students',
    label: "O'quvchiga SMS yuborish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
  },
  'students.initial-balance': {
    section: 'students',
    label: "Boshlang'ich balans kiritish",
    defaultRoles: [],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile'],
    danger: 'money',
  },
  // The contract document's writes (ADR-0075), confined by
  // `contract-documents/contract-documents.service.ts`. Reading contracts
  // stays on `students.details`; cancelling a signed one stays CEO-only.
  'contracts.manage': {
    section: 'students',
    label: 'Shartnoma tuzish va imzolash',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
  },

  // Guruhlar va davomat
  'groups.view': {
    section: 'groups',
    label: "Guruhlarni ko'rish (o'qituvchi faqat o'z guruhlarini)",
    defaultRoles: [D, A, T],
    allowedRoles: [D, A, K, T],
    lockReasons: {},
    requires: [],
  },
  // T: `groups/groups-write.service.ts` and `groups-status.service.ts` pass
  // NO_TEACHER_PATH, so a teacher would be checked by branch, not assignment.
  'groups.manage': {
    section: 'groups',
    label: 'Guruh ochish, tahrirlash va yopish',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.UNTESTED },
    requires: ['groups.view'],
  },
  // T: the write guards pass no `lessonDate`
  // (`lesson-cancellations/lesson-cancellations.service.ts`), so any cover of
  // the group would admit a teacher.
  'lessons.change': {
    section: 'groups',
    label: "Darsni bekor qilish, ko'chirish va o'rinbosar ustoz qo'yish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.UNTESTED },
    requires: ['groups.view'],
  },
  'lessons.change-delete': {
    section: 'groups',
    label: "Bekor qilish, ko'chirish va o'rinbosarni o'chirish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.UNTESTED },
    requires: ['lessons.change'],
    danger: 'money',
  },
  // K gets the administrator's editing of a taken register
  // (`attendance/attendance-save.service.ts`).
  'attendance.mark': {
    section: 'groups',
    label: 'Davomat olish',
    defaultRoles: [D, A, T],
    allowedRoles: [D, A, K, T],
    lockReasons: {},
    requires: ['groups.view'],
  },
  // T: `attendance/attendance.controller.ts` drops `late=1` for a teacher and
  // `attendance-save.service.ts` writes the late register as a non-teacher.
  'attendance.fix': {
    section: 'groups',
    label:
      "Kech davomat, «Dars bo'ldimi?» javobi va oldindan aytilgan qoldirish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.UNTESTED },
    requires: ['attendance.mark'],
  },

  // Lidlar
  'leads.view': {
    section: 'leads',
    label: 'Lidlar doskasi',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'leads.manage': {
    section: 'leads',
    label: "Lid qo'shish, tahrirlash va o'quvchiga aylantirish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['leads.view'],
  },
  // POST/PATCH/DELETE /lead-sources are COMPANY_WIDE (LeadSource has no branch).
  'leads.setup': {
    section: 'leads',
    label: "Doska ustunlari, bo'limlari va manbalari",
    defaultRoles: [D, A],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.COMPANY, [T]: LOCK.COMPANY },
    requires: ['leads.view'],
  },
  'leads.forms': {
    section: 'leads',
    label: 'Anketalar va ularning javoblari',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // Lead owner (ADR-0092). Claiming is the administrator's daily work; a
  // director or a cashier who works leads can be given it on «Ruxsatlar».
  'leads.claim': {
    section: 'leads',
    label: "Lidni band qilish va o'z lidini bo'shatish",
    defaultRoles: [A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['leads.view'],
  },
  // Handing a lead to someone else is a manager's tool (CEO, 16.10.2026):
  // `LeadOwnershipService.assign` trusts the caller's branch scope as a
  // director's and was never tried for an administrator or a cashier.
  'leads.assign': {
    section: 'leads',
    label: 'Lidni boshqa xodimga berish',
    defaultRoles: [D],
    allowedRoles: [D],
    lockReasons: {
      [A]: LOCK.UNTESTED,
      [K]: LOCK.UNTESTED,
      [T]: LOCK.OWN_GROUPS,
    },
    requires: ['leads.view'],
  },

  // Aloqa markazi
  'outreach.view': {
    section: 'outreach',
    label: 'Aloqa markazi sahifasi',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'calls.log': {
    section: 'outreach',
    label: "Qo'ng'iroq natijasini kiritish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },

  // Mock imtihonlar
  'mock.view': {
    section: 'mock',
    label: "Mock imtihonlarni ko'rish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // The mock-exam-sections writes are COMPANY_WIDE (MockExamSection has no branch).
  'mock.manage': {
    section: 'mock',
    label: "Imtihon yaratish, natija kiritish va e'lon qilish",
    defaultRoles: [D, A],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.COMPANY, [T]: LOCK.COMPANY },
    requires: ['mock.view'],
  },
  'mock.payments': {
    section: 'mock',
    label: "Mock to'lovini qabul qilish va bekor qilish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['mock.view'],
    danger: 'money',
  },
} as const satisfies Record<string, PermissionDef>;
