import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import { ROLE_NAME_BY_ID } from '../auth/role-ids';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_KEY, RouteAccessMeta } from './access.decorators';
import { RoleOverride, effectiveForRoles } from './effective-permissions';
import { PermissionKey } from './permission-catalog';
import type { CallerAccess, PermissionsService } from './permissions.service';
import { AccessLike, AccessSummary, accessSummary } from './route-access';

/**
 * Spec helpers for controller specs: a controller's guard test asserts the
 * marker a route carries and the roles it admits by default — what
 * `reflector.get(ROLES_KEY, …)` and `RolesGuard.canActivate` used to show.
 */
export function routeAccess(
  controller: Type<unknown>,
  method: string,
): AccessLike {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`${controller.name}.${method} is not a method`);
  }
  if (
    Reflect.getMetadata(IS_PUBLIC_KEY, handler) ||
    Reflect.getMetadata(IS_PUBLIC_KEY, controller)
  ) {
    return { kind: 'public' };
  }
  const meta = (Reflect.getMetadata(ACCESS_KEY, handler) ??
    Reflect.getMetadata(ACCESS_KEY, controller)) as RouteAccessMeta | undefined;
  return meta ?? { kind: 'none' };
}

/** The role names a route admits with the catalog's defaults, sorted. */
export function defaultRolesOf(
  controller: Type<unknown>,
  method: string,
): AccessSummary {
  return accessSummary(routeAccess(controller, method));
}

/**
 * A `PermissionsService` stand-in for unit specs: the caller holds `roleIds`
 * with the catalog defaults plus `opts.overrides` (the CEO's changes). With
 * `opts.userId` set, only that user holds them and any other user holds
 * nothing — so a spec can prove a check reads the right caller. Plain
 * functions, no `jest.fn`: this file is compiled with the application, where
 * Jest's globals do not exist.
 */
export function fakePermissions(
  roleIds: number[],
  opts?: { userId?: number; overrides?: RoleOverride[] },
): PermissionsService {
  const access: CallerAccess = {
    roleIds,
    roleNames: roleIds.map((id) => ROLE_NAME_BY_ID[id]),
    keys: effectiveForRoles(roleIds, opts?.overrides ?? []),
  };
  const nobody: CallerAccess = { roleIds: [], roleNames: [], keys: new Set() };
  const accessOf = (userId: number): CallerAccess =>
    opts?.userId === undefined || userId === opts.userId ? access : nobody;
  return {
    forUser: (userId: number) => Promise.resolve(accessOf(userId)),
    has: (userId: number, key: PermissionKey) =>
      Promise.resolve(accessOf(userId).keys.has(key)),
    invalidateAll: () => undefined,
  } as unknown as PermissionsService;
}
