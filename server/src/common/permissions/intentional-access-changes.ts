/**
 * Reviewed differences between what a route admitted before the capability
 * conversion (`route-access.snapshot.json`) and its default access after it.
 * `permission-routes.spec.ts` applies them; every entry says why.
 *
 * Two kinds only (spec 2026-10-05 §7.6):
 * - remove: the role could call the route, but no screen of that role calls
 *   it — the server now refuses what the menu already hid;
 * - add: the caller's own data.
 */
export interface AccessChange {
  add?: string[];
  remove?: string[];
  reason: string;
}

const DEPARTED =
  "Only the «Ketgan o'quvchilar» report calls it; its menu entry is CEO/BD only.";
const ATTENDANCE =
  'Only the «Davomat statistikasi» report calls it; its menu entry is CEO/BD only.';
const NO_SCREEN = 'No screen calls it.';
const OWN_SALARY =
  "The caller's own salary (`@CurrentUser('id')`); a cashier on payroll may read it like any staff member.";

export const INTENTIONAL_ACCESS_CHANGES: Record<string, AccessChange> = {
  'GET /reports/departed-students/by-reason': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/by-status': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/departed-after-change': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/dynamics': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/group-by': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/list': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/reasons': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/summary': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/teacher-change-reasons': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/teacher-changes-list': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/transfer-reasons': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/departed-students/transferred-list': {
    remove: ['Administrator'],
    reason: DEPARTED,
  },
  'GET /reports/attendance-analytics': {
    remove: ['Administrator'],
    reason: ATTENDANCE,
  },
  'GET /reports/attendance-by-course': {
    remove: ['Administrator'],
    reason: ATTENDANCE,
  },
  'GET /reports/attendance-by-group': {
    remove: ['Administrator'],
    reason: ATTENDANCE,
  },
  'GET /reports/teacher-performance': {
    remove: ['Administrator'],
    reason: ATTENDANCE,
  },
  'GET /reports/center-activity': {
    remove: ['Administrator'],
    reason:
      'Only the «Markaz faoliyat statistikasi» report calls it; its menu entry is CEO/BD only.',
  },
  'GET /reports/kpis': { remove: ['Administrator'], reason: NO_SCREEN },
  'GET /reports/group-analytics': {
    remove: ['Administrator'],
    reason: NO_SCREEN,
  },
  'GET /reports/room-utilization': {
    remove: ['Administrator'],
    reason: NO_SCREEN,
  },
  'GET /reports/student-payments': {
    remove: ['Administrator', 'Cashier'],
    reason:
      "Only the «O'quvchi to'lovi» report calls it; its menu entry is CEO/BD only.",
  },
  'GET /reports/student-payments/filter-options': {
    remove: ['Administrator', 'Cashier'],
    reason:
      "Called by the «O'quvchi to'lovi» and «Ketgan o'quvchilar» reports only, both CEO/BD.",
  },
  'GET /transactions': { remove: ['Administrator'], reason: NO_SCREEN },
  'GET /transactions/teacher/:teacherId': {
    remove: ['Administrator'],
    reason: NO_SCREEN,
  },
  'POST /billing/retroactive/:studentId': {
    remove: ['Administrator'],
    reason:
      "A recovery tool with no screen: it re-bills a student's past lessons, which a Branch Director or the CEO starts.",
  },
  'GET /telegram-groups': {
    remove: ['Administrator'],
    reason:
      'Only the «Telegram guruhlar» settings page calls it; that entry is CEO/BD only.',
  },
  'GET /transactions/student/:studentId': {
    remove: ['Cashier'],
    reason:
      "Only «Barcha yozuvlar» in the student's «To'lovlar» tab calls it; a cashier does not see that tab.",
  },
  'GET /transactions/student/:studentId/lesson-trail': {
    remove: ['Cashier'],
    reason: NO_SCREEN,
  },
  'GET /salary/me/accruals': { add: ['Cashier'], reason: OWN_SALARY },
  'GET /salary/me/current-cycle/breakdown': {
    add: ['Cashier'],
    reason: OWN_SALARY,
  },
  'GET /salary/me/monthly': { add: ['Cashier'], reason: OWN_SALARY },
  'GET /salary/me/payments/:id/breakdown': {
    add: ['Cashier'],
    reason: OWN_SALARY,
  },
  'GET /salary/me/summary': { add: ['Cashier'], reason: OWN_SALARY },
};
