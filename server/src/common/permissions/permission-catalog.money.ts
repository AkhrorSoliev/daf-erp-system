import {
  A,
  D,
  K,
  LOCK,
  T,
  type PermissionDef,
} from './permission-catalog.types';

/**
 * Capabilities of the sections To'lovlar va qarzdorlik, Xarajatlar va kassa,
 * Ish haqi and Hisobotlar. `allowedRoles` and `lockReasons` follow ADR-0087's
 * table; a lock other than OWN_GROUPS names its cause. Every cashier widening
 * here rests on a branch check PR #696 (ADR-0081) added.
 */
export const MONEY_PERMISSIONS = {
  // To'lovlar va qarzdorlik
  'payments.view': {
    section: 'payments',
    label: "Moliya bo'limi: umumiy ma'lumotlar va to'lovlar ro'yxati",
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'payments.create': {
    section: 'payments',
    label: "To'lov qayd qilish",
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // K gets the administrator's 72-hour correction window.
  'payments.correct': {
    section: 'payments',
    label: "To'lovni tuzatish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
    danger: 'money',
  },
  'debt.view': {
    section: 'payments',
    label: 'Qarzdorlik sahifasi',
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'debt.promise': {
    section: 'payments',
    label: "To'lov va'dasini yozish",
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['debt.view'],
  },
  // K: confined by `withdrawals/withdrawals.service.ts` (plan A).
  'balance.withdraw': {
    section: 'payments',
    label: "Balansdagi pulni markaz hisobiga o'tkazish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile'],
    danger: 'money',
  },
  // K: confined by `refunds/refunds-eligibility.service.ts` (plan A).
  'refunds.create': {
    section: 'payments',
    label: "O'quvchiga pul qaytarish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile'],
    danger: 'money',
  },
  'refunds.hand-over': {
    section: 'payments',
    label: "Qaytariladigan pulni o'quvchiga topshirish",
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['debt.view'],
    danger: 'money',
  },
  'refunds.cancel': {
    section: 'payments',
    label: "Pul qaytarish so'rovini bekor qilish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['refunds.create'],
    danger: 'money',
  },
  'debt.write-off': {
    section: 'payments',
    label: 'Qarzni kechirish',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
    danger: 'money',
  },
  // A, K: confined by `transactions/transactions-write.service.ts` and
  // `billing/lesson-billing.service.ts` (plan A).
  'balance.adjust': {
    section: 'payments',
    label: "Balansni qo'lda tuzatish va yechilgan dars pulini qaytarish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
    danger: 'money',
  },
  // D, A, K: confined by `billing/debt-write-off.service.ts` (plan A).
  'money.undo': {
    section: 'payments',
    label: "To'lov, pul qaytarish va qarz kechirishni bekor qilish",
    defaultRoles: [],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
    danger: 'money',
  },
  // GET /gateways/events is UNREVIEWED; PaymentGatewayEvent has no branch.
  'payments.gateway-log': {
    section: 'payments',
    label: "To'lov tizimlari jurnali (Payme, Click)",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.BRANCH,
      [A]: LOCK.BRANCH,
      [K]: LOCK.BRANCH,
      [T]: LOCK.BRANCH,
    },
    requires: ['payments.view'],
  },

  // Xarajatlar va kassa
  // Advances are not listed (`expenses/expenses.service.ts`).
  'expenses.view': {
    section: 'expenses',
    label: "Xarajatlarni ko'rish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // A, K: the advance recipient is checked against the branch
  // (`expenses/expenses.service.ts`, plan A).
  'expenses.manage': {
    section: 'expenses',
    label: "Xarajat kiritish, tahrirlash va o'chirish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['expenses.view'],
    danger: 'money',
  },
  'cash.manage': {
    section: 'expenses',
    label: "Kassa hisoblari va ular orasida o'tkazma",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
    danger: 'money',
  },

  // Ish haqi
  // A, K: payroll reads are confined (BRANCH_SCOPED_BY_PAYROLL, plan A).
  'salary.view': {
    section: 'salary',
    label: "Xodimlar oyligini ko'rish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // `salary/shared/teacher-rate-permission.ts` refuses everyone but the CEO
  // and a Branch Director.
  'salary.rate': {
    section: 'salary',
    label: "O'qituvchiga stavka qo'yish",
    defaultRoles: [D],
    allowedRoles: [D],
    lockReasons: {
      [A]: LOCK.UNTESTED,
      [K]: LOCK.UNTESTED,
      [T]: LOCK.UNTESTED,
    },
    requires: ['salary.view'],
    danger: 'money',
  },
  // A, K: nobody but the CEO pays their own salary
  // (`salary/salary-payment.service.ts`, ADR-0081).
  'salary.pay': {
    section: 'salary',
    label: "Oylik va avans to'lash",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['salary.view'],
    danger: 'money',
  },
  // PATCH /salary/config/:id and POST /salary/config/global are COMPANY_WIDE.
  'salary.rate-edit': {
    section: 'salary',
    label: "Stavkani o'zgartirish va umumiy stavka",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.COMPANY,
      [A]: LOCK.COMPANY,
      [K]: LOCK.COMPANY,
      [T]: LOCK.COMPANY,
    },
    requires: ['salary.view'],
    danger: 'money',
  },
  // CEO only (CEO, 11.10): POST /salary/calculate settles every branch, and
  // `approvePayment` has no payroll scope.
  'salary.close': {
    section: 'salary',
    label: 'Oylikni hisoblash, tasdiqlash, oyni yopish va oylik davri',
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.COMPANY,
      [A]: LOCK.COMPANY,
      [K]: LOCK.COMPANY,
      [T]: LOCK.COMPANY,
    },
    requires: ['salary.view'],
    danger: 'money',
  },

  // Hisobotlar
  // The finance reports show staff salaries (the «Oyliklar» card and sheet),
  // so they come with `salary.view` (CEO, 11.10).
  'reports.finance': {
    section: 'reports',
    label: 'Moliya va marketing hisobotlari',
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['salary.view'],
  },
  'reports.payments': {
    section: 'reports',
    label: "Guruhlar bo'yicha to'lov hisoboti",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // The channel report is a COMPANY_WIDE read, allowed.
  'reports.students': {
    section: 'reports',
    label: "O'quvchilar, davomat va faoliyat hisobotlari",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'reports.leads': {
    section: 'reports',
    label: 'Lidlar hisoboti',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // «Xodimlar KPI» (ADR-0096): in the observation month only the managers see
  // it (CEO, 16.10.2026). `GET /kpi/overview` and `GET /kpi/users/:id` take
  // `@BranchScope()`; `PATCH /kpi/settings` is `@CeoOnly()`.
  'kpi.view': {
    section: 'reports',
    label: "Xodimlar KPI'sini ko'rish",
    defaultRoles: [D],
    allowedRoles: [D],
    lockReasons: {
      [A]: LOCK.LEADERS_ONLY,
      [K]: LOCK.LEADERS_ONLY,
      [T]: LOCK.NO_PAGE,
    },
    requires: [],
  },
} as const satisfies Record<string, PermissionDef>;
