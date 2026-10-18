export interface RestoreColumn {
  id: string;
  name: string;
  sections: { id: string; name: string }[];
}

export interface LeadOrigin {
  columnId: string;
  sectionId: string;
  /** «Ustun · Bo'lim», for the dialog's hint. */
  label: string;
}

export function originOf(lead: {
  section: {
    id: string;
    name: string;
    column: { id: string; name: string } | null;
  } | null;
}): LeadOrigin | null {
  const s = lead.section;
  if (!s?.column) return null;
  return {
    columnId: s.column.id,
    sectionId: s.id,
    label: `${s.column.name} · ${s.name}`,
  };
}

/**
 * Where the restore dialog starts: the old place when it is still on the
 * board, otherwise empty with the old place named. While the board is loading
 * nothing is claimed either way.
 */
export function initialPlace(
  origin: LeadOrigin | null | undefined,
  columns: RestoreColumn[],
  loaded: boolean,
): { columnId: string; sectionId: string; missingLabel: string | null } {
  const empty = { columnId: "", sectionId: "", missingLabel: null };
  if (!origin || !loaded) return empty;
  const column = columns.find((c) => c.id === origin.columnId);
  const section = column?.sections.find((s) => s.id === origin.sectionId);
  if (column && section) {
    return { columnId: column.id, sectionId: section.id, missingLabel: null };
  }
  return { ...empty, missingLabel: origin.label };
}
