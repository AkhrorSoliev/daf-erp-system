/**
 * Emitted after the transaction that archived a group commits. Listeners:
 * `NotificationResolverService` (the group's lesson alerts can never be acted
 * on any more, whichever day they were sent).
 */
export const GROUP_DELETED = 'group.deleted';

export interface GroupDeletedPayload {
  companyId: number;
  groupId: string;
}
