/**
 * URL-persisted filter schema for the leads page, shared by the filter bar, the
 * filtered list, and the board client (which decides board-vs-list from it).
 */
export const LEAD_FILTER_SCHEMA = {
  search: { type: "string" as const, defaultValue: "" },
  // Single "Holati" filter merging funnel stage + contact + comment presence.
  // One token at a time (see LEAD_HOLATI_OPTIONS); "all" = no filter.
  holati: { type: "string" as const, defaultValue: "all" },
  sourceId: { type: "string" as const, defaultValue: "all" },
  columnId: { type: "string" as const, defaultValue: "all" },
  startDate: { type: "string" as const, defaultValue: "" },
  endDate: { type: "string" as const, defaultValue: "" },
  page: { type: "number" as const, defaultValue: 1 },
  pageSize: { type: "number" as const, defaultValue: 10 },
};

export interface LeadFilterValues {
  search: string;
  holati: string;
  sourceId: string;
  columnId: string;
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
}

/**
 * Options for the unified "Holati" dropdown. Each maps its URL token to exactly
 * one backend query param so the single control drives stage / contact / comment
 * filtering. Grouped in the dropdown by `group`. Shared by the filter bar (labels)
 * and the list (param translation) so the two never drift.
 */
export interface LeadHolatiOption {
  value: string;
  label: string;
  group: string;
  param: { key: "status" | "called" | "hasComments"; value: string };
}

export const LEAD_HOLATI_GROUPS = ["Bosqich", "Aloqa", "Izoh"] as const;

export const LEAD_HOLATI_OPTIONS: LeadHolatiOption[] = [
  {
    value: "NEW",
    label: "Yangi",
    group: "Bosqich",
    param: { key: "status", value: "NEW" },
  },
  {
    value: "CONVERTED",
    label: "O'quvchiga aylangan",
    group: "Bosqich",
    param: { key: "status", value: "CONVERTED" },
  },
  {
    value: "called",
    label: "Aloqaga chiqilgan",
    group: "Aloqa",
    param: { key: "called", value: "true" },
  },
  {
    value: "uncalled",
    label: "Aloqaga chiqilmagan",
    group: "Aloqa",
    param: { key: "called", value: "false" },
  },
  {
    value: "commented",
    label: "Izoh yozilgan",
    group: "Izoh",
    param: { key: "hasComments", value: "true" },
  },
  {
    value: "uncommented",
    label: "Izohsiz",
    group: "Izoh",
    param: { key: "hasComments", value: "false" },
  },
];

/** True when at least one real filter (not just paging) is set. */
export function leadFiltersActive(f: LeadFilterValues): boolean {
  return (
    f.search !== "" ||
    f.holati !== "all" ||
    f.sourceId !== "all" ||
    f.columnId !== "all" ||
    f.startDate !== "" ||
    f.endDate !== ""
  );
}
