import { ROLE_ID } from '../auth/role-ids';
import {
  RoleOverride,
  effectiveForRoles,
  keysForRole,
} from './effective-permissions';
import { PERMISSION_KEYS, defaultKeysForRoles } from './permission-catalog';

const sorted = (keys: Iterable<string>): string[] => [...keys].sort();
const A = ROLE_ID.ADMINISTRATOR;
const K = ROLE_ID.CASHIER;
const T = ROLE_ID.TEACHER;

describe('effective capabilities (spec §3, ADR-0086)', () => {
  it('gives the CEO every capability, whatever is stored', () => {
    const revoke: RoleOverride[] = [
      { roleId: ROLE_ID.CEO, key: 'students.list', granted: false },
    ];
    expect(effectiveForRoles([ROLE_ID.CEO], revoke).size).toBe(
      PERMISSION_KEYS.length,
    );
    expect(effectiveForRoles([T, ROLE_ID.CEO], []).size).toBe(
      PERMISSION_KEYS.length,
    );
  });

  it('equals the catalog defaults for every role combination while nothing is stored', () => {
    const roles = [2, 3, 4, 5, 6];
    for (let mask = 0; mask < 1 << roles.length; mask++) {
      const held = roles.filter((_, i) => mask & (1 << i));
      expect({ held, keys: sorted(effectiveForRoles(held, [])) }).toEqual({
        held,
        keys: sorted(defaultKeysForRoles(held)),
      });
    }
  });

  it('adds up the roles of a multi-role account, each with its own changes', () => {
    const overrides: RoleOverride[] = [
      { roleId: K, key: 'students.list', granted: true },
      { roleId: A, key: 'students.sms', granted: false },
    ];
    expect(sorted(effectiveForRoles([A, K], overrides))).toEqual(
      sorted(
        new Set([...keysForRole(A, overrides), ...keysForRole(K, overrides)]),
      ),
    );
  });

  it('applies a grant to the role it names and to no other', () => {
    const grant: RoleOverride[] = [
      { roleId: K, key: 'students.list', granted: true },
    ];
    expect(keysForRole(K, grant).has('students.list')).toBe(true);
    expect(sorted(keysForRole(A, grant))).toEqual(
      sorted(defaultKeysForRoles([A])),
    );
  });

  it('revokes a default', () => {
    const keys = keysForRole(A, [
      { roleId: A, key: 'students.sms', granted: false },
    ]);
    expect(keys.has('students.sms')).toBe(false);
    expect(keys.has('students.details')).toBe(true);
  });

  it('ignores a key the catalog does not know', () => {
    expect(
      sorted(keysForRole(A, [{ roleId: A, key: 'old.key', granted: true }])),
    ).toEqual(sorted(defaultKeysForRoles([A])));
  });

  it('ignores a grant outside allowedRoles', () => {
    expect(
      keysForRole(T, [{ roleId: T, key: 'students.list', granted: true }]).has(
        'students.list',
      ),
    ).toBe(false);
    expect(
      keysForRole(K, [{ roleId: K, key: 'leads.setup', granted: true }]).has(
        'leads.setup',
      ),
    ).toBe(false);
  });

  it('drops what a revoked requirement held up', () => {
    const keys = keysForRole(A, [
      { roleId: A, key: 'students.details', granted: false },
    ]);
    for (const dependent of [
      'students.details',
      'students.sms',
      'contracts.manage',
      'payments.correct',
      'debt.write-off',
    ]) {
      expect({ dependent, held: keys.has(dependent as never) }).toEqual({
        dependent,
        held: false,
      });
    }
    expect(keys.has('students.profile')).toBe(true);
  });

  it('drops a grant whose requirement the role lacks', () => {
    expect(
      keysForRole(K, [{ roleId: K, key: 'refunds.cancel', granted: true }]).has(
        'refunds.cancel',
      ),
    ).toBe(false);
  });

  it('gives a student or a role-less account nothing', () => {
    const grant: RoleOverride[] = [
      { roleId: ROLE_ID.STUDENT, key: 'students.list', granted: true },
    ];
    expect(effectiveForRoles([ROLE_ID.STUDENT], grant).size).toBe(0);
    expect(effectiveForRoles([], grant).size).toBe(0);
  });
});
