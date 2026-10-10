import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { whereUserMayAct } from '../auth/blocked-user';
import { PermissionKey, defaultKeysForRoles } from './permission-catalog';

/** Who the caller is now, and what they may do. */
export interface CallerAccess {
  readonly roleIds: readonly number[];
  readonly roleNames: readonly string[];
  readonly keys: ReadonlySet<PermissionKey>;
}

const NO_ACCESS: CallerAccess = {
  roleIds: [],
  roleNames: [],
  keys: new Set(),
};

/**
 * The caller's capabilities (spec §3, §7.3). Roles come from the DATABASE,
 * never the token: a token keeps its roles for an hour (ADR-0028), and a role
 * taken away must stop working on the next request. An archived or blocked
 * account (`whereUserMayAct()`) holds nothing, even while Redis is down.
 *
 * Stage 1: capabilities are the catalog's defaults for the roles held. Stage
 * 2 adds the CEO's overrides here, and only here.
 */
@Injectable()
export class PermissionsService {
  // ponytail: per-process cache with a 10 s lifetime; add a Redis version key
  // when several server instances must agree sooner (spec §7.3).
  static readonly CACHE_MS = 10_000;
  private readonly cache = new Map<
    number,
    { at: number; access: CallerAccess }
  >();

  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: number): Promise<CallerAccess> {
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && now - hit.at < PermissionsService.CACHE_MS) return hit.access;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...whereUserMayAct() },
      select: {
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    const roles = user?.roles.map((r) => r.role) ?? [];
    const access: CallerAccess =
      roles.length === 0
        ? NO_ACCESS
        : {
            roleIds: roles.map((r) => r.id),
            roleNames: roles.map((r) => r.name),
            keys: defaultKeysForRoles(roles.map((r) => r.id)),
          };
    this.cache.set(userId, { at: now, access });
    return access;
  }

  async has(userId: number, key: PermissionKey): Promise<boolean> {
    return (await this.forUser(userId)).keys.has(key);
  }
}
