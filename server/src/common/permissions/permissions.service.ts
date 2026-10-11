import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { whereUserMayAct } from '../auth/blocked-user';
import { ROLE_ID } from '../auth/role-ids';
import { RoleOverride, effectiveForRoles } from './effective-permissions';
import {
  EDITABLE_ROLE_IDS,
  PermissionKey,
  isPermissionKey,
} from './permission-catalog';

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
 * Capabilities are the catalog defaults of the roles held plus the CEO's
 * changes stored in `RolePermission` (ADR-0087), through `effectiveForRoles`.
 */
@Injectable()
export class PermissionsService {
  // ponytail: per-process cache with a 10 s lifetime; add a Redis version key
  // when several server instances must agree sooner (spec §7.3).
  static readonly CACHE_MS = 10_000;
  private readonly logger = new Logger(PermissionsService.name);
  private readonly cache = new Map<
    number,
    { at: number; access: CallerAccess }
  >();
  /** One load per user at a time: concurrent requests share it. */
  private readonly inflight = new Map<number, Promise<CallerAccess>>();
  /** Bumped by every write, so a load that began before it is not cached. */
  private generation = 0;

  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: number): Promise<CallerAccess> {
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && now - hit.at < PermissionsService.CACHE_MS) return hit.access;
    const pending = this.inflight.get(userId);
    if (pending) return pending;

    const generation = this.generation;
    const load = this.load(userId)
      .then((access) => {
        if (generation === this.generation) {
          this.cache.set(userId, { at: now, access });
        }
        return access;
      })
      .finally(() => {
        if (this.inflight.get(userId) === load) this.inflight.delete(userId);
      });
    this.inflight.set(userId, load);
    return load;
  }

  async has(userId: number, key: PermissionKey): Promise<boolean> {
    return (await this.forUser(userId)).keys.has(key);
  }

  /**
   * Forget every answer in this process. Called after each committed change
   * of `RolePermission`, so the change takes effect on the next request here;
   * other processes follow within `CACHE_MS`.
   */
  invalidateAll(): void {
    this.generation += 1;
    this.cache.clear();
    this.inflight.clear();
  }

  private async load(userId: number): Promise<CallerAccess> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...whereUserMayAct() },
      select: {
        companyId: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    const roles = user?.roles.map((r) => r.role) ?? [];
    if (!user || roles.length === 0) return NO_ACCESS;

    const roleIds = roles.map((r) => r.id);
    const staffRoleIds = EDITABLE_ROLE_IDS.filter((id) => roleIds.includes(id));
    const overrides =
      roleIds.includes(ROLE_ID.CEO) || staffRoleIds.length === 0
        ? []
        : await this.overridesFor(user.companyId, staffRoleIds);
    return {
      roleIds,
      roleNames: roles.map((r) => r.name),
      keys: effectiveForRoles(roleIds, overrides),
    };
  }

  private async overridesFor(
    companyId: number,
    roleIds: number[],
  ): Promise<RoleOverride[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { companyId, roleId: { in: roleIds } },
      select: { roleId: true, key: true, granted: true },
    });
    const unknown = [
      ...new Set(rows.map((r) => r.key).filter((key) => !isPermissionKey(key))),
    ];
    if (unknown.length > 0) {
      this.logger.warn(
        `RolePermission: unknown capability keys ignored: ${unknown.sort().join(', ')}`,
      );
    }
    return rows;
  }
}
