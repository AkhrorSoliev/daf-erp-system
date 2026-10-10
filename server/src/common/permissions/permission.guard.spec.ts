import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_KEY, RouteAccessMeta } from './access.decorators';
import { PermissionGuard, allows } from './permission.guard';
import type { CallerAccess } from './permissions.service';
import { fakePermissions } from './testing';

function contextFor(
  meta: { access?: RouteAccessMeta; isPublic?: boolean },
  user: { id?: number; roles?: string[] } | undefined,
) {
  const handler = () => undefined;
  if (meta.access) Reflect.defineMetadata(ACCESS_KEY, meta.access, handler);
  if (meta.isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  const request = { user };
  return {
    request,
    context: {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => class Plain {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as never,
  };
}

const guardFor = (roleIds: number[]) =>
  new PermissionGuard(new Reflector(), fakePermissions(roleIds));

describe('PermissionGuard', () => {
  it('lets a public route through without asking anyone', async () => {
    const { context } = contextFor({ isPublic: true }, undefined);
    await expect(guardFor([]).canActivate(context)).resolves.toBe(true);
  });

  it('replaces the token roles with the roles in the database', async () => {
    const { context, request } = contextFor(
      { access: { kind: 'anyUser' } },
      { id: 10010, roles: ['CEO'] },
    );
    await guardFor([3]).canActivate(context);
    expect(request.user?.roles).toEqual(['Administrator']);
  });

  it('admits a capability holder and refuses everyone else', async () => {
    const access: RouteAccessMeta = { kind: 'can', keys: ['expenses.view'] };
    const allowed = contextFor({ access }, { id: 1 });
    await expect(guardFor([2]).canActivate(allowed.context)).resolves.toBe(
      true,
    );

    const refused = contextFor({ access }, { id: 2 });
    await expect(guardFor([3]).canActivate(refused.context)).rejects.toThrow(
      new ForbiddenException("Sizga bu amalni bajarishga ruxsat yo'q"),
    );
  });

  it('admits on ANY of the listed capabilities', async () => {
    const access: RouteAccessMeta = {
      kind: 'can',
      keys: ['students.list', 'groups.view'],
    };
    const { context } = contextFor({ access }, { id: 3 });
    await expect(guardFor([4]).canActivate(context)).resolves.toBe(true);
  });

  it('keeps students out of staff routes and staff out of the portal', async () => {
    const staff = contextFor({ access: { kind: 'anyStaff' } }, { id: 4 });
    await expect(guardFor([6]).canActivate(staff.context)).rejects.toThrow(
      ForbiddenException,
    );
    const portal = contextFor({ access: { kind: 'student' } }, { id: 5 });
    await expect(guardFor([1]).canActivate(portal.context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses a route that declares no access at all', async () => {
    const { context } = contextFor({}, { id: 6 });
    await expect(guardFor([1]).canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('tells a blocked account so, on @AnyUser and on @Can routes alike', async () => {
    // forUser() answers with no role for a blocked, archived or deleted
    // account; the message is JwtAuthGuard's, not «no permission».
    const blocked = new ForbiddenException('Hisobingiz bloklangan');
    const anyUser = contextFor({ access: { kind: 'anyUser' } }, { id: 7 });
    await expect(guardFor([]).canActivate(anyUser.context)).rejects.toThrow(
      blocked,
    );
    const can = contextFor(
      { access: { kind: 'can', keys: ['expenses.view'] } },
      { id: 8 },
    );
    await expect(guardFor([]).canActivate(can.context)).rejects.toThrow(
      blocked,
    );
  });

  it('allows() passes @AnyUser only to a caller who holds a role', () => {
    const noRole: CallerAccess = {
      roleIds: [],
      roleNames: [],
      keys: new Set(),
    };
    const student: CallerAccess = {
      ...noRole,
      roleIds: [6],
      roleNames: ['Student'],
    };
    expect(allows({ kind: 'anyUser' }, noRole)).toBe(false);
    expect(allows({ kind: 'anyUser' }, student)).toBe(true);
  });

  it('refuses a non-public route with no signed-in user', async () => {
    const { context } = contextFor({ access: { kind: 'anyUser' } }, undefined);
    await expect(guardFor([1]).canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
