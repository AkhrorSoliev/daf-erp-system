import { LeadStatus } from '@prisma/client';
import type { OwnershipChange } from './lead-ownership.service';

/** What a lead restored from the archive is cleared of (ADR-0093). */
export const RELEASED_OWNER = {
  ownerId: null,
  ownedAt: null,
  ownerActedAt: null,
} as const;

/**
 * A lead back from the archive returns to the common pool, whichever door it
 * comes through (the leads archive page, a section restore with its leads, the
 * generic `/archive`). This is the one place that decides it and builds the log
 * row: the caller clears `RELEASED_OWNER` in its own write, calls
 * `LeadOwnershipService.recordChange` in the same transaction and `emit` after
 * the commit. A lead restored as CONVERTED keeps its owner: the KPI is credited
 * to it. `null` = nothing to release.
 */
export function restoreRelease(
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    ownerId: number | null;
  },
  restoredStatus: LeadStatus,
  ctx: { branchId: number | null; companyId: number; actorId: number | null },
): OwnershipChange | null {
  if (lead.ownerId == null || restoredStatus === LeadStatus.CONVERTED) {
    return null;
  }
  return {
    leadId: lead.id,
    leadName: `${lead.firstName} ${lead.lastName}`.trim(),
    branchId: ctx.branchId,
    kind: 'RELEASE',
    fromUserId: lead.ownerId,
    toUserId: null,
    actorId: ctx.actorId,
    reason: 'Arxivdan tiklandi',
    companyId: ctx.companyId,
  };
}
