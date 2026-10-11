import { ROLE_ID } from '../auth/role-ids';
import type {
  PermissionKey,
  PermissionSection,
  StaffRoleId,
} from './permission-catalog';

/**
 * The shapes of the «Ruxsatlar» page API (spec §7.7, ADR-0087). The client
 * mirrors them in `client/src/components/settings/permissions/permissions-types.ts`.
 */
export interface CatalogEntry {
  key: PermissionKey;
  section: PermissionSection;
  label: string;
  requires: PermissionKey[];
  defaultRoles: StaffRoleId[];
  allowedRoles: StaffRoleId[];
  /** One reason per editable role outside `allowedRoles`; the page shows it on the lock. */
  lockReasons: Partial<Record<StaffRoleId, string>>;
  danger: 'money' | 'irreversible' | null;
}

export interface PermissionsOverview {
  sections: { key: PermissionSection; label: string }[];
  /** The `Role` rows with an id in `EDITABLE_ROLE_IDS`, in that (column) order. */
  roles: { id: StaffRoleId; label: string }[];
  /** `PERMISSION_KEYS` order. */
  catalog: CatalogEntry[];
  /** What each role holds now: defaults, then this company's overrides, stabilised. */
  granted: Record<StaffRoleId, PermissionKey[]>;
}

export interface RoleKeys {
  roleId: StaffRoleId;
  granted: PermissionKey[];
}

export interface PermissionHistoryItem {
  id: string;
  createdAt: string;
  roleId: number;
  changedBy: { id: number; firstName: string; lastName: string } | null;
  /** Every key whose effective state changed in that save, catalog order. */
  changes: { key: string; granted: boolean }[];
}

export interface PermissionHistoryPage {
  data: PermissionHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** The column headers and the role names in errors (Uzbek, no English). */
export const ROLE_LABELS: Record<StaffRoleId, string> = {
  [ROLE_ID.BRANCH_DIRECTOR]: 'Filial direktori',
  [ROLE_ID.ADMINISTRATOR]: 'Administrator',
  [ROLE_ID.CASHIER]: 'Kassir',
  [ROLE_ID.TEACHER]: "O'qituvchi",
};
