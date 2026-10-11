import {
  A,
  D,
  K,
  LOCK,
  T,
  type PermissionDef,
} from './permission-catalog.types';

/**
 * Capabilities of the sections Xodimlar, Izohlar, Sozlamalar, Bosh sahifa and
 * DaF ilovasi va media. `allowedRoles` and `lockReasons` follow ADR-0086's
 * table; a lock other than OWN_GROUPS names its cause.
 */
export const ADMIN_PERMISSIONS = {
  // Xodimlar
  // K: the teacher timeline is confined (`branch-route-policy.ts`, plan A).
  'teachers.view': {
    section: 'staff',
    label: "O'qituvchilar ro'yxati va profili",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // K, T: `teachers/teachers.service.ts` `create` never reads the role
  // ceiling, which is empty for them (`telegram/constants.ts`).
  'teachers.manage': {
    section: 'staff',
    label: "O'qituvchi qo'shish, tahrirlash va holatini o'zgartirish",
    defaultRoles: [D],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.UNTESTED, [T]: LOCK.UNTESTED },
    requires: ['teachers.view'],
  },
  'employees.view': {
    section: 'staff',
    label: "Xodimlar ro'yxati va kartasi",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // K, T: `users/users.service.ts` returns early when no role changes, so an
  // empty-ceiling caller could create a role-less employee.
  'employees.manage': {
    section: 'staff',
    label: "Xodim qo'shish, tahrirlash va bloklash",
    defaultRoles: [D],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.UNTESTED, [T]: LOCK.UNTESTED },
    requires: ['employees.view'],
  },
  // K, T: `telegram/telegram.service.ts` refuses every request (ceiling []).
  'employees.invite': {
    section: 'staff',
    label: 'Telegram orqali xodim taklif qilish',
    defaultRoles: [D, A],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.UNTESTED, [T]: LOCK.UNTESTED },
    requires: [],
  },

  // Izohlar
  'comments.write': {
    section: 'comments',
    label: 'Izoh yozish',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // `comments/comments.service.ts` deletes and moderates by id + companyId.
  'comments.delete': {
    section: 'comments',
    label: "Boshqalarning izohini tahrirlash va o'chirish",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.BRANCH,
      [A]: LOCK.BRANCH,
      [K]: LOCK.BRANCH,
      [T]: LOCK.BRANCH,
    },
    requires: ['comments.write'],
  },

  // Sozlamalar
  // The three reason lists are COMPANY_WIDE writes.
  'settings.reference': {
    section: 'settings',
    label: "Kurslar, xonalar, dam olish kunlari va sabablar ro'yxatlari",
    defaultRoles: [D, A],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.COMPANY, [T]: LOCK.COMPANY },
    requires: [],
  },
  'courses.create': {
    section: 'settings',
    label: "Kurs ochish va to'lov turini tanlash",
    defaultRoles: [D],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.COMPANY, [T]: LOCK.COMPANY },
    requires: ['settings.reference'],
  },
  // A, K: only the CEO opens a branch (`branches/branches.service.ts`
  // `create`); the rest is confined to the caller's own branch. Closing a
  // branch cascades to its groups, hence `irreversible`.
  'settings.branches': {
    section: 'settings',
    label: 'Filiallar: tahrirlash va yopish',
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.NO_PAGE },
    requires: [],
    danger: 'irreversible',
  },
  'settings.payment': {
    section: 'settings',
    label: "To'lov sozlamalari (filial qismi)",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.NO_PAGE },
    requires: [],
  },
  // Approving a group binds it to a branch, and the branch's 21:00 money
  // report starts going there (`telegram-groups/telegram-groups.service.ts`).
  'settings.telegram-groups': {
    section: 'settings',
    label: 'Telegram guruhlarini tasdiqlash va sozlash',
    defaultRoles: [D],
    allowedRoles: [D],
    lockReasons: {
      [A]: LOCK.GROUP_REPORT,
      [K]: LOCK.GROUP_REPORT,
      [T]: LOCK.GROUP_REPORT,
    },
    requires: [],
  },
  // A COMPANY_WIDE read.
  'settings.absence-pause': {
    section: 'settings',
    label: "Avtomatik pauza sozlamasini ko'rish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.NO_PAGE },
    requires: [],
  },
  // POST /telegram-groups/announce reaches every company.
  'telegram.announce': {
    section: 'settings',
    label: "Telegram guruhlariga e'lon yuborish va botni guruhdan uzish",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.COMPANY,
      [A]: LOCK.COMPANY,
      [K]: LOCK.COMPANY,
      [T]: LOCK.COMPANY,
    },
    requires: ['settings.telegram-groups'],
  },
  // PATCH /company/:id and PATCH /absence-pause/settings.
  'settings.company': {
    section: 'settings',
    label: 'Kompaniya darajasidagi sozlamalar',
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.COMPANY,
      [A]: LOCK.COMPANY,
      [K]: LOCK.COMPANY,
      [T]: LOCK.COMPANY,
    },
    requires: [],
  },
  // The five /archive* routes are UNREVIEWED.
  'settings.archive': {
    section: 'settings',
    label: "Arxiv: tiklash va butunlay o'chirish",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.BRANCH,
      [A]: LOCK.BRANCH,
      [K]: LOCK.BRANCH,
      [T]: LOCK.BRANCH,
    },
    requires: [],
    danger: 'irreversible',
  },

  // Bosh sahifa
  // `dashboard/dashboard-summary.service.ts` is branch-wide.
  'dashboard.view': {
    section: 'home',
    label: 'Bosh sahifa paneli',
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },

  // DaF ilovasi va media
  'daf.activity': {
    section: 'daf',
    label: "DaF ilovasi: markaz bo'yicha faollik",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'media.view': {
    section: 'daf',
    label: 'Media',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.NO_PAGE },
    requires: [],
  },
} as const satisfies Record<string, PermissionDef>;
