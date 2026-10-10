import type { GroupStatus } from '@prisma/client';

/**
 * The statuses a group takes new students in. The admin door
 * (`StudentEnrollmentService.enrollToGroup`), lead conversion and the bot
 * (ADR-0080) read this one list; a completed, cancelled or archived group
 * takes nobody.
 */
export const ENROLLABLE_GROUP_STATUSES: GroupStatus[] = [
  'ACTIVE',
  'FORMING',
  'PAUSED',
];

export function isEnrollableGroupStatus(
  status: GroupStatus | null | undefined,
): boolean {
  return status != null && ENROLLABLE_GROUP_STATUSES.includes(status);
}
