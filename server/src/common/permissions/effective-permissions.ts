import { ROLE_ID } from '../auth/role-ids';
import {
  EDITABLE_ROLE_IDS,
  PERMISSIONS,
  PERMISSION_KEYS,
  PermissionKey,
  StaffRoleId,
  defaultKeysForRoles,
  isPermissionKey,
  permissionDef,
} from './permission-catalog';
import { stabilize } from './permission-deps';

/** One stored `RolePermission` row: the CEO's change to one role's capability. */
export interface RoleOverride {
  readonly roleId: number;
  readonly key: string;
  readonly granted: boolean;
}

/**
 * One role's capabilities: the catalog defaults, then the CEO's changes for
 * that role, then dependency stabilisation (spec §5). A key the catalog no
 * longer knows, or a grant outside `allowedRoles`, is ignored — the page
 * cannot store one, but a row written before a catalog change can exist.
 */
export function keysForRole(
  roleId: StaffRoleId,
  overrides: readonly RoleOverride[],
): Set<PermissionKey> {
  const keys = new Set<string>(defaultKeysForRoles([roleId]));
  for (const change of overrides) {
    if (change.roleId !== roleId || !isPermissionKey(change.key)) continue;
    if (!change.granted) keys.delete(change.key);
    else if (permissionDef(change.key).allowedRoles.includes(roleId)) {
      keys.add(change.key);
    }
  }
  // Only catalog keys went in, and stabilize only removes.
  return stabilize(keys, PERMISSIONS) as Set<PermissionKey>;
}

/**
 * What an account may do (spec §3): the CEO holds every capability; anyone
 * else holds the union of `keysForRole` over the staff roles they hold (each
 * set is already stable, so the union is too); a student or a role-less
 * account holds nothing.
 */
export function effectiveForRoles(
  roleIds: readonly number[],
  overrides: readonly RoleOverride[],
): Set<PermissionKey> {
  if (roleIds.includes(ROLE_ID.CEO)) return new Set(PERMISSION_KEYS);
  const keys = new Set<PermissionKey>();
  for (const roleId of EDITABLE_ROLE_IDS) {
    if (!roleIds.includes(roleId)) continue;
    for (const key of keysForRole(roleId, overrides)) keys.add(key);
  }
  return keys;
}
