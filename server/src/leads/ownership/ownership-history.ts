import type { LeadOwnershipKind } from '@prisma/client';

/** The `action` of the lead's history row per change (client: entity-history-utils.ts). */
export const OWNER_HISTORY_ACTION: Record<LeadOwnershipKind, string> = {
  CLAIM: 'LID_BAND_QILINDI',
  ASSIGN: 'LID_BERILDI',
  RELEASE: 'LID_BOSHATILDI',
  EXPIRE: 'LID_QAYTDI',
};

/**
 * Old and new values of the lead's «Tarix» row. `action` and `sabab` sit in
 * `oldValues` as null on purpose: the diff keeps only keys both sides carry
 * (server/CLAUDE.md, «A key missing from oldValues is dropped»).
 */
export function ownerHistoryValues(
  kind: LeadOwnershipKind,
  fromName: string | null,
  toName: string | null,
  reason: string | null,
): {
  oldValues: Record<string, string | null>;
  newValues: Record<string, string | null>;
} {
  return {
    oldValues: { action: null, masul: fromName, sabab: null },
    newValues: {
      action: OWNER_HISTORY_ACTION[kind],
      masul: toName,
      sabab: reason,
    },
  };
}
