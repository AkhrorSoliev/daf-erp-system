import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_ID } from '../auth/role-ids';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_KEY, RouteAccessMeta } from './access.decorators';
import { CallerAccess, PermissionsService } from './permissions.service';

export const FORBIDDEN_MESSAGE = "Sizga bu amalni bajarishga ruxsat yo'q";

const STAFF_ROLE_IDS: readonly number[] = [
  ROLE_ID.CEO,
  ROLE_ID.BRANCH_DIRECTOR,
  ROLE_ID.ADMINISTRATOR,
  ROLE_ID.TEACHER,
  ROLE_ID.CASHIER,
];

/** The whole decision, pure: does this caller pass this route's marker? */
export function allows(access: RouteAccessMeta, caller: CallerAccess): boolean {
  switch (access.kind) {
    case 'anyUser':
      // forUser() gives a blocked, archived or deleted account no role at all;
      // every live account (a student included) holds at least one.
      return caller.roleIds.length > 0;
    case 'anyStaff':
      return caller.roleIds.some((id) => STAFF_ROLE_IDS.includes(id));
    case 'student':
      return caller.roleIds.includes(ROLE_ID.STUDENT);
    case 'can':
      return access.keys.some((key) => caller.keys.has(key));
  }
}

/**
 * Registered as an APP_GUARD after `JwtAuthGuard` (so `request.user` exists)
 * and before `BranchScopeGuard`. Two jobs:
 *
 * 1. Replace `request.user.roles` with the roles the DATABASE holds now, so
 *    every later check — `@CurrentUser('roles')`, branch scope, rank rules —
 *    sees the account as it is, not as it was when the token was signed.
 * 2. Check the route's marker (`@Can`, `@AnyStaff`, `@AnyUser`,
 *    `@StudentOnly`) against the caller's capabilities.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id?: number; roles?: string[] } }>();
    const user = request.user;
    // JwtAuthGuard normally refuses first; this is defence in depth.
    if (user?.id == null) throw new ForbiddenException(FORBIDDEN_MESSAGE);

    const caller = await this.permissions.forUser(user.id);
    user.roles = [...caller.roleNames];

    const access = this.reflector.getAllAndOverride<
      RouteAccessMeta | undefined
    >(ACCESS_KEY, targets);
    // Fail closed: a route without a marker is a forgotten route. The
    // manifest in `permission-routes.spec.ts` stops one from being merged.
    if (access && allows(access, caller)) return true;
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }
}
