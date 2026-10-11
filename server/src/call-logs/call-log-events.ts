import type { CallLog } from '@prisma/client';

/** A call log row was written (`CallLogsService.create`; no transaction around it). */
export const CALL_LOG_CREATED = 'call-log.created';

export interface CallLogCreatedPayload {
  callLog: CallLog;
}
