import { ROLE_ID } from '../auth/role-ids';
import { ADMIN_PERMISSIONS } from './permission-catalog.admin';
import { MONEY_PERMISSIONS } from './permission-catalog.money';
import { PEOPLE_PERMISSIONS } from './permission-catalog.people';
import type { PermissionDef } from './permission-catalog.types';

export {
  EDITABLE_ROLE_IDS,
  LOCK,
  PERMISSION_SECTIONS,
  type LockReason,
  type PermissionDef,
  type PermissionSection,
  type StaffRoleId,
} from './permission-catalog.types';

/**
 * Every capability ("imkoniyat") a staff role can hold — the single source of
 * truth (spec docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md,
 * §6 and §10). A role answers "who is this?" (portal, rank, branch, own
 * groups); a capability answers "what may they do?".
 *
 * The data is split by section into `permission-catalog.people.ts`,
 * `permission-catalog.money.ts` and `permission-catalog.admin.ts`; the shapes
 * are in `permission-catalog.types.ts`. Import from this file only.
 *
 * `defaultRoles` is today's behaviour. The CEO changes a role's capabilities
 * on the «Ruxsatlar» page within `allowedRoles` (ADR-0087); the CEO holds
 * every capability, always. A new capability needs `allowedRoles` and
 * `lockReasons` too: `permission-catalog.spec.ts` and
 * `permission-allowed-roles.spec.ts` check them.
 */
export const PERMISSIONS = {
  ...PEOPLE_PERMISSIONS,
  ...MONEY_PERMISSIONS,
  ...ADMIN_PERMISSIONS,
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
  return Object.hasOwn(PERMISSIONS, key);
}

export function permissionDef(key: PermissionKey): PermissionDef {
  return PERMISSIONS[key];
}

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
