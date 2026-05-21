/**
 * URL-persisted filter schema for the leads page, shared by the filter bar, the
 * filtered list, and the board client (which decides board-vs-list from it).
 */
export const LEAD_FILTER_SCHEMA = {
  search: { type: "string" as const, defaultValue: "" },
  status: { type: "string" as const, defaultValue: "all" },
  sourceId: { type: "string" as const, defaultValue: "all" },
  columnId: { type: "string" as const, defaultValue: "all" },
  startDate: { type: "string" as const, defaultValue: "" },
  endDate: { type: "string" as const, defaultValue: "" },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

export interface LeadFilterValues {
  search: string;
  status: string;
  sourceId: string;
  columnId: string;
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
}

/** True when at least one real filter (not just paging) is set. */
export function leadFiltersActive(f: LeadFilterValues): boolean {
  return (
    f.search !== "" ||
    f.status !== "all" ||
    f.sourceId !== "all" ||
    f.columnId !== "all" ||
    f.startDate !== "" ||
    f.endDate !== ""
  );
}
