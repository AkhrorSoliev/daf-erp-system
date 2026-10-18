export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ArchiveSummary {
  leads: number;
  sections: number;
  archivers: { id: number; name: string }[];
}

/** After a restore: the row leaves the page it was on and the total drops by one. */
export function withoutRow<T extends { id: string }>(
  page: Paged<T> | undefined,
  id: string,
): Paged<T> | undefined {
  // The leads key prefix also holds single-lead details: only paged lists change.
  if (!page || !Array.isArray(page.data) || !page.data.some((r) => r.id === id))
    return page;
  return {
    ...page,
    data: page.data.filter((r) => r.id !== id),
    total: Math.max(0, page.total - 1),
  };
}

export function minusCounts(
  summary: ArchiveSummary | undefined,
  drop: { leads?: number; sections?: number },
): ArchiveSummary | undefined {
  if (!summary) return summary;
  return {
    ...summary,
    leads: Math.max(0, summary.leads - (drop.leads ?? 0)),
    sections: Math.max(0, summary.sections - (drop.sections ?? 0)),
  };
}
