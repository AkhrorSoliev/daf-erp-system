/** A lead got its «called» mark for the first time (`PATCH /leads/:id/called`). */
export const LEAD_CALLED = 'lead.called';

export interface LeadCalledPayload {
  leadId: string;
  companyId: number;
  /** Who marked it: the automatic task closes in their name. */
  userId: number;
}
