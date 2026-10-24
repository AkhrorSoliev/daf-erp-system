/**
 * Students hear about a group pause at once (ADR-0119, §7; an addition to
 * ADR-0025's instant list). The status service emits this AFTER its
 * transaction commits; `GroupPauseMessagesListener` sends the messages.
 */
export const GROUP_PAUSE_MESSAGE_EVENT = 'group.pause.message';

export type GroupPauseMessageKind =
  /** The group was paused (restart day known or not). */
  | 'PAUSED'
  /** A restart day was set, or changed, while paused. */
  | 'RESUME_DAY'
  /** The group is open again. */
  | 'RESUMED';

export interface GroupPauseMessagePayload {
  kind: GroupPauseMessageKind;
  groupId: string;
  companyId: number;
  /** 'YYYY-MM-DD'; null for PAUSED while the restart day is unknown. */
  resumeDay: string | null;
}
