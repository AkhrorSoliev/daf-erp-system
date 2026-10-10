import { ROLE_ID } from '../auth/role-ids';

/**
 * Every capability ("imkoniyat") a staff role can hold — the single source of
 * truth (spec docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md,
 * section 10). A role answers "who is this?" (portal, rank, branch, own
 * groups); a capability answers "what may they do?".
 *
 * `defaultRoles` is today's behaviour, route by route. In stage 1 nobody can
 * change it, so a non-CEO's capabilities are the union of the defaults of the
 * roles they hold, and the CEO holds every capability, always.
 *
 * `label` is what the CEO will read on the «Ruxsatlar» page (stage 2): Uzbek,
 * no English words. `requires` lists what must also be on for a capability to
 * work; the catalog spec checks that the defaults honour it. `danger` marks
 * an action that moves money or cannot be undone (a red sign on the page).
 */
const D = ROLE_ID.BRANCH_DIRECTOR;
const A = ROLE_ID.ADMINISTRATOR;
const T = ROLE_ID.TEACHER;
const K = ROLE_ID.CASHIER;

export type StaffRoleId = typeof D | typeof A | typeof T | typeof K;

export const PERMISSION_SECTIONS = [
  { key: 'students', label: "O'quvchilar" },
  { key: 'groups', label: 'Guruhlar va davomat' },
  { key: 'leads', label: 'Lidlar' },
  { key: 'outreach', label: 'Aloqa markazi' },
  { key: 'mock', label: 'Mock imtihonlar' },
  { key: 'payments', label: "To'lovlar va qarzdorlik" },
  { key: 'expenses', label: 'Xarajatlar va kassa' },
  { key: 'salary', label: 'Ish haqi' },
  { key: 'reports', label: 'Hisobotlar' },
  { key: 'staff', label: 'Xodimlar' },
  { key: 'comments', label: 'Izohlar' },
  { key: 'settings', label: 'Sozlamalar' },
  { key: 'home', label: 'Bosh sahifa' },
  { key: 'daf', label: 'DaF ilovasi va media' },
] as const;

export type PermissionSection = (typeof PERMISSION_SECTIONS)[number]['key'];

export interface PermissionDef {
  readonly section: PermissionSection;
  readonly label: string;
  readonly defaultRoles: readonly StaffRoleId[];
  readonly requires: readonly string[];
  readonly danger?: 'money' | 'irreversible';
}

export const PERMISSIONS = {
  // O'quvchilar
  'students.list': {
    section: 'students',
    label: "O'quvchilar ro'yxati",
    defaultRoles: [D, A],
    requires: [],
  },
  'students.profile': {
    section: 'students',
    label: "O'quvchi profilini ochish",
    defaultRoles: [D, A, K],
    requires: [],
  },
  'students.details': {
    section: 'students',
    label:
      "O'quvchi profilidagi tablar: to'lovlar, darslar, izohlar, lid tarixi, ilova",
    defaultRoles: [D, A],
    requires: ['students.profile'],
  },
  'students.manage': {
    section: 'students',
    label: "O'quvchi qo'shish, tahrirlash va holatini o'zgartirish",
    defaultRoles: [D, A],
    requires: ['students.profile'],
  },
  'students.enroll': {
    section: 'students',
    label: "Guruhga qo'shish va guruhdan chiqarish",
    defaultRoles: [D, A],
    requires: ['students.profile', 'groups.view'],
  },
  'students.sms': {
    section: 'students',
    label: "O'quvchiga SMS yuborish",
    defaultRoles: [D, A],
    requires: ['students.details'],
  },
  'students.initial-balance': {
    section: 'students',
    label: "Boshlang'ich balans kiritish",
    defaultRoles: [],
    requires: ['students.profile'],
    danger: 'money',
  },

  // Guruhlar va davomat
  'groups.view': {
    section: 'groups',
    label: "Guruhlarni ko'rish (o'qituvchi faqat o'z guruhlarini)",
    defaultRoles: [D, A, T],
    requires: [],
  },
  'groups.manage': {
    section: 'groups',
    label: 'Guruh ochish, tahrirlash va yopish',
    defaultRoles: [D, A],
    requires: ['groups.view'],
  },
  'lessons.change': {
    section: 'groups',
    label: "Darsni bekor qilish, ko'chirish va o'rinbosar ustoz qo'yish",
    defaultRoles: [D, A],
    requires: ['groups.view'],
  },
  'lessons.change-delete': {
    section: 'groups',
    label: "Bekor qilish, ko'chirish va o'rinbosarni o'chirish",
    defaultRoles: [D],
    requires: ['lessons.change'],
    danger: 'money',
  },
  'attendance.mark': {
    section: 'groups',
    label: 'Davomat olish',
    defaultRoles: [D, A, T],
    requires: ['groups.view'],
  },
  'attendance.fix': {
    section: 'groups',
    label:
      "Kech davomat, «Dars bo'ldimi?» javobi va oldindan aytilgan qoldirish",
    defaultRoles: [D, A],
    requires: ['attendance.mark'],
  },

  // Lidlar
  'leads.view': {
    section: 'leads',
    label: 'Lidlar doskasi',
    defaultRoles: [D, A],
    requires: [],
  },
  'leads.manage': {
    section: 'leads',
    label: "Lid qo'shish, tahrirlash va o'quvchiga aylantirish",
    defaultRoles: [D, A],
    requires: ['leads.view'],
  },
  'leads.setup': {
    section: 'leads',
    label: "Doska ustunlari, bo'limlari va manbalari",
    defaultRoles: [D, A],
    requires: ['leads.view'],
  },
  'leads.forms': {
    section: 'leads',
    label: 'Anketalar va ularning javoblari',
    defaultRoles: [D, A],
    requires: [],
  },

  // Aloqa markazi
  'outreach.view': {
    section: 'outreach',
    label: 'Aloqa markazi sahifasi',
    defaultRoles: [D, A],
    requires: [],
  },
  'calls.log': {
    section: 'outreach',
    label: "Qo'ng'iroq natijasini kiritish",
    defaultRoles: [D, A],
    requires: [],
  },

  // Mock imtihonlar
  'mock.view': {
    section: 'mock',
    label: "Mock imtihonlarni ko'rish",
    defaultRoles: [D, A],
    requires: [],
  },
  'mock.manage': {
    section: 'mock',
    label: "Imtihon yaratish, natija kiritish va e'lon qilish",
    defaultRoles: [D, A],
    requires: ['mock.view'],
  },
  'mock.payments': {
    section: 'mock',
    label: "Mock to'lovini qabul qilish va bekor qilish",
    defaultRoles: [D, A],
    requires: ['mock.view'],
    danger: 'money',
  },

  // To'lovlar va qarzdorlik
  'payments.view': {
    section: 'payments',
    label: "Moliya bo'limi: to'lovlar va kutilayotgan to'lovlar",
    defaultRoles: [D, A, K],
    requires: [],
  },
  'payments.create': {
    section: 'payments',
    label: "To'lov qayd qilish",
    defaultRoles: [D, A, K],
    requires: [],
  },
  'payments.correct': {
    section: 'payments',
    label: "To'lovni tuzatish",
    defaultRoles: [D, A],
    requires: ['students.details'],
    danger: 'money',
  },
  'debt.view': {
    section: 'payments',
    label: 'Qarzdorlik sahifasi',
    defaultRoles: [D, A, K],
    requires: [],
  },
  'debt.promise': {
    section: 'payments',
    label: "To'lov va'dasini yozish",
    defaultRoles: [D, A, K],
    requires: ['debt.view'],
  },
  'balance.withdraw': {
    section: 'payments',
    label: "Balansdagi pulni markaz hisobiga o'tkazish",
    defaultRoles: [D, A],
    requires: ['students.profile'],
    danger: 'money',
  },
  'refunds.create': {
    section: 'payments',
    label: "O'quvchiga pul qaytarish",
    defaultRoles: [D, A],
    requires: ['students.profile'],
    danger: 'money',
  },
  'refunds.hand-over': {
    section: 'payments',
    label: "Qaytariladigan pulni o'quvchiga topshirish",
    defaultRoles: [D, A, K],
    requires: ['debt.view'],
    danger: 'money',
  },
  'refunds.cancel': {
    section: 'payments',
    label: "Pul qaytarish so'rovini bekor qilish",
    defaultRoles: [D],
    requires: ['refunds.create'],
    danger: 'money',
  },
  'debt.write-off': {
    section: 'payments',
    label: 'Qarzni kechirish',
    defaultRoles: [D, A],
    requires: ['students.details'],
    danger: 'money',
  },
  'balance.adjust': {
    section: 'payments',
    label: "Balansni qo'lda tuzatish va yechilgan dars pulini qaytarish",
    defaultRoles: [D],
    requires: ['students.details'],
    danger: 'money',
  },
  'money.undo': {
    section: 'payments',
    label: "To'lov, pul qaytarish va qarz kechirishni bekor qilish",
    defaultRoles: [],
    requires: ['students.details'],
    danger: 'money',
  },
  'payments.gateway-log': {
    section: 'payments',
    label: "To'lov tizimlari jurnali (Payme, Click)",
    defaultRoles: [],
    requires: ['payments.view'],
  },

  // Xarajatlar va kassa
  'expenses.view': {
    section: 'expenses',
    label: "Xarajatlarni ko'rish",
    defaultRoles: [D],
    requires: [],
  },
  'expenses.manage': {
    section: 'expenses',
    label: "Xarajat kiritish, tahrirlash va o'chirish",
    defaultRoles: [D],
    requires: ['expenses.view'],
    danger: 'money',
  },
  'cash.manage': {
    section: 'expenses',
    label: "Kassa hisoblari va ular orasida o'tkazma",
    defaultRoles: [D],
    requires: [],
    danger: 'money',
  },

  // Ish haqi
  'salary.view': {
    section: 'salary',
    label: "Xodimlar oyligini ko'rish",
    defaultRoles: [D],
    requires: [],
  },
  'salary.rate': {
    section: 'salary',
    label: "O'qituvchiga stavka qo'yish",
    defaultRoles: [D],
    requires: ['salary.view'],
    danger: 'money',
  },
  'salary.pay': {
    section: 'salary',
    label: "Oylik va avans to'lash",
    defaultRoles: [D],
    requires: ['salary.view'],
    danger: 'money',
  },
  'salary.rate-edit': {
    section: 'salary',
    label: "Stavkani o'zgartirish va umumiy stavka",
    defaultRoles: [],
    requires: ['salary.view'],
    danger: 'money',
  },
  'salary.close': {
    section: 'salary',
    label: 'Oylikni hisoblash, tasdiqlash, oyni yopish va oylik davri',
    defaultRoles: [],
    requires: ['salary.view'],
    danger: 'money',
  },

  // Hisobotlar
  'reports.finance': {
    section: 'reports',
    label: 'Moliya va marketing hisobotlari',
    defaultRoles: [D],
    requires: [],
  },
  'reports.payments': {
    section: 'reports',
    label: "To'lov hisobotlari",
    defaultRoles: [D, A],
    requires: [],
  },
  'reports.students': {
    section: 'reports',
    label: "O'quvchilar, davomat va faoliyat hisobotlari",
    defaultRoles: [D],
    requires: [],
  },
  'reports.leads': {
    section: 'reports',
    label: 'Lidlar hisoboti',
    defaultRoles: [D, A],
    requires: [],
  },

  // Xodimlar
  'teachers.view': {
    section: 'staff',
    label: "O'qituvchilar ro'yxati va profili",
    defaultRoles: [D, A],
    requires: [],
  },
  'teachers.manage': {
    section: 'staff',
    label: "O'qituvchi qo'shish, tahrirlash va holatini o'zgartirish",
    defaultRoles: [D],
    requires: ['teachers.view'],
  },
  'employees.view': {
    section: 'staff',
    label: "Xodimlar ro'yxati va kartasi",
    defaultRoles: [D],
    requires: [],
  },
  'employees.manage': {
    section: 'staff',
    label: "Xodim qo'shish, tahrirlash va bloklash",
    defaultRoles: [D],
    requires: ['employees.view'],
  },
  'employees.invite': {
    section: 'staff',
    label: 'Telegram orqali xodim taklif qilish',
    defaultRoles: [D, A],
    requires: [],
  },

  // Izohlar
  'comments.write': {
    section: 'comments',
    label: 'Izoh yozish',
    defaultRoles: [D, A],
    requires: [],
  },
  'comments.delete': {
    section: 'comments',
    label: "Boshqalarning izohini tahrirlash va o'chirish",
    defaultRoles: [],
    requires: ['comments.write'],
  },

  // Sozlamalar
  'settings.reference': {
    section: 'settings',
    label: "Kurslar, xonalar, dam olish kunlari va sabablar ro'yxatlari",
    defaultRoles: [D, A],
    requires: [],
  },
  'courses.create': {
    section: 'settings',
    label: "Kurs ochish va to'lov turini tanlash",
    defaultRoles: [D],
    requires: ['settings.reference'],
  },
  'settings.branches': {
    section: 'settings',
    label: 'Filiallar',
    defaultRoles: [D],
    requires: [],
  },
  'settings.payment': {
    section: 'settings',
    label: "To'lov sozlamalari (filial qismi)",
    defaultRoles: [D],
    requires: [],
  },
  'settings.telegram-groups': {
    section: 'settings',
    label: 'Telegram guruhlarini tasdiqlash va sozlash',
    defaultRoles: [D],
    requires: [],
  },
  'settings.absence-pause': {
    section: 'settings',
    label: "Avtomatik pauza sozlamasini ko'rish",
    defaultRoles: [D],
    requires: [],
  },
  'telegram.announce': {
    section: 'settings',
    label: "Telegram guruhlariga e'lon yuborish va botni guruhdan uzish",
    defaultRoles: [],
    requires: ['settings.telegram-groups'],
  },
  'settings.company': {
    section: 'settings',
    label: 'Kompaniya darajasidagi sozlamalar',
    defaultRoles: [],
    requires: [],
  },
  'settings.archive': {
    section: 'settings',
    label: "Arxiv: tiklash va butunlay o'chirish",
    defaultRoles: [],
    requires: [],
    danger: 'irreversible',
  },

  // Bosh sahifa
  'dashboard.view': {
    section: 'home',
    label: 'Bosh sahifa paneli',
    defaultRoles: [D, A, K],
    requires: [],
  },

  // DaF ilovasi va media
  'daf.activity': {
    section: 'daf',
    label: "DaF ilovasi: markaz bo'yicha faollik",
    defaultRoles: [D, A],
    requires: [],
  },
  'media.view': {
    section: 'daf',
    label: 'Media',
    defaultRoles: [D, A],
    requires: [],
  },
} as const satisfies Record<string, PermissionDef>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/**
 * The capabilities a set of role ids holds by default. The CEO holds every
 * capability; a student or a role-less account holds none.
 */
export function defaultKeysForRoles(
  roleIds: readonly number[],
): Set<PermissionKey> {
  if (roleIds.includes(ROLE_ID.CEO)) return new Set(PERMISSION_KEYS);
  const keys = new Set<PermissionKey>();
  for (const key of PERMISSION_KEYS) {
    const def: PermissionDef = PERMISSIONS[key];
    if (def.defaultRoles.some((role) => roleIds.includes(role))) keys.add(key);
  }
  return keys;
}
