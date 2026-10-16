/** A lead got its «called» mark for the first time (`PATCH /leads/:id/called`). */
export const LEAD_CALLED = 'lead.called';

export interface LeadCalledPayload {
  leadId: string;
  companyId: number;
  /** Who marked it: the automatic task closes in their name. */
  userId: number;
}

/**
 * A lead's owner changed (ADR-0093): claimed, given, released or expired.
 * Emitted after the commit by `LeadOwnershipService.emit`.
 */
export const LEAD_OWNER_CHANGED = 'lead.owner.changed';

export interface LeadOwnerChangedPayload {
  leadId: string;
  companyId: number;
  kind: 'CLAIM' | 'ASSIGN' | 'RELEASE' | 'EXPIRE';
  fromUserId: number | null;
  toUserId: number | null;
  /** Null when the system took the lead back. */
  actorId: number | null;
  leadName: string;
}
