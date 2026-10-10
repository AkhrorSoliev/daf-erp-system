import { ROLE_NAME_BY_ID } from '../auth/role-ids';
import { PERMISSIONS, PermissionDef } from './permission-catalog';

/**
 * What a route admits by default, written the way `@Roles(...)` used to say
 * it: `'PUBLIC'`, `'ANY'` (any signed-in account), `'NONE'` (no marker at all:
 * `PermissionGuard` refuses it, and no snapshot row ever says so) or a sorted
 * list of role names. The equivalence spec compares this with the snapshot of
 * `main` taken before the conversion (`route-access.snapshot.json`).
 */
export type AccessSummary = 'PUBLIC' | 'ANY' | 'NONE' | string[];

/** The shape both the route inventory and the decorator metadata share. */
export interface AccessLike {
  kind: string;
  keys?: readonly string[];
}

export const STAFF_ROLE_NAMES = [
  'Administrator',
  'Branch Director',
  'CEO',
  'Cashier',
  'Teacher',
];

export function accessSummary(access: AccessLike): AccessSummary {
  switch (access.kind) {
    case 'public':
      return 'PUBLIC';
    case 'anyUser':
      return 'ANY';
    case 'none':
      return 'NONE';
    case 'student':
      return ['Student'];
    case 'anyStaff':
      return [...STAFF_ROLE_NAMES];
    case 'can': {
      const names = new Set<string>(['CEO']);
      for (const key of access.keys ?? []) {
        const def = (PERMISSIONS as Record<string, PermissionDef>)[key];
        if (!def) throw new Error(`Unknown capability "${key}"`);
        for (const role of def.defaultRoles) names.add(ROLE_NAME_BY_ID[role]);
      }
      return [...names].sort();
    }
    default:
      throw new Error(`Unknown access kind "${access.kind}"`);
  }
}
