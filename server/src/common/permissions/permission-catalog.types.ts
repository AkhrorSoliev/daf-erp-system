import { ROLE_ID } from '../auth/role-ids';

/**
 * The shapes of the capability catalog (spec
 * docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md, §6 and §10).
 * The data lives in `permission-catalog.{people,money,admin}.ts`;
 * `permission-catalog.ts` joins it and is the only file other code imports.
 */
export const D = ROLE_ID.BRANCH_DIRECTOR;
export const A = ROLE_ID.ADMINISTRATOR;
export const T = ROLE_ID.TEACHER;
export const K = ROLE_ID.CASHIER;

export type StaffRoleId = typeof D | typeof A | typeof T | typeof K;

/** The roles the CEO edits on the «Ruxsatlar» page, in its column order. */
export const EDITABLE_ROLE_IDS: readonly StaffRoleId[] = [D, A, K, T];

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

/**
 * Why the CEO cannot give a role a capability (spec §6, ADR-0086). The page
 * shows the text beside the lock: Uzbek, no English words.
 *   OWN_GROUPS   — a teacher is narrowed to their own groups only in
 *                  `common/auth/group-branch-scope.ts` and the dashboard
 *                  controller; every other path is branch-wide (spec §4.4).
 *   NO_PAGE      — the teacher portal has no such page.
 *   UNTESTED     — the service assumes a role; the entry names the line.
 *   COMPANY      — a COMPANY_WIDE write (`branch-route-policy.ts`).
 *   BRANCH       — an UNREVIEWED route or a lookup with no branch check.
 *   GROUP_REPORT — approving a Telegram group sends it the 21:00 report.
 */
export const LOCK = {
  OWN_GROUPS: "o'qituvchi faqat o'z guruhlarini ko'radi",
  NO_PAGE: "o'qituvchi saytida bunday sahifa yo'q",
  UNTESTED: 'bu rol uchun kod sinalmagan',
  COMPANY: "butun kompaniyaga ta'sir qiladi",
  BRANCH: 'filial chegarasi hali tekshirilmagan',
  GROUP_REPORT: 'guruhga moliya hisoboti ketadi',
} as const;

export type LockReason = (typeof LOCK)[keyof typeof LOCK];

/**
 * One capability.
 * - `label` is what the CEO reads on the «Ruxsatlar» page.
 * - `defaultRoles` is today's behaviour, route by route.
 * - `allowedRoles` is who the CEO may give it to: always ⊇ `defaultRoles`,
 *   closed under `requires`; empty = the CEO alone.
 * - `lockReasons` names one reason for each editable role outside
 *   `allowedRoles`, and none for a role inside it.
 * - `requires` must also be on for the capability to work.
 * - `danger` marks money moved or an action that cannot be undone.
 */
export interface PermissionDef {
  readonly section: PermissionSection;
  readonly label: string;
  readonly defaultRoles: readonly StaffRoleId[];
  readonly allowedRoles: readonly StaffRoleId[];
  readonly lockReasons: Readonly<Partial<Record<StaffRoleId, LockReason>>>;
  readonly requires: readonly string[];
  readonly danger?: 'money' | 'irreversible';
}
