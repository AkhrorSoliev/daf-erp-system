import { format, isValid, parse } from "date-fns";
import { listParam } from "@/lib/url-filter-params";

export const LEADS_ARCHIVE_SCHEMA = {
  tab: { type: "string" as const, defaultValue: "lidlar" },
  q: { type: "string" as const, defaultValue: "" },
  kim: { type: "array" as const, defaultValue: [] as string[] },
  dan: { type: "string" as const, defaultValue: "" },
  gacha: { type: "string" as const, defaultValue: "" },
  sahifa: { type: "number" as const, defaultValue: 1 },
  soni: { type: "number" as const, defaultValue: 10 },
};

export interface ArchiveFilters {
  tab: string;
  q: string;
  kim: string[];
  dan: string;
  gacha: string;
  sahifa: number;
  soni: number;
}

export type ArchiveTab = "lidlar" | "bolimlar";

export const ARCHIVE_PAGE_SIZES = [10, 20, 30, 40, 50];

export const archiveTab = (raw: string): ArchiveTab =>
  raw === "bolimlar" ? "bolimlar" : "lidlar";

export const archivePageSize = (n: number): number =>
  ARCHIVE_PAGE_SIZES.includes(n) ? n : 10;

export interface ArchiveParams {
  page: number;
  pageSize: number;
  search: string | undefined;
  deletedById: string | undefined;
  startDate: string | undefined;
  endDate: string | undefined;
}

/** The server's query for the open tab; empty filters are left out. */
export function archiveParams(f: ArchiveFilters): ArchiveParams {
  return {
    page: Number.isInteger(f.sahifa) && f.sahifa >= 1 ? f.sahifa : 1,
    pageSize: archivePageSize(f.soni),
    search: f.q.trim() || undefined,
    deletedById: listParam(f.kim),
    startDate: f.dan || undefined,
    endDate: f.gacha || undefined,
  };
}

/** Paging and the tab are not filters. */
export function hasArchiveFilter(f: ArchiveFilters): boolean {
  return f.q.trim() !== "" || f.kim.length > 0 || f.dan !== "" || f.gacha !== "";
}

export function dayToDate(day: string): Date | undefined {
  if (!day) return undefined;
  const d = parse(day, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

export const dateToDay = (d: Date | undefined): string =>
  d ? format(d, "yyyy-MM-dd") : "";
