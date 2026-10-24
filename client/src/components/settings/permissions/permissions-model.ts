import { roleTitle } from "@/components/profile/profile-roles";
import type { Translate } from "@/components/notifications/notification-view";
import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import { planToggle, withRequirements, type DepGraph } from "@/lib/permission-deps";
import type { PermissionKey } from "@/lib/permission-keys";
import type {
  CatalogEntry,
  PermissionHistoryItem,
  PermissionsOverview,
  RolePermissionChange,
} from "./permissions-types";

/**
 * Everything the «Ruxsatlar» page decides, as pure functions over
 * `GET /permissions` (spec §8, ADR-0087). The components only draw these,
 * so the tests here cover what the CEO reads: locks, dots, counts and the
 * confirm text.
 *
 * Every sentence here takes an optional last `t` (identity by default, so the
 * Uzbek output is unchanged). Capability labels, section names and lock
 * reasons come from the server catalog: they are data and are never passed
 * through `t`. Role names go through the shared `roleTitle`.
 */

export const DANGER_WARNING = msg(
  "Bu amal pulga ta'sir qiladi yoki qaytarib bo'lmaydi. Ishonchingiz komilmi?",
);

export function depGraph(o: PermissionsOverview): DepGraph {
  return Object.fromEntries(o.catalog.map((e) => [e.key, { requires: e.requires }]));
}

function entryOf(o: PermissionsOverview, key: PermissionKey): CatalogEntry {
  const entry = o.catalog.find((e) => e.key === key);
  if (!entry) throw new Error(`permissions-model: "${key}" is not in the catalog`);
  return entry;
}

function roleLabel(o: PermissionsOverview, roleId: number, t: Translate): string {
  const role = o.roles.find((r) => r.id === roleId);
  return role ? roleTitle({ id: role.id, name: role.label }, t) : t("Rol {id}", { id: roleId });
}

function heldBy(o: PermissionsOverview, roleId: number): Set<string> {
  return new Set(o.granted[roleId] ?? []);
}

export interface CellState {
  granted: boolean;
  locked: boolean;
  lockReason: string | null;
  /** The yellow dot: differs from the catalog default. */
  differs: boolean;
  /** The red mark. */
  danger: "money" | "irreversible" | null;
}

export function cellState(o: PermissionsOverview, key: PermissionKey, roleId: number): CellState {
  const entry = entryOf(o, key);
  const granted = heldBy(o, roleId).has(key);
  const locked = !entry.allowedRoles.includes(roleId);
  return {
    granted,
    locked,
    lockReason: locked ? (entry.lockReasons[roleId] ?? null) : null,
    differs: granted !== entry.defaultRoles.includes(roleId),
    danger: entry.danger,
  };
}

/** «N tadan M tasi»: N counts only the cells the role may hold (locked ones are not offered). */
export function sectionCount(
  o: PermissionsOverview,
  section: string,
  roleId: number,
): { on: number; total: number } {
  const open = o.catalog.filter((e) => e.section === section && e.allowedRoles.includes(roleId));
  const held = heldBy(o, roleId);
  return { on: open.filter((e) => held.has(e.key)).length, total: open.length };
}

/** «—» when every key of the section is locked for the role: nothing to count. */
export function sectionCountLabel(c: { on: number; total: number }, t: Translate = interpolate): string {
  if (c.total === 0) return "—";
  return t("{total} tadan {on} tasi", { total: c.total, on: c.on });
}

export interface ConfirmPlan {
  roleId: number;
  key: PermissionKey;
  on: boolean;
  /** Keys that change with it (requirements on, dependents off). */
  also: PermissionKey[];
  /** The `PUT /permissions/roles/:roleId` body's `changes`. */
  changes: RolePermissionChange[];
  /** Only when granting. Taking a money capability away moves no money. */
  danger: boolean;
  /**
   * Why the server would refuse this change (a locked cell, or a grant that
   * pulls in a locked key), in the server's words; the page shows it instead
   * of the confirm button. `changes` and `also` are empty then.
   */
  refusal: string | null;
}

/** The server's `lockedMessage` (role-permissions.service.ts), word for word in Uzbek. */
function lockedMessage(
  o: PermissionsOverview,
  key: PermissionKey,
  roleId: number,
  on: boolean,
  t: Translate,
): string {
  const e = entryOf(o, key);
  const params = { name: e.label, role: roleLabel(o, roleId, t), reason: e.lockReasons[roleId] ?? "" };
  return on
    ? t("{name}: {role} uchun yoqib bo'lmaydi — {reason}", params)
    : t("{name}: {role} uchun o'zgartirib bo'lmaydi — {reason}", params);
}

/** Mirrors the server's `assertAllowed`: the key itself, and for a grant everything it requires. */
function refusalOf(
  o: PermissionsOverview,
  roleId: number,
  key: PermissionKey,
  on: boolean,
  t: Translate,
): string | null {
  if (!entryOf(o, key).allowedRoles.includes(roleId)) {
    return lockedMessage(o, key, roleId, on, t);
  }
  if (!on) return null;
  for (const pulled of withRequirements([key], depGraph(o))) {
    if (!entryOf(o, pulled as PermissionKey).allowedRoles.includes(roleId)) {
      return lockedMessage(o, pulled as PermissionKey, roleId, true, t);
    }
  }
  return null;
}

export function planCellToggle(
  o: PermissionsOverview,
  roleId: number,
  key: PermissionKey,
  on: boolean,
  t: Translate = interpolate,
): ConfirmPlan {
  const refusal = refusalOf(o, roleId, key, on, t);
  if (refusal) return { roleId, key, on, also: [], changes: [], danger: false, refusal };
  // The graph is the catalog, so every key planToggle returns is a PermissionKey.
  const also = planToggle(heldBy(o, roleId), key, on, depGraph(o)).also as PermissionKey[];
  const keys = [key, ...also];
  return {
    roleId,
    key,
    on,
    also,
    changes: keys.map((k) => ({ key: k, granted: on })),
    // Only granting is risky: taking a money capability away moves no money.
    danger: on && keys.some((k) => entryOf(o, k).danger !== null),
    refusal: null,
  };
}

export interface ConfirmCopy {
  title: string;
  alsoTitle: string | null;
  alsoLabels: string[];
  warning: string | null;
  confirm: string;
}

export function confirmCopy(o: PermissionsOverview, plan: ConfirmPlan, t: Translate = interpolate): ConfirmCopy {
  const also = new Set<string>(plan.also);
  const params = { role: roleLabel(o, plan.roleId, t), name: entryOf(o, plan.key).label };
  return {
    title: plan.on ? t("{role}: «{name}» yoqilsinmi?", params) : t("{role}: «{name}» o'chirilsinmi?", params),
    alsoTitle: also.size === 0 ? null : plan.on ? t("Birga yoqiladi") : t("Birga o'chadi"),
    alsoLabels: o.catalog.filter((e) => also.has(e.key)).map((e) => e.label),
    warning: plan.danger ? t(DANGER_WARNING) : null,
    confirm: plan.on ? t("Yoqish") : t("O'chirib qo'yish"),
  };
}

/** «Boshlang'ich holatga qaytarish»: every cell that differs from the default, as it will become. */
export function resetCopy(
  o: PermissionsOverview,
  roleId: number,
  t: Translate = interpolate,
): { title: string; lines: string[] } {
  const held = heldBy(o, roleId);
  return {
    title: t("{role}: boshlang'ich holatga qaytarilsinmi?", { role: roleLabel(o, roleId, t) }),
    lines: o.catalog
      .filter((e) => held.has(e.key) !== e.defaultRoles.includes(roleId))
      .map((e) => (held.has(e.key) ? t("«{name}» o'chadi", { name: e.label }) : t("«{name}» yoqiladi", { name: e.label }))),
  };
}

/** One «O'zgarishlar tarixi» row's text; date and author are drawn beside it. */
export function historyLine(o: PermissionsOverview, item: PermissionHistoryItem, t: Translate = interpolate): string {
  const parts = item.changes.map((c) => {
    const entry = o.catalog.find((e) => e.key === c.key);
    const name = entry ? `«${entry.label}»` : t("o'chirilgan imkoniyat");
    return c.granted ? t("{name} yoqildi", { name }) : t("{name} o'chirildi", { name });
  });
  return `${roleLabel(o, item.roleId, t)}: ${parts.join(", ")}`;
}
