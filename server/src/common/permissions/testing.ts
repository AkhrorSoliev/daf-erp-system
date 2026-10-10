import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import { ROLE_NAME_BY_ID } from '../auth/role-ids';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_KEY, RouteAccessMeta } from './access.decorators';
import { PermissionKey, defaultKeysForRoles } from './permission-catalog';
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
 * A `PermissionsService` stand-in for unit specs: every caller holds
 * `roleIds`, with the catalog's default capabilities. Plain functions, no
 * `jest.fn`: this file is compiled with the application, where Jest's
 * globals do not exist.
 */
export function fakePermissions(roleIds: number[]): PermissionsService {
  const access: CallerAccess = {
    roleIds,
    roleNames: roleIds.map((id) => ROLE_NAME_BY_ID[id]),
    keys: defaultKeysForRoles(roleIds),
  };
  return {
    forUser: () => Promise.resolve(access),
    has: (_userId: number, key: PermissionKey) =>
      Promise.resolve(access.keys.has(key)),
  } as unknown as PermissionsService;
}
