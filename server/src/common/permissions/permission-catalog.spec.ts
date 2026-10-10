import { ROLE_ID } from '../auth/role-ids';
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_SECTIONS,
  PermissionDef,
  defaultKeysForRoles,
} from './permission-catalog';

const def = (key: string): PermissionDef =>
  (PERMISSIONS as Record<string, PermissionDef>)[key];

describe('permission catalog', () => {
  it('names every capability section.word or section.word-word', () => {
    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z]+\.[a-z]+(-[a-z]+)*$/);
    }
  });

  it('has 66 capabilities in 14 sections, none of them empty', () => {
    expect(PERMISSION_KEYS).toHaveLength(66);
    expect(PERMISSION_SECTIONS).toHaveLength(14);
    for (const section of PERMISSION_SECTIONS) {
      expect(
        PERMISSION_KEYS.some((key) => def(key).section === section.key),
      ).toBe(true);
    }
  });

  it('requires only capabilities that exist, and never in a circle', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const walk = (key: string, path: string[]) => {
      if (done.has(key)) return;
      if (visiting.has(key)) {
        throw new Error(`cycle: ${[...path, key].join(' -> ')}`);
      }
      visiting.add(key);
      for (const needed of def(key).requires) {
        expect(PERMISSION_KEYS).toContain(needed);
        walk(needed, [...path, key]);
      }
      visiting.delete(key);
      done.add(key);
    };
    for (const key of PERMISSION_KEYS) walk(key, []);
  });

  it('gives every default role the capabilities its defaults require', () => {
    for (const key of PERMISSION_KEYS) {
      for (const role of def(key).defaultRoles) {
        for (const needed of def(key).requires) {
          expect({
            key,
            role,
            needed,
            held: def(needed).defaultRoles.includes(role),
          }).toEqual({ key, role, needed, held: true });
        }
      }
    }
  });

  it('keeps English words out of the labels the CEO will read', () => {
    const english =
      /\b(view|manage|create|edit|delete|list|report|settings|dashboard|salary|payment|lead|group|student|teacher|cash)\b/i;
    for (const key of PERMISSION_KEYS) {
      expect(def(key).label).not.toMatch(english);
    }
    for (const section of PERMISSION_SECTIONS) {
      expect(section.label).not.toMatch(english);
    }
  });

  it('gives the CEO every capability, whatever else they hold', () => {
    expect(defaultKeysForRoles([ROLE_ID.CEO]).size).toBe(66);
    expect(defaultKeysForRoles([ROLE_ID.TEACHER, ROLE_ID.CEO]).size).toBe(66);
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
