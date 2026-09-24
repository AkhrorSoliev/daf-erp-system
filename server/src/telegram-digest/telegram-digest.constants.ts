/** Every run drops rows older than this, delivered or not (ADR-0025). */
export const DIGEST_ROW_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Same portal link the instant debt notice used. */
export const STUDENT_PORTAL_URL = 'https://student.dafzentrum.uz';

/**
 * Longest reason text one digest line carries. Clipping upstream keeps every
 * line far below Telegram's 4096-character limit.
 */
export const DIGEST_REASON_MAX_CHARS = 300;
