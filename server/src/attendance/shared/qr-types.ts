export interface QrSession {
  sessionId: string;
  teacherId: number;
  companyId: number;
  currentToken: string;
  createdAt: string;
  lessonNumber: number | null;
}

export interface QrToken {
  groupId: string;
  date: string;
  sessionId: string;
  teacherId: number;
  companyId: number;
}

/** Maximum QR session lifetime in seconds (2 hours). */
export const SESSION_TTL = 7200;
/** QR token validity in seconds (45s rotation + 5s grace). */
export const TOKEN_TTL = 50;
/** Value returned to the client describing token freshness. */
export const TOKEN_EXPIRES_IN = 45;
