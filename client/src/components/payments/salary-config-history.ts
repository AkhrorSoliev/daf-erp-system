import { tashkentNow } from "@/lib/tashkent-time";

/**
 * Reading `GET /salary/config-history/:userId` — the SCD2 trail behind one
 * employee's salary rates.
 *
 * Two things the caller must not re-derive by hand:
 *
 * - Dates on the wire are Tashkent midnights stored as UTC instants, so
 *   01.06.2026 arrives as `2026-05-31T19:00:00Z`. Formatting through the
 *   browser's own zone shifts the day for every reader outside Tashkent, so
 *   every date here goes through `tashkentNow`, the one converter the client
 *   already uses for schedule logic.
 * - `effectiveTo` is EXCLUSIVE: the server closes a version by stamping it
 *   with the NEXT version's start. The last day a rate actually applied is
 *   therefore the day BEFORE `effectiveTo`.
 */

export type SalaryTypeCode =
  | "PERCENTAGE"
  | "FIXED_PER_STUDENT"
  | "FIXED_MONTHLY";

export interface SalaryConfigVersion {
  id: string;
  configId: string;
  salaryType: SalaryTypeCode;
  value: number;
  /** Tashkent midnight, ISO instant. Inclusive. */
  effectiveFrom: string;
  /** Tashkent midnight, ISO instant. EXCLUSIVE. Null while still in force. */
  effectiveTo: string | null;
  createdAt: string;
  config: {
    groupId: string | null;
    group: { id: string; name: string } | null;
  };
  changedBy: { id: number; firstName: string; lastName: string } | null;
}

export interface SalaryConfigHistoryGroup {
  configId: string;
  /** "Umumiy" for the company-wide rate, otherwise the group's name. */
  label: string;
  groupId: string | null;
  versions: SalaryConfigVersion[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-05-31T19:00:00Z` → `"01.06.2026"` (the Tashkent calendar day). */
function tashkentDayLabel(iso: string): string {
  const [year, month, day] = tashkentNow(new Date(iso)).dateStr.split("-");
  return `${day}.${month}.${year}`;
}

/**
 * The version in force for one config: the open one. More than one open row
 * is not supposed to exist, but if a write ever leaves two behind, the later
 * start is the one the accrual lookup would pick — so show that, rather than
 * whichever happened to be first in the array.
 */
export function currentVersionFor(
  configId: string,
  versions: SalaryConfigVersion[],
): SalaryConfigVersion | null {
  let current: SalaryConfigVersion | null = null;
  for (const v of versions) {
    if (v.configId !== configId || v.effectiveTo !== null) continue;
    if (!current || v.effectiveFrom > current.effectiveFrom) current = v;
  }
  return current;
}

/** Human-readable span of one version, in Tashkent days. */
export function effectivePeriodLabel(version: SalaryConfigVersion): string {
  const from = tashkentDayLabel(version.effectiveFrom);
  if (version.effectiveTo === null) return `${from} dan hozirgacha`;

  const lastDayMs = new Date(version.effectiveTo).getTime() - DAY_MS;
  if (lastDayMs < new Date(version.effectiveFrom).getTime()) {
    // Replaced with the same start date — it never covered a single day.
    return `${from} — amal qilmagan`;
  }
  return `${from} – ${tashkentDayLabel(new Date(lastDayMs).toISOString())}`;
}

/**
 * Split a user's versions per config. A teacher can hold a company-wide rate
 * AND a per-group override at the same time; a flat list interleaves them by
 * date and reads as if the rate flip-flopped.
 */
export function groupVersionsByConfig(
  versions: SalaryConfigVersion[],
): SalaryConfigHistoryGroup[] {
  const byConfig = new Map<string, SalaryConfigHistoryGroup>();

  for (const v of versions) {
    let group = byConfig.get(v.configId);
    if (!group) {
      group = {
        configId: v.configId,
        groupId: v.config.groupId,
        label: v.config.groupId ? (v.config.group?.name ?? "Guruh") : "Umumiy",
        versions: [],
      };
      byConfig.set(v.configId, group);
    }
    group.versions.push(v);
  }

  for (const group of byConfig.values()) {
    group.versions.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  }

  return [...byConfig.values()].sort((a, b) => {
    if (!a.groupId && b.groupId) return -1;
    if (a.groupId && !b.groupId) return 1;
    return a.label.localeCompare(b.label);
  });
}
