import { planToggle, type DepGraph } from "@/lib/permission-deps";
import type { PermissionKey } from "@/lib/permission-keys";
import type {
  CatalogEntry,
  PermissionHistoryItem,
  PermissionsOverview,
  RolePermissionChange,
} from "./permissions-types";

/**
 * Everything the «Ruxsatlar» page decides, as pure functions over
 * `GET /permissions` (spec §8, ADR-0086). The components only draw these,
 * so the tests here cover what the CEO reads: locks, dots, counts and the
 * confirm text.
 */

export const DANGER_WARNING =
  "Bu amal pulni o'zgartiradi yoki uni qaytarib bo'lmaydi. Ishonchingiz komilmi?";

export function depGraph(o: PermissionsOverview): DepGraph {
  return Object.fromEntries(o.catalog.map((e) => [e.key, { requires: e.requires }]));
}

function entryOf(o: PermissionsOverview, key: PermissionKey): CatalogEntry {
  const entry = o.catalog.find((e) => e.key === key);
  if (!entry) throw new Error(`permissions-model: "${key}" is not in the catalog`);
  return entry;
}

function roleLabel(o: PermissionsOverview, roleId: number): string {
  return o.roles.find((r) => r.id === roleId)?.label ?? `Rol ${roleId}`;
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
export function sectionCountLabel(c: { on: number; total: number }): string {
  if (c.total === 0) return "—";
  return `${c.total} tadan ${c.on} tasi`;
}

export interface ConfirmPlan {
  roleId: number;
  key: PermissionKey;
  on: boolean;
  /** Keys that change with it (requirements on, dependents off). */
  also: PermissionKey[];
  /** The `PUT /permissions/roles/:roleId` body's `changes`. */
  changes: RolePermissionChange[];
  danger: boolean;
}

export function planCellToggle(
  o: PermissionsOverview,
  roleId: number,
  key: PermissionKey,
  on: boolean,
): ConfirmPlan {
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
  };
}

export interface ConfirmCopy {
  title: string;
  alsoTitle: "Birga yoqiladi" | "Birga o'chadi" | null;
  alsoLabels: string[];
  warning: string | null;
  confirm: string;
}

export function confirmCopy(o: PermissionsOverview, plan: ConfirmPlan): ConfirmCopy {
  const also = new Set<string>(plan.also);
  const verb = plan.on ? "yoqilsinmi" : "o'chirilsinmi";
  return {
    title: `${roleLabel(o, plan.roleId)}: «${entryOf(o, plan.key).label}» ${verb}?`,
    alsoTitle: also.size === 0 ? null : plan.on ? "Birga yoqiladi" : "Birga o'chadi",
    alsoLabels: o.catalog.filter((e) => also.has(e.key)).map((e) => e.label),
    warning: plan.danger ? DANGER_WARNING : null,
    confirm: plan.on ? "Yoqish" : "O'chirish",
  };
}

/** «Boshlang'ich holatga qaytarish»: every cell that differs from the default, as it will become. */
export function resetCopy(o: PermissionsOverview, roleId: number): { title: string; lines: string[] } {
  const held = heldBy(o, roleId);
  return {
    title: `${roleLabel(o, roleId)}: boshlang'ich holatga qaytarilsinmi?`,
    lines: o.catalog
      .filter((e) => held.has(e.key) !== e.defaultRoles.includes(roleId))
      .map((e) => `«${e.label}» ${held.has(e.key) ? "o'chadi" : "yoqiladi"}`),
  };
}

/** One «O'zgarishlar tarixi» row's text; date and author are drawn beside it. */
export function historyLine(o: PermissionsOverview, item: PermissionHistoryItem): string {
  const parts = item.changes.map((c) => {
    const entry = o.catalog.find((e) => e.key === c.key);
    const name = entry ? `«${entry.label}»` : "o'chirilgan imkoniyat";
    return `${name} ${c.granted ? "yoqildi" : "o'chirildi"}`;
  });
  return `${roleLabel(o, item.roleId)}: ${parts.join(", ")}`;
}
