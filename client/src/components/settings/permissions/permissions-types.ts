import type { PermissionKey } from "@/lib/permission-keys";

/**
 * The CEO's «Ruxsatlar» API (`@CeoOnly()`, ADR-0086). Mirrors
 * `server/src/common/permissions/role-permissions.types.ts`. Role ids are
 * plain numbers here (2 Filial direktori, 3 Administrator, 5 Kassir,
 * 4 O'qituvchi): JSON object keys arrive as strings anyway.
 */
export interface CatalogEntry {
  key: PermissionKey;
  section: string;
  /** What the CEO reads on the page (Uzbek). */
  label: string;
  requires: PermissionKey[];
  defaultRoles: number[];
  /** Roles the capability may be given to; every other editable role is locked. */
  allowedRoles: number[];
  /** A locked role → why (Uzbek, shown next to the lock). */
  lockReasons: Partial<Record<number, string>>;
  /** Moves money or cannot be undone — the red mark. */
  danger: "money" | "irreversible" | null;
}

/** `GET /permissions`. `catalog` is in the server's key order; `roles` in column order. */
export interface PermissionsOverview {
  sections: { key: string; label: string }[];
  roles: { id: number; label: string }[];
  catalog: CatalogEntry[];
  /** Each editable role's effective keys today (defaults + the CEO's changes), sorted. */
  granted: Record<number, PermissionKey[]>;
}

/** `PUT /permissions/roles/:roleId` and `POST …/reset`: the role's keys after the write. */
export interface RoleKeys {
  roleId: number;
  granted: PermissionKey[];
}

/** One item of `PUT /permissions/roles/:roleId`'s `changes`. */
export interface RolePermissionChange {
  key: PermissionKey;
  granted: boolean;
}

export interface PermissionHistoryItem {
  id: string;
  createdAt: string;
  roleId: number;
  changedBy: { id: number; firstName: string; lastName: string } | null;
  /** A string, not `PermissionKey`: a row may name a capability removed since. */
  changes: { key: string; granted: boolean }[];
}

/** `GET /permissions/history`, newest first. */
export interface PermissionHistoryPage {
  data: PermissionHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}
