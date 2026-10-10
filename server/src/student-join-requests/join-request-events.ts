/**
 * A join request's task closed (decided, expired or replaced): its bell rows
 * close too (ADR-0076). Emitted after the commit.
 */
export const JOIN_REQUEST_CLOSED = 'student-join-request.closed';
export interface JoinRequestClosedEvent {
  companyId: number;
  taskId: string;
}

/**
 * A message for the person who asked (ADR-0080, spec §9). `JoinRequestNotifier`
 * in `src/telegram/` sends it and answers `true` when it was delivered;
 * `emitAsync` hands that answer back. `photo` goes with the approval only.
 */
export const JOIN_REQUEST_MESSAGE = 'student-join-request.message';
export interface JoinRequestMessageEvent {
  chatId: string;
  text: string;
  photo: string | null;
}
