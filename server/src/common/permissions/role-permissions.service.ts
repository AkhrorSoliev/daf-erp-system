import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../entity-history';
import { rethrowAsConflict } from '../transaction-conflict';
import { RoleOverride, keysForRole } from './effective-permissions';
import {
  EDITABLE_ROLE_IDS,
  PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_SECTIONS,
  PermissionKey,
  StaffRoleId,
  permissionDef,
} from './permission-catalog';
import { withRequirements } from './permission-deps';
import { PermissionsService } from './permissions.service';
import {
  CatalogEntry,
  PermissionHistoryPage,
  PermissionsOverview,
  ROLE_LABELS,
  RoleKeys,
} from './role-permissions.types';

/** `EntityHistory.entityType` of a save on the page; `entityId` is the role id. */
export const ROLE_PERMISSION_HISTORY_TYPE = 'RolePermission';

const NOT_EDITABLE = "Bu rolning ruxsatlarini o'zgartirib bo'lmaydi";
const DUPLICATE_KEY = 'Bir imkoniyat ikki marta yuborildi';

const CATALOG_ORDER = new Map<string, number>(
  PERMISSION_KEYS.map((key, index) => [key, index]),
);

function assertEditable(roleId: number): asserts roleId is StaffRoleId {
  if (!(EDITABLE_ROLE_IDS as readonly number[]).includes(roleId)) {
    throw new BadRequestException(NOT_EDITABLE);
  }
}

/** «<label>: <role> uchun <verb> bo'lmaydi — <reason>» for a key the role may not hold. */
function lockedMessage(
  key: PermissionKey,
  roleId: StaffRoleId,
  verb: string,
): string {
  const def = permissionDef(key);
  return `${def.label}: ${ROLE_LABELS[roleId]} uchun ${verb} bo'lmaydi — ${def.lockReasons[roleId]}`;
}

/**
 * Refuses a change outside the role's `allowedRoles`: the key itself (on or
 * off), and, for a grant, every key it pulls in through `requires`. A page
 * built on `planToggle` never sends one, and a hand-made request must not
 * be able to: `planToggle(on)` does not look at locks. Turning a key off
 * pulls out only keys the role holds, and a role holds only allowed keys, so
 * the key's own check covers that direction.
 */
function assertWithinAllowedRoles(
  roleId: StaffRoleId,
  key: PermissionKey,
  granted: boolean,
): void {
  if (!permissionDef(key).allowedRoles.includes(roleId)) {
    throw new BadRequestException(
      lockedMessage(key, roleId, granted ? 'yoqib' : "o'zgartirib"),
    );
  }
  if (!granted) return;
  for (const pulled of withRequirements([key], PERMISSIONS)) {
    if (!permissionDef(pulled as PermissionKey).allowedRoles.includes(roleId)) {
      throw new BadRequestException(
        lockedMessage(pulled as PermissionKey, roleId, 'yoqib'),
      );
    }
  }
}

/**
 * Refuses a set in which an «on» key needs one that is off. Equivalent to
 * `stabilize(keys) ≠ keys` (Task 2), but names the pair for the message.
 */
function assertRequirementsMet(keys: ReadonlySet<PermissionKey>): void {
  for (const key of PERMISSION_KEYS) {
    if (!keys.has(key)) continue;
    const missing = permissionDef(key).requires.find(
      (required) => !keys.has(required as PermissionKey),
    );
    if (missing) {
      throw new BadRequestException(
        `«${permissionDef(key).label}» uchun «${permissionDef(missing as PermissionKey).label}» ham yoqilgan bo'lishi kerak`,
      );
    }
  }
}

function catalogEntry(key: PermissionKey): CatalogEntry {
  const def = permissionDef(key);
  return {
    key,
    section: def.section,
    label: def.label,
    requires: [...def.requires] as PermissionKey[],
    defaultRoles: [...def.defaultRoles],
    allowedRoles: [...def.allowedRoles],
    lockReasons: { ...def.lockReasons },
    danger: def.danger ?? null,
  };
}

function changesOf(
  values: Prisma.JsonValue,
): { key: string; granted: boolean }[] {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    return [];
  }
  return Object.entries(values)
    .map(([key, granted]) => ({ key, granted: granted === true }))
    .sort(
      (a, b) =>
        (CATALOG_ORDER.get(a.key) ?? Infinity) -
          (CATALOG_ORDER.get(b.key) ?? Infinity) || a.key.localeCompare(b.key),
    );
}

/**
 * The «Ruxsatlar» page (spec §7.7, ADR-0086). Only the CEO's DIFFERENCES from
 * the catalog default are stored: a row equal to the default is deleted, so
 * a later change of `defaultRoles` reaches every company that never touched
 * that key. Each save runs in one Serializable transaction with one
 * `EntityHistory` row listing every key whose effective state changed, and
 * clears this process's capability cache after the commit (other processes
 * follow within `PermissionsService.CACHE_MS`).
 */
@Injectable()
export class RolePermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entityHistory: EntityHistoryService,
    private readonly permissions: PermissionsService,
  ) {}

  async overview(companyId: number): Promise<PermissionsOverview> {
    const [roles, rows] = await Promise.all([
      this.prisma.role.findMany({
        where: { id: { in: [...EDITABLE_ROLE_IDS] } },
        select: { id: true },
      }),
      this.prisma.rolePermission.findMany({
        where: { companyId },
        select: { roleId: true, key: true, granted: true },
      }),
    ]);
    const seeded = new Set(roles.map((r) => r.id));
    const granted = {} as Record<StaffRoleId, PermissionKey[]>;
    for (const roleId of EDITABLE_ROLE_IDS) {
      granted[roleId] = [
        ...keysForRole(
          roleId,
          rows.filter((r) => r.roleId === roleId),
        ),
      ].sort();
    }
    return {
      sections: PERMISSION_SECTIONS.map(({ key, label }) => ({ key, label })),
      roles: EDITABLE_ROLE_IDS.filter((id) => seeded.has(id)).map((id) => ({
        id,
        label: ROLE_LABELS[id],
      })),
      catalog: PERMISSION_KEYS.map(catalogEntry),
      granted,
    };
  }

  /**
   * `changes` is the toggle plus every dependency the page brought with it
   * (`planToggle`). Refused before the transaction: a role the page does not
   * edit, a key sent twice, a change outside `allowedRoles` (the key or any
   * key a grant pulls in). Refused inside it, against the stored rows: a
   * result with an unmet requirement.
   */
  async updateRole(
    companyId: number,
    roleId: number,
    changes: { key: PermissionKey; granted: boolean }[],
    changedById: number,
  ): Promise<RoleKeys> {
    assertEditable(roleId);
    const seen = new Set<string>();
    for (const { key, granted } of changes) {
      if (seen.has(key)) throw new BadRequestException(DUPLICATE_KEY);
      seen.add(key);
      assertWithinAllowedRoles(roleId, key, granted);
    }
    return this.write(companyId, roleId, changedById, (before) => {
      const next = new Set(before);
      for (const { key, granted } of changes) {
        if (granted) next.add(key);
        else next.delete(key);
      }
      assertRequirementsMet(next);
      return next;
    });
  }

  /** «Boshlang'ich holatga qaytarish»: the role's catalog defaults again. */
  async resetRole(
    companyId: number,
    roleId: number,
    changedById: number,
  ): Promise<RoleKeys> {
    assertEditable(roleId);
    const defaults = keysForRole(roleId, []);
    return this.write(companyId, roleId, changedById, () => defaults);
  }

  async history(
    companyId: number,
    page: number,
    pageSize: number,
  ): Promise<PermissionHistoryPage> {
    const where = { entityType: ROLE_PERMISSION_HISTORY_TYPE, companyId };
    const [rows, total] = await Promise.all([
      this.prisma.entityHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          entityId: true,
          createdAt: true,
          newValues: true,
          changedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.entityHistory.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        roleId: Number(row.entityId),
        changedBy: row.changedBy,
        changes: changesOf(row.newValues),
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * One save: read the role's rows, let `plan` decide the new effective set,
   * then store only what differs from the default. Rows of keys the catalog
   * no longer knows are left alone (spec §7.2: ignored, not destroyed).
   */
  private async write(
    companyId: number,
    roleId: StaffRoleId,
    changedById: number,
    plan: (before: ReadonlySet<PermissionKey>) => Set<PermissionKey>,
  ): Promise<RoleKeys> {
    const next = await this.prisma
      .$transaction(
        async (tx) => {
          const rows: RoleOverride[] = await tx.rolePermission.findMany({
            where: { companyId, roleId },
            select: { roleId: true, key: true, granted: true },
          });
          const before = keysForRole(roleId, rows);
          const after = plan(before);
          const stored = new Map(rows.map((r) => [r.key, r.granted]));
          const toDelete: PermissionKey[] = [];

          for (const key of PERMISSION_KEYS) {
            const want = after.has(key);
            const current = stored.get(key);
            if (want === permissionDef(key).defaultRoles.includes(roleId)) {
              if (current !== undefined) toDelete.push(key);
            } else if (current !== want) {
              await tx.rolePermission.upsert({
                where: { companyId_roleId_key: { companyId, roleId, key } },
                create: {
                  companyId,
                  roleId,
                  key,
                  granted: want,
                  updatedById: changedById,
                },
                update: { granted: want, updatedById: changedById },
              });
            }
          }
          if (toDelete.length > 0) {
            await tx.rolePermission.deleteMany({
              where: { companyId, roleId, key: { in: toDelete } },
            });
          }

          const changed = PERMISSION_KEYS.filter(
            (key) => before.has(key) !== after.has(key),
          );
          if (changed.length > 0) {
            await this.entityHistory.recordUpdate({
              entityType: ROLE_PERMISSION_HISTORY_TYPE,
              entityId: roleId,
              oldValues: Object.fromEntries(
                changed.map((key) => [key, before.has(key)]),
              ),
              newValues: Object.fromEntries(
                changed.map((key) => [key, after.has(key)]),
              ),
              changedById,
              companyId,
              tx,
            });
          }
          return after;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      // A second CEO tab saving the same role at once: 409, never a silent
      // retry on top of a state the CEO did not see.
      .catch((err: unknown) => rethrowAsConflict(err, { duplicate: true }));

    this.permissions.invalidateAll();
    return { roleId, granted: [...next].sort() };
  }
}
