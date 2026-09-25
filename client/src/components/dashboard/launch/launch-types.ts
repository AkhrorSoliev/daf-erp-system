/**
 * `GET /branches/:id/readiness` response — EXACTLY the same shape as the types
 * in `server/src/branches/branch-readiness.ts`. If one changes, so must the
 * other.
 */
export type ReadinessKey =
  | "cashAccount"
  | "bankAccount"
  | "workingHours"
  | "room"
  | "course"
  | "teachers"
  | "teacherRates"
  | "group"
  | "enrollment"
  | "payment"
  | "administrator"
  | "leadSection"
  | "telegramGroup";

export interface ReadinessCheck {
  key: ReadinessKey;
  label: string;
  ok: boolean;
  /** `false` — "Extra": does not affect the card's `launched` state. */
  required: boolean;
  hint: string;
  /** `ceoOnly` — this person cannot be resolved by the viewing director themself (e.g. their rate is CEO-only). */
  details?: { id: number; name: string; ceoOnly?: boolean }[];
}

export interface BranchReadiness {
  branchId: number;
  branchName: string;
  ready: boolean;
  /** A full group + an enrolled student + a payment — the card disappears once this is true. */
  launched: boolean;
  checks: ReadinessCheck[];
}
