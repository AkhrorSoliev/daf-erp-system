import { TelegramDigestItemRow } from './telegram-digest-payloads';

export interface DedupedRow<
  R extends TelegramDigestItemRow = TelegramDigestItemRow,
> {
  /** The row whose content is shown: the latest of its key. */
  row: R;
  /** Every queued row this entry stands for, shown row included. */
  ids: string[];
}

function isLater(a: TelegramDigestItemRow, b: TelegramDigestItemRow): boolean {
  const diff = a.createdAt.getTime() - b.createdAt.getTime();
  return diff > 0 || (diff === 0 && a.id > b.id);
}

/**
 * Collapses rows that share `category` + `relatedEntityId` to the latest one
 * (spec: "faqat eng oxirgisi ko'rsatiladi"). Rows without a relatedEntityId
 * are never merged. The merged-away ids travel with the survivor so the crons
 * delete or mark them together with the line that represents them.
 */
export function dedupRows<R extends TelegramDigestItemRow>(
  rows: R[],
): DedupedRow<R>[] {
  const byKey = new Map<string, DedupedRow<R>>();
  const entries: DedupedRow<R>[] = [];
  for (const row of rows) {
    if (!row.relatedEntityId) {
      entries.push({ row, ids: [row.id] });
      continue;
    }
    const key = `${row.category}:${row.relatedEntityId}`;
    const existing = byKey.get(key);
    if (!existing) {
      const entry = { row, ids: [row.id] };
      byKey.set(key, entry);
      entries.push(entry);
      continue;
    }
    existing.ids.push(row.id);
    if (isLater(row, existing.row)) existing.row = row;
  }
  return entries.sort((a, b) => (isLater(a.row, b.row) ? 1 : -1));
}
