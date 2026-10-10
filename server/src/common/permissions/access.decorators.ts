import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from './permission-catalog';

/**
 * Every route carries exactly one of these (or `@Public()`); the manifest in
 * `permission-routes.spec.ts` fails the build on a route with none or two.
 * `PermissionGuard` reads the handler's marker first, then the controller's.
 */
export const ACCESS_KEY = 'access';

export type RouteAccessMeta =
  | { readonly kind: 'anyUser' }
  | { readonly kind: 'anyStaff' }
  | { readonly kind: 'student' }
  | { readonly kind: 'can'; readonly keys: readonly PermissionKey[] };

/** Any signed-in account, staff or student; the handler serves the caller's own data. */
export const AnyUser = () =>
  SetMetadata<string, RouteAccessMeta>(ACCESS_KEY, { kind: 'anyUser' });

/**
 * Any staff account (roles 1–5): reference lists every screen needs, the
 * caller's own data, and tasks (whose ladder lives in `tasks/task-policy.ts`).
 */
export const AnyStaff = () =>
  SetMetadata<string, RouteAccessMeta>(ACCESS_KEY, { kind: 'anyStaff' });

/** The student portal (role 6). */
export const StudentOnly = () =>
  SetMetadata<string, RouteAccessMeta>(ACCESS_KEY, { kind: 'student' });

/**
 * Allowed when the caller holds ANY of the listed capabilities. List every
 * screen's capability that calls the route, so turning one screen off never
 * breaks another (spec §7.4). The CEO holds every capability.
 */
export const Can = (first: PermissionKey, ...rest: PermissionKey[]) =>
  SetMetadata<string, RouteAccessMeta>(ACCESS_KEY, {
    kind: 'can',
    keys: [first, ...rest],
  });
