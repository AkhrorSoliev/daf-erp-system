import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_KEY, RouteAccessMeta } from './access.decorators';
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
