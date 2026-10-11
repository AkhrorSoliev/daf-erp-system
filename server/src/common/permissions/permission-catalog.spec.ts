import { ROLE_ID } from '../auth/role-ids';
import {
  EDITABLE_ROLE_IDS,
  LOCK,
  PERMISSION_KEYS,
  PERMISSION_SECTIONS,
  PermissionKey,
  StaffRoleId,
  defaultKeysForRoles,
  isPermissionKey,
  permissionDef,
} from './permission-catalog';

/*
 * The allowedRoles table of the plan «Ruxsatlar 2-bosqich» (ADR-0086), copied
 * as data. Columns: key, default roles, allowed roles, lock reason per role
 * outside the allowed ones. D = Branch Director, A = Administrator,
 * K = Cashier, T = Teacher. The rows are in the client's key order
 * (`client/src/lib/permission-keys.ts`).
 */
type Col = 'D' | 'A' | 'K' | 'T';
type Locks = Partial<Record<Col, keyof typeof LOCK>>;
type Row = [PermissionKey, string, string, Locks];

const COL: Record<Col, StaffRoleId> = {
  D: ROLE_ID.BRANCH_DIRECTOR,
  A: ROLE_ID.ADMINISTRATOR,
  K: ROLE_ID.CASHIER,
  T: ROLE_ID.TEACHER,
};
const ALL = (lock: keyof typeof LOCK): Locks => ({
  D: lock,
  A: lock,
  K: lock,
  T: lock,
});

const TABLE: Row[] = [
  ['students.list', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.profile', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.details', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.manage', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.enroll', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.sms', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.initial-balance', '', 'DAK', { T: 'OWN_GROUPS' }],
  ['contracts.manage', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['groups.view', 'DAT', 'DAKT', {}],
  ['groups.manage', 'DA', 'DAK', { T: 'UNTESTED' }],
  ['lessons.change', 'DA', 'DAK', { T: 'UNTESTED' }],
  ['lessons.change-delete', 'D', 'DAK', { T: 'UNTESTED' }],
  ['attendance.mark', 'DAT', 'DAKT', {}],
  ['attendance.fix', 'DA', 'DAK', { T: 'UNTESTED' }],
  ['leads.view', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['leads.manage', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['leads.setup', 'DA', 'DA', { K: 'COMPANY', T: 'COMPANY' }],
  ['leads.forms', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['outreach.view', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['calls.log', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['mock.view', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['mock.manage', 'DA', 'DA', { K: 'COMPANY', T: 'COMPANY' }],
  ['mock.payments', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['payments.view', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['payments.create', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['payments.correct', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['debt.view', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['debt.promise', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['balance.withdraw', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['refunds.create', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['refunds.hand-over', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['refunds.cancel', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['debt.write-off', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['balance.adjust', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['money.undo', '', 'DAK', { T: 'OWN_GROUPS' }],
  ['payments.gateway-log', '', '', ALL('BRANCH')],
  ['expenses.view', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['expenses.manage', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['cash.manage', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['salary.view', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['salary.rate', 'D', 'D', { A: 'UNTESTED', K: 'UNTESTED', T: 'UNTESTED' }],
  ['salary.pay', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['salary.rate-edit', '', '', ALL('COMPANY')],
  ['salary.close', '', '', ALL('COMPANY')],
  ['reports.finance', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['reports.payments', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['reports.students', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['reports.leads', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['teachers.view', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['teachers.manage', 'D', 'DA', { K: 'UNTESTED', T: 'UNTESTED' }],
  ['employees.view', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['employees.manage', 'D', 'DA', { K: 'UNTESTED', T: 'UNTESTED' }],
  ['employees.invite', 'DA', 'DA', { K: 'UNTESTED', T: 'UNTESTED' }],
  ['comments.write', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['comments.delete', '', '', ALL('BRANCH')],
  ['settings.reference', 'DA', 'DA', { K: 'COMPANY', T: 'COMPANY' }],
  ['courses.create', 'D', 'DA', { K: 'COMPANY', T: 'COMPANY' }],
  ['settings.branches', 'D', 'DAK', { T: 'NO_PAGE' }],
  ['settings.payment', 'D', 'DAK', { T: 'NO_PAGE' }],
  [
    'settings.telegram-groups',
    'D',
    'D',
    { A: 'GROUP_REPORT', K: 'GROUP_REPORT', T: 'GROUP_REPORT' },
  ],
  ['settings.absence-pause', 'D', 'DAK', { T: 'NO_PAGE' }],
  ['telegram.announce', '', '', ALL('COMPANY')],
  ['settings.company', '', '', ALL('COMPANY')],
  ['settings.archive', '', '', ALL('BRANCH')],
  ['dashboard.view', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['daf.activity', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['media.view', 'DA', 'DAK', { T: 'NO_PAGE' }],
];

const roleIds = (cols: string): number[] =>
  [...cols].map((c) => COL[c as Col]).sort();
const sorted = (ids: readonly number[]): number[] => [...ids].sort();

describe('permission catalog', () => {
  it('names every capability section.word or section.word-word', () => {
    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z]+\.[a-z]+(-[a-z]+)*$/);
    }
  });

  it('has 67 capabilities in 14 sections, none of them empty', () => {
    expect(PERMISSION_KEYS).toHaveLength(67);
    expect(PERMISSION_SECTIONS).toHaveLength(14);
    for (const section of PERMISSION_SECTIONS) {
      expect(
        PERMISSION_KEYS.some(
          (key) => permissionDef(key).section === section.key,
        ),
      ).toBe(true);
    }
  });

  it("lists every capability of the table, in the client's order", () => {
    expect(TABLE.map(([key]) => key)).toEqual(PERMISSION_KEYS);
  });

  it('requires only capabilities that exist, and never in a circle', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const walk = (key: PermissionKey, path: string[]) => {
      if (done.has(key)) return;
      if (visiting.has(key)) {
        throw new Error(`cycle: ${[...path, key].join(' -> ')}`);
      }
      visiting.add(key);
      for (const needed of permissionDef(key).requires) {
        expect(isPermissionKey(needed)).toBe(true);
        walk(needed as PermissionKey, [...path, key]);
      }
      visiting.delete(key);
      done.add(key);
    };
    for (const key of PERMISSION_KEYS) walk(key, []);
  });

  it('gives every default role the capabilities its defaults require', () => {
    for (const key of PERMISSION_KEYS) {
      for (const role of permissionDef(key).defaultRoles) {
        for (const needed of permissionDef(key).requires) {
          expect({
            key,
            role,
            needed,
            held: permissionDef(needed as PermissionKey).defaultRoles.includes(
              role,
            ),
          }).toEqual({ key, role, needed, held: true });
        }
      }
    }
  });

  it('keeps English words out of the labels and lock reasons the CEO will read', () => {
    const english =
      /\b(view|manage|create|edit|delete|list|report|settings|dashboard|salary|payment|lead|group|student|teacher|cash)\b/i;
    for (const key of PERMISSION_KEYS) {
      expect(permissionDef(key).label).not.toMatch(english);
    }
    for (const section of PERMISSION_SECTIONS) {
      expect(section.label).not.toMatch(english);
    }
    for (const reason of Object.values(LOCK)) {
      expect(reason).not.toMatch(english);
    }
  });

  it('gives the CEO every capability, whatever else they hold', () => {
    expect(defaultKeysForRoles([ROLE_ID.CEO]).size).toBe(67);
    expect(defaultKeysForRoles([ROLE_ID.TEACHER, ROLE_ID.CEO]).size).toBe(67);
  });

  it('gives a teacher only their groups and attendance', () => {
    expect([...defaultKeysForRoles([ROLE_ID.TEACHER])].sort()).toEqual([
      'attendance.mark',
      'groups.view',
    ]);
  });

  it('gives a cashier what the cashier screens use today', () => {
    expect([...defaultKeysForRoles([ROLE_ID.CASHIER])].sort()).toEqual([
      'dashboard.view',
      'debt.promise',
      'debt.view',
      'payments.create',
      'payments.view',
      'refunds.hand-over',
      'students.profile',
    ]);
  });

  it('adds up the roles of a multi-role account', () => {
    const adminCashier = defaultKeysForRoles([
      ROLE_ID.ADMINISTRATOR,
      ROLE_ID.CASHIER,
    ]);
    expect(adminCashier.has('students.list')).toBe(true);
    expect(adminCashier.has('payments.create')).toBe(true);
    expect(adminCashier.has('salary.view')).toBe(false);
  });

  it('gives a student or a role-less account nothing', () => {
    expect(defaultKeysForRoles([ROLE_ID.STUDENT]).size).toBe(0);
    expect(defaultKeysForRoles([]).size).toBe(0);
  });
});

describe('who the CEO may give a capability to (spec §6)', () => {
  it('edits the four staff roles in the page column order', () => {
    expect(EDITABLE_ROLE_IDS).toEqual([
      ROLE_ID.BRANCH_DIRECTOR,
      ROLE_ID.ADMINISTRATOR,
      ROLE_ID.CASHIER,
      ROLE_ID.TEACHER,
    ]);
  });

  it.each(TABLE)(
    '%s: defaults, allowed roles and locks',
    (key, dflt, allowed, locks) => {
      const def = permissionDef(key);
      expect(sorted(def.defaultRoles)).toEqual(roleIds(dflt));
      expect(sorted(def.allowedRoles)).toEqual(roleIds(allowed));
      expect(def.lockReasons).toEqual(
        Object.fromEntries(
          Object.entries(locks).map(([col, lock]) => [
            COL[col as Col],
            LOCK[lock],
          ]),
        ),
      );
    },
  );

  it('keeps every default role inside the allowed roles', () => {
    for (const key of PERMISSION_KEYS) {
      const def = permissionDef(key);
      for (const role of def.defaultRoles) {
        expect({ key, role, allowed: def.allowedRoles.includes(role) }).toEqual(
          { key, role, allowed: true },
        );
      }
    }
  });

  it('gives exactly the editable roles outside allowedRoles one lock reason', () => {
    for (const key of PERMISSION_KEYS) {
      const def = permissionDef(key);
      for (const role of EDITABLE_ROLE_IDS) {
        expect({
          key,
          role,
          locked: def.lockReasons[role] !== undefined,
        }).toEqual({ key, role, locked: !def.allowedRoles.includes(role) });
      }
      for (const role of Object.keys(def.lockReasons).map(Number)) {
        expect(EDITABLE_ROLE_IDS).toContain(role);
      }
    }
  });

  it('closes allowedRoles under requires', () => {
    for (const key of PERMISSION_KEYS) {
      const def = permissionDef(key);
      for (const role of def.allowedRoles) {
        for (const needed of def.requires) {
          expect({
            key,
            role,
            needed,
            allowed: permissionDef(
              needed as PermissionKey,
            ).allowedRoles.includes(role),
          }).toEqual({ key, role, needed, allowed: true });
        }
      }
    }
  });

  it('allows a teacher only their groups and attendance (spec §4.4)', () => {
    expect(
      PERMISSION_KEYS.filter((key) =>
        permissionDef(key).allowedRoles.includes(ROLE_ID.TEACHER),
      ).sort(),
    ).toEqual(['attendance.mark', 'groups.view']);
  });

  it('counts 97 locked cells, 65 keys with a lock and 7 CEO-only keys', () => {
    const locks = PERMISSION_KEYS.map(
      (key) => Object.keys(permissionDef(key).lockReasons).length,
    );
    expect(locks.reduce((sum, n) => sum + n, 0)).toBe(97);
    expect(locks.filter((n) => n > 0)).toHaveLength(65);
    expect(
      PERMISSION_KEYS.filter(
        (key) => permissionDef(key).allowedRoles.length === 0,
      ),
    ).toEqual([
      'payments.gateway-log',
      'salary.rate-edit',
      'salary.close',
      'comments.delete',
      'telegram.announce',
      'settings.company',
      'settings.archive',
    ]);
  });

  it('knows its own keys and nothing else', () => {
    expect(isPermissionKey('contracts.manage')).toBe(true);
    expect(isPermissionKey('nope.key')).toBe(false);
    expect(isPermissionKey('toString')).toBe(false);
    expect(permissionDef('contracts.manage').requires).toEqual([
      'students.details',
    ]);
  });

  it('shows the financial reports only together with salaries (CEO, 11.10)', () => {
    expect(permissionDef('reports.finance').requires).toEqual(['salary.view']);
  });
});
