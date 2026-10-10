import type { Branch } from "@/hooks/use-edit-branch";

/** A branch row as `GET /branches`, `GET /branches/:id` and the writes return it. */
export interface BranchApiRow {
  id: number | string;
  name: string;
  address?: string | null;
  phone?: string | null;
  status: string;
  startOfWorkingDay?: string | null;
  endOfWorkingDay?: string | null;
  city?: string | null;
  representativeName?: string | null;
  representativePosition?: string | null;
}

/**
 * The settings screens' view of a branch. The state comes from `status`,
 * never `isActive`: nothing on the server reads that flag.
 */
export function toBranch(row: BranchApiRow): Branch {
  return {
    id: String(row.id),
    name: row.name,
    address: row.address ?? "",
    phone: row.phone ?? "",
    status: row.status,
    startOfWorkingDay: row.startOfWorkingDay ?? "",
    endOfWorkingDay: row.endOfWorkingDay ?? "",
    city: row.city ?? "",
    representativeName: row.representativeName ?? "",
    representativePosition: row.representativePosition ?? "",
  };
}

export interface BranchFormValues {
  name: string;
  address: string;
  phone: string;
  startOfWorkingDay: string;
  endOfWorkingDay: string;
  city: string;
  representativeName: string;
  representativePosition: string;
}

/**
 * Body for `PATCH /branches/:id`. The branch's state is not in it: it changes
 * only through `PATCH /branches/:id/status`, which records history and runs
 * the cascade, and the server refuses `isActive`/`status` here.
 */
export function branchUpdateBody(values: BranchFormValues) {
  return {
    name: values.name,
    address: values.address || undefined,
    phone: values.phone || undefined,
    startOfWorkingDay: values.startOfWorkingDay || undefined,
    endOfWorkingDay: values.endOfWorkingDay || undefined,
    city: values.city.trim() || undefined,
    representativeName: values.representativeName.trim() || undefined,
    representativePosition: values.representativePosition.trim() || undefined,
  };
}
