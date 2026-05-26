import { MockExamStatus } from '@prisma/client';

/**
 * Allowed forward and backward transitions in the mock-exam lifecycle.
 *
 * Forward path:
 *   REGISTRATION_OPEN → REGISTRATION_CLOSED → GRADING → ANNOUNCED → ARCHIVED
 *
 * Backward exits are limited to reverting the most recent step (so admins can
 * unblock a wrong click without skipping levels):
 *   REGISTRATION_CLOSED → REGISTRATION_OPEN
 *   GRADING → REGISTRATION_CLOSED
 *
 * ANNOUNCED and ARCHIVED are terminal-ish: from ANNOUNCED we only allow
 * ARCHIVED, and ARCHIVED is a dead end. Re-announcing is a future feature
 * and intentionally not modeled here.
 *
 * DRAFT is no longer used — exams open registration immediately on create.
 * The enum value is kept in the Postgres type to avoid an irreversible
 * enum-drop migration, but no code path produces it anymore.
 */
export const MOCK_EXAM_STATUS_TRANSITIONS: Record<
  MockExamStatus,
  MockExamStatus[]
> = {
  DRAFT: [],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED'],
  REGISTRATION_CLOSED: ['GRADING', 'REGISTRATION_OPEN'],
  GRADING: ['ANNOUNCED', 'REGISTRATION_CLOSED'],
  ANNOUNCED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function isValidMockExamStatusTransition(
  from: MockExamStatus,
  to: MockExamStatus,
): boolean {
  if (from === to) return false;
  return MOCK_EXAM_STATUS_TRANSITIONS[from].includes(to);
}
