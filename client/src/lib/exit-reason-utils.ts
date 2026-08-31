/**
 * Mirror of server/src/common/exit-reason-comment.ts — keep the two in sync.
 *
 * "Boshqa sabab" is the catch-all in the exit-reason picker: choosing it says
 * the student left but nothing about why, so the comment box becomes required.
 * Matched exactly (not by prefix) so "Boshqa guruhga ko'chdi" stays optional.
 *
 * The backend also sends `requiresComment` on each reason; we prefer that flag
 * when present and fall back to the name match for callers that fetch reasons
 * with an older shape.
 */
export const EXIT_REASON_COMMENT_MIN_LENGTH = 5;

const CATCH_ALL_REASON_NAMES = new Set(["boshqa sabab", "boshqa", "other"]);

export interface ExitReasonOption {
  id: string;
  name: string;
  requiresComment?: boolean;
}

export function exitReasonRequiresComment(
  reason: ExitReasonOption | undefined | null,
): boolean {
  if (!reason) return false;
  if (typeof reason.requiresComment === "boolean") return reason.requiresComment;
  return CATCH_ALL_REASON_NAMES.has(
    reason.name.trim().toLowerCase().replace(/\s+/g, " "),
  );
}

/** True when the picked reason needs a comment and the typed one is too short. */
export function isExitReasonCommentMissing(
  reasons: ExitReasonOption[] | undefined,
  reasonId: string | null,
  comment: string,
): boolean {
  const picked = reasons?.find((r) => r.id === reasonId);
  if (!exitReasonRequiresComment(picked)) return false;
  return comment.trim().length < EXIT_REASON_COMMENT_MIN_LENGTH;
}
