import { tashkentDateStr } from '../common/date/tashkent';

/** A `StatusHistory` row of a group, as the backfill reads it. */
export interface GroupStatusRow {
  groupId: string;
  companyId: number;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  changedById: number | null;
  createdAt: Date;
}

export interface PausePlan {
  groupId: string;
  companyId: number;
  startedAt: Date;
  reason: string | null;
  startedById: number | null;
  /** Null while the group is still paused. */
  endedAt: Date | null;
  endedById: number | null;
  /** 'YYYY-MM-DD' the group came back; null for a pause that is open or ended without a restart. */
  resumeOn: string | null;
}

/**
 * Rebuilds the pauses of groups from their status history (ADR-0119, §8):
 * `→ PAUSED` opens one, the next change closes it, and `→ ACTIVE` also names
 * the day the group came back. Pure; rows must belong to groups with no
 * `GroupPause` yet.
 */
export function pausesFromHistory(rows: GroupStatusRow[]): PausePlan[] {
  const byGroup = new Map<string, GroupStatusRow[]>();
  for (const r of rows)
    byGroup.set(r.groupId, [...(byGroup.get(r.groupId) ?? []), r]);

  const plans: PausePlan[] = [];
  for (const list of byGroup.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let open: PausePlan | null = null;
    for (const r of list) {
      if (r.toStatus === 'PAUSED' && !open) {
        open = {
          groupId: r.groupId,
          companyId: r.companyId,
          startedAt: r.createdAt,
          reason: r.reason,
          startedById: r.changedById,
          endedAt: null,
          endedById: null,
          resumeOn: null,
        };
      } else if (open && r.fromStatus === 'PAUSED' && r.toStatus !== 'PAUSED') {
        open.endedAt = r.createdAt;
        open.endedById = r.changedById;
        open.resumeOn =
          r.toStatus === 'ACTIVE' ? tashkentDateStr(r.createdAt) : null;
        plans.push(open);
        open = null;
      }
    }
    if (open) plans.push(open);
  }
  return plans;
}
